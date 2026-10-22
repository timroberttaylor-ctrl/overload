/**
 * End of a program ("block"): what it achieved, and starting the next one.
 */
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';

import { estimate1RM } from '@/core/overload';
import { findPRs, volumeKg } from '@/core/records';

import { enrolments, exercises, sessions, setLogs } from '../schema';
import type { DB } from '../types';
import { startProgram, type Enrolment } from './enrolments';
import { planDeloadWeek } from './planner';
import { getTemplateDetail, type ProgramTemplate } from './programs';
import { datedSets, isDeloadSession } from './sessions';

const DONE = ['completed', 'partial'] as const;

export type LiftChange = { exerciseId: string; name: string; startE1rmKg: number; endE1rmKg: number; changePct: number };

export type BlockSummary = {
  enrolment: Enrolment;
  template: ProgramTemplate;
  firstDate: string | null;
  lastDate: string | null;
  sessionsDone: number;
  sessionsPartial: number;
  sessionsPlanned: number;
  workingSets: number;
  volumeKg: number;
  /** Exercises where this block set a new best (e1RM, heaviest weight or most reps at a weight) */
  recordLifts: number;
  /** Main (compound) lifts, biggest gain first */
  lifts: LiftChange[];
  /** The next level of the same program, if there is one */
  stepUp: ProgramTemplate | null;
};

/** Programs that come in levels: template id → the next level up. */
const STEP_UP: Record<string, string> = {
  tpl_ovrld_beginner: 'tpl_ovrld_intermediate',
  tpl_ovrld_intermediate: 'tpl_ovrld_advanced',
};

/** The program you most recently finished, while no other program is running. */
export function lastCompletedBlock(db: DB): Enrolment | undefined {
  const latest = db.select().from(enrolments).where(isNull(enrolments.deletedAt)).orderBy(desc(enrolments.createdAt)).get();
  return latest?.status === 'completed' ? latest : undefined;
}

export function blockSummary(db: DB, enrolmentId: string): BlockSummary | undefined {
  const enrolment = db.select().from(enrolments).where(eq(enrolments.id, enrolmentId)).get();
  if (!enrolment) return undefined;
  const tpl = getTemplateDetail(db, enrolment.templateId);
  if (!tpl) return undefined;

  const done = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.enrolmentId, enrolmentId), inArray(sessions.status, [...DONE]), isNull(sessions.deletedAt)))
    .orderBy(asc(sessions.startedAt))
    .all();
  const ids = done.map((s) => s.id);
  const rows = ids.length
    ? db
        .select({ l: setLogs, e: exercises })
        .from(setLogs)
        .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
        .where(and(inArray(setLogs.sessionId, ids), eq(setLogs.completed, true), isNull(setLogs.deletedAt), ne(setLogs.setType, 'warmup')))
        .all()
        .filter(({ l }) => l.weightKg != null && l.reps != null)
    : [];

  // Strength change on main lifts: best e1RM in the first session vs the best of the last two (deload sessions ignored).
  const hard = done.filter((s) => !isDeloadSession(s));
  const order = new Map(hard.map((s, i) => [s.id, i]));
  const byExercise = new Map<string, { name: string; compound: boolean; perSession: Map<number, number> }>();
  for (const { l, e } of rows) {
    const i = order.get(l.sessionId);
    if (i == null || l.weightKg! <= 0) continue;
    const entry = byExercise.get(e.id) ?? { name: e.name, compound: e.isCompound, perSession: new Map<number, number>() };
    entry.perSession.set(i, Math.max(entry.perSession.get(i) ?? 0, estimate1RM(l.weightKg!, l.reps!, l.rpe)));
    byExercise.set(e.id, entry);
  }
  const lifts: LiftChange[] = [];
  for (const [exerciseId, x] of byExercise) {
    if (!x.compound || x.perSession.size < 2) continue;
    const sessionsInOrder = [...x.perSession.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    const start = sessionsInOrder[0];
    const end = Math.max(...sessionsInOrder.slice(-2));
    lifts.push({ exerciseId, name: x.name, startE1rmKg: start, endE1rmKg: end, changePct: ((end - start) / start) * 100 });
  }
  lifts.sort((a, b) => b.changePct - a.changePct);

  // Records: anything this block beat from before it started.
  let recordLifts = 0;
  const firstStart = done[0]?.startedAt;
  if (firstStart != null) {
    const inBlock = new Set(ids);
    for (const exerciseId of new Set(rows.map((r) => r.e.id))) {
      const all = datedSets(db, exerciseId, {});
      const before = datedSets(db, exerciseId, { before: firstStart });
      if (findPRs(before, all.filter((s) => inBlock.has(s.sessionId))).length) recordLifts++;
    }
  }

  const trainingDays = tpl.days.filter((d) => !d.day.isRest).length;
  const stepUpId = STEP_UP[tpl.template.id];
  return {
    enrolment,
    template: tpl.template,
    firstDate: done[0]?.date ?? null,
    lastDate: done[done.length - 1]?.date ?? null,
    sessionsDone: done.length,
    sessionsPartial: done.filter((s) => s.status === 'partial').length,
    sessionsPlanned: trainingDays * tpl.template.weeks,
    workingSets: rows.length,
    volumeKg: volumeKg(rows.map(({ l }) => ({ weightKg: l.weightKg!, reps: l.reps! }))),
    recordLifts,
    lifts: lifts.slice(0, 6),
    stepUp: stepUpId ? (getTemplateDetail(db, stepUpId)?.template ?? null) : null,
  };
}

/**
 * Start the next block. Running the same program again keeps every exercise's history,
 * so targets carry on from your current weights. Optionally make week 1 a deload.
 */
export function startNextBlock(db: DB, args: { templateId: string; date: string; deloadFirst: boolean }): Enrolment {
  const e = startProgram(db, args.templateId, args.date);
  if (args.deloadFirst) planDeloadWeek(db, e.id, 1, args.date);
  return e;
}
