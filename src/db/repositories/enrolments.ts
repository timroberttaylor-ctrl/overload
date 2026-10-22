import { and, desc, eq, isNull } from 'drizzle-orm';

import { uuid } from '@/core/ids';
import type { Adjustments } from '@/core/overload';
import { PLAN_LABEL, REGION_LABEL, regionAffects, setsUnderPlan, type WeekDecision } from '@/core/planner';

import { enrolments, enrolmentSwaps, exercises, weekPlans } from '../schema';
import type { DB } from '../types';
import { fitScheme, readScheme, schemeForWeek } from '@/core/scheme';
import { getTemplateDetail, phaseForWeek, repsForPhase, setsForPhase, type DayDetail, type ExerciseRow, type ProgramExercise } from './programs';
import { isIntArray, safeJsonParse } from '@/core/json';

export type Enrolment = typeof enrolments.$inferSelect;
export type Swap = typeof enrolmentSwaps.$inferSelect;

export function getActiveEnrolment(db: DB): Enrolment | undefined {
  return db
    .select()
    .from(enrolments)
    .where(and(eq(enrolments.status, 'active'), isNull(enrolments.deletedAt)))
    .orderBy(desc(enrolments.createdAt))
    .get();
}

/** Starts a program. Any currently active program is marked abandoned (its history is kept). */
export function startProgram(db: DB, templateId: string, startedOn: string): Enrolment {
  const tpl = getTemplateDetail(db, templateId);
  if (!tpl) throw new Error(`Unknown program template: ${templateId}`);
  const id = uuid();
  db.transaction((tx) => {
    tx.update(enrolments).set({ status: 'abandoned', updatedAt: Date.now() }).where(eq(enrolments.status, 'active')).run();
    tx.insert(enrolments).values({ id, templateId, startedOn, currentDayIndex: 0, status: 'active' }).run();
  });
  return db.select().from(enrolments).where(eq(enrolments.id, id)).get()!;
}

/** The user's order of template day indexes within one cycle. */
export function cycleOrder(enrolment: Pick<Enrolment, 'dayOrder'>, cycleLength: number): number[] {
  const def = Array.from({ length: cycleLength }, (_, i) => i);
  if (!enrolment.dayOrder) return def;
  const parsed = safeJsonParse<number[]>(enrolment.dayOrder, def, isIntArray);
  const valid = parsed.length === cycleLength && def.every((i) => parsed.includes(i));
  return valid ? parsed : def;
}

export function reorderDays(db: DB, enrolmentId: string, order: number[] | null): void {
  const e = db.select().from(enrolments).where(eq(enrolments.id, enrolmentId)).get();
  if (!e) throw new Error('Enrolment not found');
  if (order) {
    const tpl = getTemplateDetail(db, e.templateId)!;
    const n = tpl.template.cycleLength;
    const sorted = [...order].sort((a, b) => a - b);
    if (order.length !== n || sorted.some((v, i) => v !== i)) throw new Error('Day order must be a permutation of the cycle');
  }
  db.update(enrolments)
    .set({ dayOrder: order ? JSON.stringify(order) : null, updatedAt: Date.now() })
    .where(eq(enrolments.id, enrolmentId))
    .run();
}

export type ResolvedSlot = {
  slot: ProgramExercise;
  /** Exercise after swaps are applied */
  exercise: ExerciseRow;
  /** The swap in effect, if any */
  swap?: Swap;
  /** Working sets after the phase volume multiplier */
  workingSets: number;
  /** RPE target after the phase override (before any week-plan cap) */
  targetRpe: number | null;
  /** Load/effort changes from the accepted week plan or a scheduled deload */
  adjust?: Adjustments;
  /** Short label for those changes, e.g. "Deload: 90% load" */
  planNote?: string;
  /** Per-set rep targets from the slot's rep scheme for this week (null = to failure) */
  repTargets?: (number | null)[];
};

export type SessionAdjust = Adjustments & { deload?: boolean };

/** Accepted week plan for a program week, if any. */
export function acceptedWeekPlan(db: DB, enrolmentId: string, week: number): WeekDecision | null {
  const row = db
    .select()
    .from(weekPlans)
    .where(and(eq(weekPlans.enrolmentId, enrolmentId), eq(weekPlans.programWeek, week), isNull(weekPlans.deletedAt)))
    .orderBy(desc(weekPlans.createdAt))
    .get();
  if (!row || !row.accepted || !row.details) return null;
  try {
    return (JSON.parse(row.details) as { decision: WeekDecision }).decision;
  } catch {
    return null;
  }
}

const minOf = (a: number | null | undefined, b: number | null | undefined) => (a == null ? (b ?? null) : b == null ? a : Math.min(a, b));

function slotAdjust(plan: WeekDecision | null, phaseDeload: boolean, ex: ExerciseRow): { adjust?: SessionAdjust; note?: string } {
  const a: SessionAdjust = {};
  const notes: string[] = [];
  if (phaseDeload) {
    Object.assign(a, { noIncrease: true, loadPct: 0.9, deload: true, reason: 'Planned deload' });
    notes.push('Deload: 90% load');
  } else if (plan && plan.kind !== 'as_written' && plan.kind !== 'planned_deload') {
    if (plan.noIncrease) a.noIncrease = true;
    if (plan.loadPct) a.loadPct = plan.loadPct;
    if (plan.rpeCap != null) a.rpeCap = plan.rpeCap;
    if (plan.kind === 'deload') a.deload = true;
    a.reason = PLAN_LABEL[plan.kind];
    if (plan.kind === 'deload') notes.push('Deload: 90% load');
    else if (plan.rpeCap != null) notes.push(`${PLAN_LABEL[plan.kind]}: RPE ≤ ${plan.rpeCap}`);
  }
  if (plan?.region && regionAffects(plan.region.region, ex)) {
    a.noIncrease = true;
    a.loadPct = minOf(a.loadPct, plan.region.loadPct);
    a.rpeCap = minOf(a.rpeCap, plan.region.rpeCap);
    a.reason = `${REGION_LABEL[plan.region.region]} pain`;
    notes.push(`${REGION_LABEL[plan.region.region]}: ${plan.region.loadPct ? `${Math.round(plan.region.loadPct * 100)}% load` : 'hold load'}`);
  }
  return Object.keys(a).length ? { adjust: a, note: notes.join(' · ') || undefined } : {};
}

