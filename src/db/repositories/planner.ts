/**
 * Adaptive weekly planner: storage and the data it decides from.
 *
 * Program weeks (not calendar weeks) are the unit: week N is program days
 * (N-1)·cycle … N·cycle-1. When the lifter reaches a new week, the app offers
 * a review of the week just finished: an optional check-in, the numbers, and a
 * recommendation for the new week that they accept or decline.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';

import { uuid } from '@/core/ids';
import { bestE1RM } from '@/core/overload';
import { decideWeek, pickPushSlots, type CheckIn, type JointRegion, type LiftTrend, type WeekDecision, type WeekMetrics } from '@/core/planner';
import { groupOf, MUSCLE_GROUPS, weeklyVolume, type MuscleGroup, type Volume } from '@/core/volume';

import { checkins, enrolments, exercises, sessions, setLogs, weekPlans } from '../schema';
import type { DB } from '../types';
import { acceptedWeekPlan, programDayPlan, type Enrolment } from './enrolments';
import { getTemplateDetail, phaseForWeek } from './programs';
import { isDeloadSession } from './sessions';
import { parseMuscles, safeJsonParse } from '@/core/json';

const DONE = ['completed', 'partial'] as const;

function programShape(db: DB, enrolment: Enrolment) {
  const tpl = getTemplateDetail(db, enrolment.templateId);
  if (!tpl) throw new Error('Template missing');
  return { tpl, cycle: tpl.template.cycleLength, totalWeeks: tpl.template.weeks };
}

function enrolmentById(db: DB, id: string): Enrolment {
  const e = db.select().from(enrolments).where(eq(enrolments.id, id)).get();
  if (!e) throw new Error('Program not found');
  return e;
}

/** The week the lifter is in now (1-based), from the program's current day. */
export function currentProgramWeek(db: DB, enrolment: Enrolment): number {
  const { cycle, totalWeeks } = programShape(db, enrolment);
  return Math.min(totalWeeks, Math.floor(enrolment.currentDayIndex / cycle) + 1);
}

function sessionsInDays(db: DB, enrolmentId: string, from: number, to: number) {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.enrolmentId, enrolmentId), inArray(sessions.status, [...DONE]), isNull(sessions.deletedAt), gte(sessions.programDay, from), lt(sessions.programDay, to)))
    .all();
}

function workingSetsOf(db: DB, sessionIds: string[]) {
  if (!sessionIds.length) return [];
  return db
    .select({ l: setLogs, ex: exercises })
    .from(setLogs)
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(and(inArray(setLogs.sessionId, sessionIds), isNull(setLogs.deletedAt), inArray(setLogs.setType, ['working', 'backoff'])))
    .all();
}

/** What happened in one program week. */
export function weekMetrics(db: DB, enrolmentId: string, week: number): WeekMetrics {
  const enrolment = enrolmentById(db, enrolmentId);
  const { cycle } = programShape(db, enrolment);
  const start = (week - 1) * cycle;
  let planned = 0;
  for (let pd = start; pd < start + cycle; pd++) if (!programDayPlan(db, enrolment, pd).day.isRest) planned++;

  const done = sessionsInDays(db, enrolmentId, start, start + cycle);
  const completedDays = new Set(done.map((s) => s.programDay));
  const rows = workingSetsOf(
    db,
    done.map((s) => s.id),
  );

  let withTarget = 0;
  let hit = 0;
  let gapSum = 0;
  let gapN = 0;
  for (const { l } of rows) {
    if (!l.completed || l.reps == null) continue;
    if (l.targetReps != null) {
      withTarget++;
      if (l.reps >= l.targetReps) hit++;
    }
    if (l.rpe != null && l.targetRpe != null) {
      gapSum += l.rpe - l.targetRpe;
      gapN++;
    }
  }

  // Main-lift trend: best e1RM this week vs the best of the two weeks before (deload weeks ignored).
  const thisWeek = done.filter((s) => !isDeloadSession(s));
  const before = sessionsInDays(db, enrolmentId, Math.max(0, start - 2 * cycle), start).filter((s) => !isDeloadSession(s));
  const best = (ids: string[]) => {
    const m = new Map<string, { name: string; e1: number }>();
    for (const { l, ex } of workingSetsOf(db, ids)) {
      if (!ex.isCompound || !l.completed || l.weightKg == null || l.reps == null || l.weightKg <= 0) continue;
      const e1 = bestE1RM([{ weightKg: l.weightKg, reps: l.reps, rpe: l.rpe }]);
      const cur = m.get(ex.id);
      if (!cur || e1 > cur.e1) m.set(ex.id, { name: ex.name, e1 });
    }
    return m;
  };
  const now = best(thisWeek.map((s) => s.id));
  const prev = best(before.map((s) => s.id));
  const mainLifts: LiftTrend[] = [];
  for (const [id, cur] of now) {
    const p = prev.get(id);
    if (p && p.e1 > 0) mainLifts.push({ exerciseId: id, name: cur.name, changePct: Math.round((cur.e1 / p.e1 - 1) * 1000) / 10 });
  }

  const doneSets = new Map<string, { primaryMuscle: string; secondaryMuscles: string[]; sets: number }>();
  for (const { l, ex } of rows) {
    if (!l.completed) continue;
    const cur = doneSets.get(ex.id) ?? { primaryMuscle: ex.primaryMuscle, secondaryMuscles: parseMuscles(ex.secondaryMuscles), sets: 0 };
    cur.sets++;
    doneSets.set(ex.id, cur);
  }

  return {
    volume: weeklyVolume([...doneSets.values()]),
    plannedSessions: planned,
    completedSessions: [...completedDays].filter((d) => d != null).length,
    setsWithTarget: withTarget,
    setsHitTarget: hit,
    rpeGap: gapN ? Math.round((gapSum / gapN) * 100) / 100 : null,
    mainLifts,
  };
}

export type WeekVolume = { week: number; planned: Volume; done: Volume };

/** The working sets a program week plans per muscle group (with any accepted plan applied). */
function plannedSlots(db: DB, enrolment: Enrolment, week: number) {
  const { cycle } = programShape(db, enrolment);
  const out: { id: string; primaryMuscle: string; secondaryMuscles: string[]; sets: number; isAccessory: boolean }[] = [];
  for (let pd = (week - 1) * cycle; pd < week * cycle; pd++) {
    const plan = programDayPlan(db, enrolment, pd);
    if (plan.day.isRest) continue;
    for (const s of plan.slots) {
      out.push({
        id: s.slot.id,
        primaryMuscle: s.exercise.primaryMuscle,
        secondaryMuscles: parseMuscles(s.exercise.secondaryMuscles),
        sets: s.workingSets,
        isAccessory: !s.exercise.isCompound || s.exercise.pattern === 'isolation',
      });
    }
  }
  return out;
}

/** Planned vs done sets per muscle group for one program week. */
export function weekVolume(db: DB, enrolmentId: string, week: number): WeekVolume {
  const enrolment = enrolmentById(db, enrolmentId);
  return { week, planned: weeklyVolume(plannedSlots(db, enrolment, week)), done: weekMetrics(db, enrolmentId, week).volume! };
}

/** Full weeks since the last deload (scheduled or accepted), counting back from the week before `week`. */
export function weeksSinceDeload(db: DB, enrolmentId: string, week: number): number {
  const enrolment = enrolmentById(db, enrolmentId);
  const { tpl } = programShape(db, enrolment);
  for (let w = week - 1; w >= 1; w--) {
    if (phaseForWeek(tpl.phases, w).kind === 'deload' || acceptedWeekPlan(db, enrolmentId, w)?.kind === 'deload') return week - 1 - w;
  }
  return week - 1;
}

export type WeekNote = { date: string; session: string; exercise: string | null; note: string };