export type ProgramDayPlan = {
  programDay: number; // 0-based absolute day in the program
  week: number; // 1-based
  totalDays: number;
  /** Days per cycle (one program week) */
  cycleLength: number;
  day: DayDetail['day'];
  phase: ReturnType<typeof phaseForWeek>;
  /** Accepted adaptive plan for this week, if any */
  weekPlan: WeekDecision | null;
  slots: ResolvedSlot[];
};

/** Everything needed to show (or start) a given program day, with swaps and phase applied. */
export function programDayPlan(db: DB, enrolment: Enrolment, programDay: number): ProgramDayPlan {
  const tpl = getTemplateDetail(db, enrolment.templateId);
  if (!tpl) throw new Error('Template missing');
  const cycleLength = tpl.template.cycleLength;
  const totalDays = tpl.template.weeks * cycleLength;
  const clamped = Math.max(0, Math.min(programDay, totalDays - 1));
  const week = Math.floor(clamped / cycleLength) + 1;
  const order = cycleOrder(enrolment, cycleLength);
  const dayIndex = order[clamped % cycleLength];
  const detail = tpl.days.find((d) => d.day.dayIndex === dayIndex)!;
  const phase = phaseForWeek(tpl.phases, week);
  const weekPlan = acceptedWeekPlan(db, enrolment.id, week);

  const swaps = db
    .select()
    .from(enrolmentSwaps)
    .where(and(eq(enrolmentSwaps.enrolmentId, enrolment.id), isNull(enrolmentSwaps.deletedAt)))
    .orderBy(desc(enrolmentSwaps.createdAt))
    .all();

  const slots = detail.slots.map(({ slot, exercise }) => {
    const sessionSwap = swaps.find((s) => s.programExerciseId === slot.id && s.scope === 'session' && s.programDay === clamped);
    const programSwap = swaps.find((s) => s.programExerciseId === slot.id && s.scope === 'program');
    const swap = sessionSwap ?? programSwap;
    const swapped = swap ? db.select().from(exercises).where(eq(exercises.id, swap.toExerciseId)).get() : undefined;
    const ex = swapped ?? exercise;
    const isAccessory = !ex.isCompound || ex.pattern === 'isolation';
    const { adjust, note } = slotAdjust(weekPlan, phase.kind === 'deload', ex);
    const workingSets = setsUnderPlan(setsForPhase(slot.sets, phase.volumeMult), phase.kind === 'deload' ? null : weekPlan, isAccessory, slot.id);
    // A rep scheme sets reps set by set (and rotates weekly); otherwise main lifts take the phase's
    // rep range (e.g. 8–10 → 5–6 when intensifying). Same slot id either way, so history carries on.
    const scheme = readScheme(slot.repScheme);
    const repTargets = scheme ? fitScheme(schemeForWeek(scheme, week), workingSets) : undefined;
    const numeric = repTargets?.filter((r): r is number => r != null) ?? [];
    const reps = numeric.length ? { repMin: Math.min(...numeric), repMax: Math.max(...numeric) } : repsForPhase(slot.rule, slot.repMin, slot.repMax, phase.repMult);
    return {
      slot: { ...slot, ...reps },
      exercise: ex,
      swap,
      workingSets,
      repTargets,
      targetRpe: phase.rpeTarget ?? slot.targetRpe,
      adjust,
      planNote: note,
    };
  });

  return { programDay: clamped, week, totalDays, cycleLength, day: detail.day, phase, weekPlan, slots };
}

export function swapExercise(db: DB, args: { enrolmentId: string; programExerciseId: string; fromExerciseId: string; toExerciseId: string; scope: 'program' | 'session'; programDay?: number }): Swap {
  if (args.scope === 'session' && args.programDay == null) throw new Error('A session swap needs the program day');
  if (args.fromExerciseId === args.toExerciseId) throw new Error('Pick a different exercise');
  const id = uuid();
  db.insert(enrolmentSwaps)
    .values({
      id,
      enrolmentId: args.enrolmentId,
      programExerciseId: args.programExerciseId,
      fromExerciseId: args.fromExerciseId,
      toExerciseId: args.toExerciseId,
      scope: args.scope,
      programDay: args.scope === 'session' ? args.programDay! : null,
    })
    .run();
  return db.select().from(enrolmentSwaps).where(eq(enrolmentSwaps.id, id)).get()!;
}

/** Undo a swap (soft delete). The previous swap for that slot, if any, applies again. */
export function undoSwap(db: DB, swapId: string): void {
  const t = Date.now();
  db.update(enrolmentSwaps).set({ deletedAt: t, updatedAt: t }).where(eq(enrolmentSwaps.id, swapId)).run();
}

export function setCurrentDay(db: DB, enrolmentId: string, programDay: number): void {
  db.update(enrolments).set({ currentDayIndex: programDay, updatedAt: Date.now() }).where(eq(enrolments.id, enrolmentId)).run();
}