/** Your workout and set notes from one program week, oldest first, for the week review. */
export function weekNotes(db: DB, enrolmentId: string, week: number): WeekNote[] {
  const enrolment = enrolmentById(db, enrolmentId);
  const { cycle } = programShape(db, enrolment);
  const start = (week - 1) * cycle;
  const done = sessionsInDays(db, enrolmentId, start, start + cycle).sort((a, b) => a.startedAt - b.startedAt);
  const out: WeekNote[] = [];
  for (const s of done) {
    if (s.notes) out.push({ date: s.date, session: s.name, exercise: null, note: s.notes });
    const rows = db
      .select({ note: setLogs.note, name: exercises.name })
      .from(setLogs)
      .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
      .where(and(eq(setLogs.sessionId, s.id), isNull(setLogs.deletedAt)))
      .orderBy(asc(setLogs.exerciseOrder), asc(setLogs.setIndex))
      .all();
    for (const r of rows) if (r.note) out.push({ date: s.date, session: s.name, exercise: r.name, note: r.note });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export type CheckInRow = typeof checkins.$inferSelect;

const checkinId = (enrolmentId: string, week: number) => `${enrolmentId}:${week}`;

export function getCheckIn(db: DB, enrolmentId: string, week: number): CheckIn | null {
  const r = db
    .select()
    .from(checkins)
    .where(and(eq(checkins.id, checkinId(enrolmentId, week)), isNull(checkins.deletedAt)))
    .get();
  return r ? { fatigue: r.fatigue, soreness: r.soreness, motivation: r.motivation, jointPain: r.jointPain, jointPainRegion: (r.jointPainRegion as JointRegion | null) ?? null } : null;
}

export function saveCheckIn(db: DB, args: { enrolmentId: string; week: number; checkIn: CheckIn; date: string; note?: string | null }): void {
  const c = args.checkIn;
  for (const [k, v] of Object.entries({ fatigue: c.fatigue, soreness: c.soreness, motivation: c.motivation, jointPain: c.jointPain })) {
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error(`${k} must be 1–5`);
  }
  if (c.jointPain >= 3 && !c.jointPainRegion) throw new Error('Pick where the joint pain is');
  const id = checkinId(args.enrolmentId, args.week);
  const values = {
    weekStart: args.date,
    enrolmentId: args.enrolmentId,
    programWeek: args.week,
    fatigue: c.fatigue,
    soreness: c.soreness,
    motivation: c.motivation,
    jointPain: c.jointPain,
    jointPainRegion: c.jointPain >= 3 ? c.jointPainRegion : null,
    note: args.note ?? null,
    deletedAt: null,
  };
  db.insert(checkins)
    .values({ id, ...values })
    .onConflictDoUpdate({ target: checkins.id, set: { ...values, updatedAt: Date.now() } })
    .run();
}

// ---------------------------------------------------------------------------
// Recommendations and plans
// ---------------------------------------------------------------------------

export type Recommendation = { planWeek: number; reviewWeek: number; decision: WeekDecision; metrics: WeekMetrics; checkIn: CheckIn | null };

/**
 * Recommend how to run `planWeek`, from the week before it. Pass `checkInDraft`
 * to preview with an unsaved check-in (null = no check-in); omit it to use the saved one.
 */
export function recommendWeek(db: DB, enrolmentId: string, planWeek: number, checkInDraft?: CheckIn | null): Recommendation {
  if (planWeek < 2) throw new Error('The first week runs as written');
  const enrolment = enrolmentById(db, enrolmentId);
  const { tpl } = programShape(db, enrolment);
  const reviewWeek = planWeek - 1;
  const metrics = weekMetrics(db, enrolmentId, reviewWeek);
  const checkIn = checkInDraft === undefined ? getCheckIn(db, enrolmentId, reviewWeek) : checkInDraft;
  const slots = plannedSlots(db, enrolment, planWeek);
  const trainableGroups = MUSCLE_GROUPS.filter((g) => slots.some((s) => groupOf(s.primaryMuscle) === g)) as MuscleGroup[];
  const decision = decideWeek({
    week: planWeek,
    weeksSinceDeload: weeksSinceDeload(db, enrolmentId, planWeek),
    programDeload: phaseForWeek(tpl.phases, planWeek).kind === 'deload',
    programPeak: phaseForWeek(tpl.phases, planWeek).kind === 'realisation',
    trainableGroups,
    checkIn,
    metrics,
  });
  if (decision.pushGroups?.length) decision.pushSlotIds = pickPushSlots(decision.pushGroups, slots);
  return { planWeek, reviewWeek, decision, metrics, checkIn };
}

export type WeekPlanRow = typeof weekPlans.$inferSelect;
export type StoredPlan = { row: WeekPlanRow; decision: WeekDecision; metrics: WeekMetrics | null };

export function getWeekPlan(db: DB, enrolmentId: string, week: number): StoredPlan | null {
  const row = db
    .select()
    .from(weekPlans)
    .where(and(eq(weekPlans.enrolmentId, enrolmentId), eq(weekPlans.programWeek, week), isNull(weekPlans.deletedAt)))
    .orderBy(desc(weekPlans.createdAt))
    .get();
  if (!row?.details) return null;
  const d = safeJsonParse<{ decision?: WeekDecision; metrics?: WeekMetrics } | null>(row.details, null);
  if (!d || typeof d !== 'object' || !d.decision) return null;
  return { row, decision: d.decision, metrics: d.metrics ?? null };
}

/** Save the lifter's choice. `accepted: false` means "keep as written" (stored, so the review isn't asked again). */
export function saveWeekPlan(db: DB, args: { enrolmentId: string; recommendation: Recommendation; accepted: boolean; date: string }): StoredPlan {
  const { recommendation: r } = args;
  const t = Date.now();
  db.transaction((tx) => {
    tx.update(weekPlans)
      .set({ deletedAt: t, updatedAt: t })
      .where(and(eq(weekPlans.enrolmentId, args.enrolmentId), eq(weekPlans.programWeek, r.planWeek), isNull(weekPlans.deletedAt)))
      .run();
    tx.insert(weekPlans)
      .values({
        id: uuid(),
        enrolmentId: args.enrolmentId,
        weekStart: args.date,
        programWeek: r.planWeek,
        volumeMult: r.decision.volumeMult,
        rpeCap: r.decision.rpeCap,
        deload: r.decision.kind === 'deload',
        reasons: JSON.stringify(r.decision.reasons),
        accepted: args.accepted,
        details: JSON.stringify({ decision: r.decision, metrics: r.metrics }),
      })
      .run();
  });
  return getWeekPlan(db, args.enrolmentId, r.planWeek)!;
}

/** Undo the choice for a week, so the review is offered again. Sessions already done keep what they were given. */
export function clearWeekPlan(db: DB, enrolmentId: string, week: number): void {
  const t = Date.now();
  db.update(weekPlans)
    .set({ deletedAt: t, updatedAt: t })
    .where(and(eq(weekPlans.enrolmentId, enrolmentId), eq(weekPlans.programWeek, week), isNull(weekPlans.deletedAt)))
    .run();
}

export type ReviewState = { status: 'none' } | { status: 'due'; reviewWeek: number; planWeek: number } | { status: 'planned'; planWeek: number; plan: StoredPlan };

/** Whether the Train screen should offer a week review, or show this week's plan. */
export function reviewState(db: DB, enrolment: Enrolment | undefined): ReviewState {
  if (!enrolment || enrolment.status !== 'active') return { status: 'none' };
  const week = currentProgramWeek(db, enrolment);
  if (week < 2) return { status: 'none' };
  const plan = getWeekPlan(db, enrolment.id, week);
  return plan ? { status: 'planned', planWeek: week, plan } : { status: 'due', reviewWeek: week - 1, planWeek: week };
}
