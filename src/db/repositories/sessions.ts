/**
 * Workout sessions: start from a program day, log sets, swap, finish or discard.
 *
 * Every user action is a single small SQLite write, so nothing depends on the
 * network and a crash loses at most the set being typed. An unfinished session
 * stays `in_progress` and can be resumed after a restart.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne } from 'drizzle-orm';

import { addDays } from '@/core/dates';
import { uuid } from '@/core/ids';
import { bestE1RM, easedWeight, nextTarget, pctOf1RM, sessionWeight, warmupSets, type Adjustments, type Prescription, type SessionResult, type Target } from '@/core/overload';
import { roundToIncrement } from '@/core/units';
import { findPRs, volumeKg, type DatedSet, type PR } from '@/core/records';

import { enrolments, exercises, exerciseStates, programExercises, sessions, setLogs } from '../schema';
import type { DB } from '../types';
import { getActiveEnrolment, programDayPlan, swapExercise, type ResolvedSlot, type SessionAdjust } from './enrolments';
import { getTemplateDetail } from './programs';
import { getSettings, type AppSettings } from './settings';

export type Session = typeof sessions.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
type ExerciseRow = typeof exercises.$inferSelect;

const DONE_STATUSES = ['completed', 'partial'] as const;
const HISTORY_SESSIONS = 8;

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

/**
 * Past results for an exercise, oldest first. When `programExerciseId` is given,
 * only sessions of that program slot count (so a top set and back-off sets of the
 * same lift progress independently).
 */
export function exerciseResults(db: DB, exerciseId: string, opts: { programExerciseId?: string | null; beforeSessionId?: string; limit?: number; includeDeload?: boolean } = {}): SessionResult[] {
  const conds = [eq(setLogs.exerciseId, exerciseId), isNull(setLogs.deletedAt), inArray(sessions.status, [...DONE_STATUSES]), isNull(sessions.deletedAt), ne(setLogs.setType, 'warmup')];
  if (opts.programExerciseId) conds.push(eq(setLogs.programExerciseId, opts.programExerciseId));
  if (opts.beforeSessionId) conds.push(ne(setLogs.sessionId, opts.beforeSessionId));
  const rows = db
    .select({ s: sessions, l: setLogs })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(and(...conds))
    .orderBy(desc(sessions.startedAt), asc(setLogs.setIndex))
    .all();

  const bySession = new Map<string, { date: string; startedAt: number; planned: number; sets: SessionResult['sets'] }>();
  for (const { s, l } of rows) {
    // Deload sessions are deliberately light; progression continues from the work before them.
    if (!opts.includeDeload && isDeloadSession(s)) continue;
    const entry = bySession.get(s.id) ?? { date: s.date, startedAt: s.startedAt, planned: 0, sets: [] };
    entry.planned++;
    if (l.completed && l.weightKg != null && l.reps != null) entry.sets.push({ weightKg: l.weightKg, reps: l.reps, rpe: l.rpe, target: l.toFailure ? null : l.targetReps });
    bySession.set(s.id, entry);
  }
  const list = [...bySession.values()]
    .filter((e) => e.sets.length > 0)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((e) => ({ date: e.date, plannedSets: e.planned, sets: e.sets }));
  const limit = opts.limit ?? HISTORY_SESSIONS;
  return list.slice(-limit);
}

export function isDeloadSession(s: Pick<Session, 'adjustments'>): boolean {
  if (!s.adjustments) return false;
  try {
    return !!(JSON.parse(s.adjustments) as SessionAdjust).deload;
  } catch {
    return false;
  }
}

function mergeAdjust(a?: Adjustments, b?: Adjustments): Adjustments | undefined {
  if (!a) return b;
  if (!b) return a;
  const min = (x?: number | null, y?: number | null) => (x == null ? y : y == null ? x : Math.min(x, y));
  return { noIncrease: !!(a.noIncrease || b.noIncrease), rpeCap: min(a.rpeCap, b.rpeCap), loadPct: min(a.loadPct, b.loadPct), reason: a.reason ?? b.reason };
}

function bestRecentE1RM(db: DB, exerciseId: string): number | null {
  const all = exerciseResults(db, exerciseId, { limit: 6 });
  const best = Math.max(0, ...all.map((r) => bestE1RM(r.sets)));
  return best > 0 ? best : null;
}

function roundStepFor(ex: ExerciseRow, settings: AppSettings): number {
  if (ex.equipment === 'barbell') return settings.plateIncrementKg;
  return ex.defaultIncrementKg > 0 ? ex.defaultIncrementKg : 1;
}

export function prescriptionFor(slot: ResolvedSlot, settings: AppSettings): Prescription {
  const ex = slot.exercise;
  return {
    rule: slot.slot.rule,
    sets: slot.workingSets,
    repMin: slot.slot.repMin,
    repMax: slot.slot.repMax,
    targetRpe: slot.targetRpe,
    incrementKg: slot.slot.incrementKg ?? ex.defaultIncrementKg,
    roundStepKg: roundStepFor(ex, settings),
    failsBeforeReset: slot.slot.failsBeforeReset,
    resetPct: slot.slot.resetPct,
    repTargets: slot.repTargets,
  };
}

/** The engine's target for one program slot right now. */
export function targetForSlot(db: DB, slot: ResolvedSlot, today: string, settings: AppSettings, adjust?: Adjustments): Target {
  const history = exerciseResults(db, slot.exercise.id, { programExerciseId: slot.slot.id });
  return nextTarget({
    prescription: prescriptionFor(slot, settings),
    history,
    today,
    fallbackE1RM: history.length ? null : bestRecentE1RM(db, slot.exercise.id),
    adjust,
  });
}

// ---------------------------------------------------------------------------
// Starting a session
// ---------------------------------------------------------------------------

export function getInProgressSession(db: DB): Session | undefined {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.status, 'in_progress'), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.startedAt))
    .get();
}

/** Carries are logged in metres (as reps), so their first-time hint talks about distance. */
function noteFor(ex: ExerciseRow, slot: ResolvedSlot, target: Target): string {
  if (ex.pattern === 'carry' && target.kind === 'first') {
    return `First time: pick a weight you can carry for about ${slot.slot.repMax + 10} m with tall posture. Log metres in the reps box (aim for ${slot.slot.repMin}–${slot.slot.repMax} m).`;
  }
  return target.reason;
}

function buildSetRows(db: DB, sessionId: string, slot: ResolvedSlot, today: string, settings: AppSettings, adjust?: Adjustments) {
  const target = targetForSlot(db, slot, today, settings, adjust);
  const ex = slot.exercise;
  const warm = warmupSets(target.weightKg, slot.slot.warmupSets, { stepKg: roundStepFor(ex, settings), barKg: ex.equipment === 'barbell' ? 20 : 0 });
  const rows: (typeof setLogs.$inferInsert)[] = [];
  warm.forEach((w, i) =>
    rows.push({
      id: uuid(),
      sessionId,
      exerciseId: ex.id,
      programExerciseId: slot.slot.id,
      series: slot.slot.series,
      exerciseOrder: slot.slot.position,
      setIndex: i,
      setType: 'warmup',
      targetWeightKg: w.weightKg,
      targetReps: w.reps,
      weightKg: w.weightKg,
      reps: w.reps,
      restS: 60,
    }),
  );
  // Per-set targets: a rep scheme (pyramids, failure sets) or the engine's flat targets.
  const perSet: (number | null)[] = slot.repTargets ?? target.reps;
  // With a scheme on an RPE lift, each set gets its own load from the e1RM (more reps → lighter),
  // never above the engine's capped working weight. Deloads and first sessions keep one weight.
  const hold = !!adjust?.loadPct || !!adjust?.noIncrease || target.kind === 'lighter' || target.kind === 'first';
  const step = roundStepFor(ex, settings);
  let lastWeight = target.weightKg;
  const weightFor = (reps: number | null): number | null => {
    if (target.weightKg == null) return null;
    if (reps == null) return lastWeight; // to failure: same load as the set before
    if (!slot.repTargets || slot.slot.rule !== 'rpe' || hold || target.e1rmKg == null) return target.weightKg;
    const w = roundToIncrement(target.e1rmKg * pctOf1RM(reps, target.rpe ?? 8), step, 'down');
    return Math.max(0, Math.min(w, target.weightKg));
  };
  perSet.forEach((r, i) => {
    const w = weightFor(r);
    lastWeight = w;
    rows.push({
      id: uuid(),
      sessionId,
      exerciseId: ex.id,
      programExerciseId: slot.slot.id,
      series: slot.slot.series,
      exerciseOrder: slot.slot.position,
      setIndex: warm.length + i,
      setType: 'working',
      targetWeightKg: w,
      targetReps: r,
      targetRpe: r == null ? 10 : target.rpe,
      weightKg: w,
      reps: r,
      toFailure: r == null,
      restS: slot.slot.restS,
      targetNote: i === 0 ? noteFor(ex, slot, target) : null,
    });
  });
  return rows;
}

function backfillTime(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

function sessionAdjustments(slots: ResolvedSlot[], today?: Adjustments): string | null {
  const deload = slots.some((s) => (s.adjust as SessionAdjust | undefined)?.deload);
  const plan = slots.find((s) => s.adjust)?.adjust?.reason;
  if (!deload && !plan && !today) return null;
  return JSON.stringify({ ...(today ?? {}), ...(deload ? { deload: true } : {}), ...(plan ? { plan } : {}) });
}

export function startProgramSession(db: DB, args: { enrolmentId: string; programDay: number; date: string; now?: number; adjust?: Adjustments; backfill?: boolean; today?: string }): Session {
  if (getInProgressSession(db)) throw new Error('A workout is already in progress. Resume or discard it first.');
  if (args.backfill && args.today && args.date > args.today) throw new Error("A past workout can't be dated in the future");
  const enrolment = db.select().from(enrolments).where(eq(enrolments.id, args.enrolmentId)).get();
  if (!enrolment) throw new Error('Program not found');
  const plan = programDayPlan(db, enrolment, args.programDay);
  if (plan.day.isRest) throw new Error('That is a rest day');
  const settings = getSettings(db);
  const id = uuid();
  // A backfilled workout is placed at midday on its date, so history stays in order.
  const now = args.backfill ? backfillTime(args.date) : (args.now ?? Date.now());
  db.transaction((tx) => {
    tx.insert(sessions)
      .values({
        id,
        isBackfill: !!args.backfill,
        enrolmentId: enrolment.id,
        templateDayId: plan.day.id,
        programDay: plan.programDay,
        date: args.date,
        name: plan.day.name,
        startedAt: now,
        status: 'in_progress',
        adjustments: sessionAdjustments(plan.slots, args.adjust),
      })
      .run();
    for (const slot of plan.slots) {
      const rows = buildSetRows(tx as unknown as DB, id, slot, args.date, settings, mergeAdjust(slot.adjust, args.adjust));
      if (rows.length) tx.insert(setLogs).values(rows).run();
    }
  });
  return db.select().from(sessions).where(eq(sessions.id, id)).get()!;
}

// ---------------------------------------------------------------------------
// Reading a session
// ---------------------------------------------------------------------------

export type ExerciseGroup = {
  exerciseOrder: number;
  series: string | null;
  exercise: ExerciseRow;
  programExerciseId: string | null;
  sets: SetLog[];
  note: string | null;
  restS: number;
  /** Prescribed tempo (E/P/C/T) from the program, if any */
  tempo: string | null;
  /** Most recent previous result for this slot (or exercise) */
  lastTime: SessionResult | null;
  /** Your notes on this exercise from the last session that had any (within 6 weeks) */
  lastNotes: { date: string; note: string }[];
};

export type SessionDetail = { session: Session; groups: ExerciseGroup[] };

export function getSessionDetail(db: DB, sessionId: string): SessionDetail | undefined {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return undefined;
  const rows = db
    .select({ l: setLogs, e: exercises })
    .from(setLogs)
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .where(and(eq(setLogs.sessionId, sessionId), isNull(setLogs.deletedAt)))
    .orderBy(asc(setLogs.exerciseOrder), asc(setLogs.setIndex))
    .all();
  const slotIds = [...new Set(rows.map((r) => r.l.programExerciseId).filter((x): x is string => !!x))];
  const tempos = new Map(
    (slotIds.length ? db.select({ id: programExercises.id, tempo: programExercises.tempo }).from(programExercises).where(inArray(programExercises.id, slotIds)).all() : []).map((r) => [r.id, r.tempo]),
  );
  const groups: ExerciseGroup[] = [];
  for (const { l, e } of rows) {
    let g = groups.find((x) => x.exerciseOrder === l.exerciseOrder && x.exercise.id === e.id);
    if (!g) {
      const prior = exerciseResults(db, e.id, { programExerciseId: l.programExerciseId, beforeSessionId: sessionId, limit: 1, includeDeload: true });
      const anyPrior = prior.length ? prior : exerciseResults(db, e.id, { beforeSessionId: sessionId, limit: 1, includeDeload: true });
      g = {
        exerciseOrder: l.exerciseOrder,
        series: l.series,
        exercise: e,
        programExerciseId: l.programExerciseId,
        sets: [],
        note: null,
        restS: 90,
        tempo: l.programExerciseId ? (tempos.get(l.programExerciseId) ?? null) : null,
        lastTime: anyPrior[0] ?? null,
        lastNotes: lastNotesFor(db, e.id, session),
      };
      groups.push(g);
    }
    g.sets.push(l);
    if (l.targetNote) g.note = l.targetNote;
    if (l.setType !== 'warmup' && l.restS) g.restS = l.restS;
  }
  return { session, groups };
}

const NOTE_MAX = 280;
const NOTE_LOOKBACK_DAYS = 42;

function cleanNote(note: string | null | undefined): string | null {
  const t = (note ?? '').trim();
  if (t.length > NOTE_MAX) throw new Error(`Keep notes under ${NOTE_MAX} characters`);
  return t || null;
}

/** Set notes on an exercise from the most recent earlier session that has any. */
export function lastNotesFor(db: DB, exerciseId: string, before: Pick<Session, 'id' | 'startedAt' | 'date'>): { date: string; note: string }[] {
  const rows = db
    .select({ note: setLogs.note, date: sessions.date, sid: sessions.id, startedAt: sessions.startedAt })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(
      and(
        eq(setLogs.exerciseId, exerciseId),
        isNull(setLogs.deletedAt),
        isNull(sessions.deletedAt),
        inArray(sessions.status, [...DONE_STATUSES]),
        ne(sessions.id, before.id),
        lt(sessions.startedAt, before.startedAt),
        gte(sessions.date, addDays(before.date, -NOTE_LOOKBACK_DAYS)),
      ),
    )
    .orderBy(desc(sessions.startedAt), asc(setLogs.setIndex))
    .all()
    .filter((r) => r.note);
  if (!rows.length) return [];
  const sid = rows[0].sid;
  return rows.filter((r) => r.sid === sid).map((r) => ({ date: r.date, note: r.note! }));
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/** Add, change or clear (empty/null) your note on a set. */
export function setSetNote(db: DB, setId: string, note: string | null): void {
  assertEditable(db, setId);
  db.update(setLogs)
    .set({ note: cleanNote(note), updatedAt: Date.now() })
    .where(eq(setLogs.id, setId))
    .run();
}

/** Add, change or clear your note on a whole workout. */
export function setSessionNote(db: DB, sessionId: string, note: string | null): void {
  const s = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!s || s.deletedAt) throw new Error('Workout not found');
  db.update(sessions)
    .set({ notes: cleanNote(note), updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}

function assertEditable(db: DB, setId: string): SetLog {
  const row = db.select().from(setLogs).where(eq(setLogs.id, setId)).get();
  if (!row || row.deletedAt) throw new Error('Set not found');
  return row;
}

function validate(v: { weightKg?: number | null; reps?: number | null; rpe?: number | null }) {
  if (v.weightKg != null && (!Number.isFinite(v.weightKg) || v.weightKg < 0 || v.weightKg > 1000)) throw new Error('Check the weight');
  if (v.reps != null && (!Number.isInteger(v.reps) || v.reps < 0 || v.reps > 1000)) throw new Error('Reps must be a whole number');
  if (v.rpe != null && (v.rpe < 1 || v.rpe > 10)) throw new Error('RPE is between 1 and 10');
}

/** Save the values and mark the set done. */
export function logSet(db: DB, setId: string, v: { weightKg: number; reps: number; rpe?: number | null }, now = Date.now()): SetLog {
  assertEditable(db, setId);
  validate(v);
  db.transaction((tx) => {
    tx.update(setLogs)
      .set({ weightKg: v.weightKg, reps: v.reps, rpe: v.rpe ?? null, completed: true, loggedAt: now, updatedAt: now })
      .where(eq(setLogs.id, setId))
      .run();
    // Carry the weight forward to later sets of this exercise that have no weight yet (first time on a lift).
    const set = tx.select().from(setLogs).where(eq(setLogs.id, setId)).get()!;
    if (set.setType !== 'warmup') {
      tx.update(setLogs)
        .set({ weightKg: v.weightKg, updatedAt: now })
        .where(
          and(
            eq(setLogs.sessionId, set.sessionId),
            eq(setLogs.exerciseOrder, set.exerciseOrder),
            eq(setLogs.exerciseId, set.exerciseId),
            eq(setLogs.completed, false),
            isNull(setLogs.weightKg),
            isNull(setLogs.deletedAt),
            ne(setLogs.setType, 'warmup'),
            gt(setLogs.setIndex, set.setIndex),
          ),
        )
        .run();
    }
  });
  return db.select().from(setLogs).where(eq(setLogs.id, setId)).get()!;
}

/** Edit values without changing whether the set is done (also used to correct past sessions). */
/**
 * After a working set lands a full RPE point or more over its target, lighten the rest of
 * that exercise's unlogged working sets (the ones still at the weight just used, so your own
 * edits are left alone). Returns what changed, for the player to tell you, or null.
 */
export function easeRemainingSets(db: DB, setId: string, now = Date.now()): { fromKg: number; toKg: number; count: number; rpe: number; targetRpe: number } | null {
  const set = db.select().from(setLogs).where(eq(setLogs.id, setId)).get();
  if (!set || !set.completed || set.setType === 'warmup' || set.weightKg == null || set.reps == null) return null;
  const ex = db.select().from(exercises).where(eq(exercises.id, set.exerciseId)).get();
  if (!ex) return null;
  const toKg = easedWeight({ weightKg: set.weightKg, reps: set.reps, rpe: set.rpe, targetRpe: set.targetRpe, stepKg: roundStepFor(ex, getSettings(db)) });
  if (toKg == null) return null;
  const where = and(
    eq(setLogs.sessionId, set.sessionId),
    eq(setLogs.exerciseOrder, set.exerciseOrder),
    eq(setLogs.exerciseId, set.exerciseId),
    eq(setLogs.completed, false),
    eq(setLogs.weightKg, set.weightKg),
    isNull(setLogs.deletedAt),
    ne(setLogs.setType, 'warmup'),
    gt(setLogs.setIndex, set.setIndex),
  );
  const count = db.select({ id: setLogs.id }).from(setLogs).where(where).all().length;
  if (!count) return null;
  db.update(setLogs).set({ weightKg: toKg, updatedAt: now }).where(where).run();
  return { fromKg: set.weightKg, toKg, count, rpe: set.rpe!, targetRpe: set.targetRpe! };
}

export function updateSet(db: DB, setId: string, v: { weightKg?: number | null; reps?: number | null; rpe?: number | null }): void {
  assertEditable(db, setId);
  validate(v);
  db.update(setLogs)
    .set({ ...v, updatedAt: Date.now() })
    .where(eq(setLogs.id, setId))
    .run();
}

export function unlogSet(db: DB, setId: string): void {
  assertEditable(db, setId);
  db.update(setLogs).set({ completed: false, loggedAt: null, updatedAt: Date.now() }).where(eq(setLogs.id, setId)).run();
}

/** Adds one more working set to an exercise, copying the last set's values. */
export function addSet(db: DB, sessionId: string, exerciseOrder: number): SetLog {
  const sets = db
    .select()
    .from(setLogs)
    .where(and(eq(setLogs.sessionId, sessionId), eq(setLogs.exerciseOrder, exerciseOrder), isNull(setLogs.deletedAt)))
    .orderBy(asc(setLogs.setIndex))
    .all();
  const last = sets[sets.length - 1];
  if (!last) throw new Error('Exercise not found in this session');
  const id = uuid();
  db.insert(setLogs)
    .values({
      id,
      sessionId,
      exerciseId: last.exerciseId,
      programExerciseId: last.programExerciseId,
      series: last.series,
      exerciseOrder,
      setIndex: last.setIndex + 1,
      setType: last.setType === 'warmup' ? 'working' : last.setType,
      targetWeightKg: last.targetWeightKg,
      targetReps: last.targetReps,
      targetRpe: last.targetRpe,
      weightKg: last.weightKg,
      reps: last.reps,
      restS: last.restS,
    })
    .run();
  return db.select().from(setLogs).where(eq(setLogs.id, id)).get()!;
}

export function removeSet(db: DB, setId: string): void {
  assertEditable(db, setId);
  const t = Date.now();
  db.update(setLogs).set({ deletedAt: t, updatedAt: t }).where(eq(setLogs.id, setId)).run();
}

/**
 * Swap an exercise inside the current workout. Unlogged sets are rebuilt for the
 * new exercise; already-logged sets stay as they were. With scope "program" the
 * swap also applies to every future occurrence.
 */
export function swapInSession(db: DB, args: { sessionId: string; exerciseOrder: number; toExerciseId: string; scope: 'session' | 'program'; today: string }): void {
  const session = db.select().from(sessions).where(eq(sessions.id, args.sessionId)).get();
  if (!session || session.status !== 'in_progress') throw new Error('Only an active workout can be changed');
  const sets = db
    .select()
    .from(setLogs)
    .where(and(eq(setLogs.sessionId, args.sessionId), eq(setLogs.exerciseOrder, args.exerciseOrder), isNull(setLogs.deletedAt)))
    .all();
  if (!sets.length) throw new Error('Exercise not found in this session');
  const fromExerciseId = sets[0].exerciseId;
  if (fromExerciseId === args.toExerciseId) return;
  const programExerciseId = sets[0].programExerciseId;

  db.transaction((tx) => {
    const t = Date.now();
    if (session.enrolmentId && programExerciseId) {
      swapExercise(tx as unknown as DB, {
        enrolmentId: session.enrolmentId,
        programExerciseId,
        fromExerciseId,
        toExerciseId: args.toExerciseId,
        scope: args.scope,
        programDay: session.programDay ?? undefined,
      });
    }
    const open = sets.filter((s) => !s.completed);
    if (open.length) {
      tx.update(setLogs)
        .set({ deletedAt: t, updatedAt: t })
        .where(
          inArray(
            setLogs.id,
            open.map((s) => s.id),
          ),
        )
        .run();
    }
    const enrolment = session.enrolmentId ? tx.select().from(enrolments).where(eq(enrolments.id, session.enrolmentId)).get() : undefined;
    if (enrolment && session.programDay != null) {
      const plan = programDayPlan(tx as unknown as DB, enrolment, session.programDay);
      const slot = plan.slots.find((s) => s.slot.id === programExerciseId);
      if (slot) {
        const resolved: ResolvedSlot = { ...slot, exercise: tx.select().from(exercises).where(eq(exercises.id, args.toExerciseId)).get()! };
        const base = Math.max(...sets.map((s) => s.setIndex)) + 1;
        const rows = buildSetRows(tx as unknown as DB, args.sessionId, resolved, args.today, getSettings(tx as unknown as DB)).map((r, i) => ({ ...r, setIndex: base + i }));
        if (rows.length) tx.insert(setLogs).values(rows).run();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

export type SessionSummary = {
  sessionId: string;
  status: 'completed' | 'partial';
  durationMin: number;
  volumeKg: number;
  workingSetsDone: number;
  workingSetsPlanned: number;
  prs: { exerciseName: string; pr: PR }[];
  next: { exerciseName: string; target: Target }[];
};

export function sessionCounts(detail: SessionDetail) {
  const working = detail.groups.flatMap((g) => g.sets).filter((s) => s.setType !== 'warmup');
  const done = working.filter((s) => s.completed);
  return { planned: working.length, done: done.length };
}

export function datedSets(db: DB, exerciseId: string, filter: { onlySession?: string; excludeSession?: string; before?: number }): DatedSet[] {
  const conds = [eq(setLogs.exerciseId, exerciseId), eq(setLogs.completed, true), isNull(setLogs.deletedAt), ne(setLogs.setType, 'warmup'), isNull(sessions.deletedAt)];
  if (filter.onlySession) conds.push(eq(setLogs.sessionId, filter.onlySession));
  else conds.push(inArray(sessions.status, [...DONE_STATUSES]));
  if (filter.excludeSession) conds.push(ne(setLogs.sessionId, filter.excludeSession));
  if (filter.before != null) conds.push(lt(sessions.startedAt, filter.before));
  return db
    .select({ l: setLogs, s: sessions })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(and(...conds))
    .all()
    .filter(({ l }) => l.weightKg != null && l.reps != null)
    .map(({ l, s }) => ({ weightKg: l.weightKg!, reps: l.reps!, rpe: l.rpe, date: s.date, sessionId: s.id }));
}

/**
 * Complete the workout. Saved as "partial" if some planned working sets were not
 * logged. Advances the program to the next day and records PRs.
 */
export function finishSession(db: DB, sessionId: string, now = Date.now()): SessionSummary {
  const detail = getSessionDetail(db, sessionId);
  if (!detail) throw new Error('Workout not found');
  if (detail.session.status !== 'in_progress') throw new Error('This workout is already finished');
  const { planned, done } = sessionCounts(detail);
  if (done === 0) throw new Error('Log at least one set, or discard the workout');
  const status = done >= planned ? 'completed' : 'partial';
  const s = detail.session;
  // Backfills: duration is the time spent entering it, capped at 2 hours, counted from the workout's own date.
  const endedAt = s.isBackfill ? s.startedAt + Math.min(Math.max(0, now - s.createdAt), 2 * 3_600_000) : now;

  db.transaction((tx) => {
    tx.update(sessions).set({ status, endedAt, updatedAt: now }).where(eq(sessions.id, sessionId)).run();
    // Cache best estimates per exercise for quick display / fallbacks
    for (const g of detail.groups) {
      const sets = g.sets.filter((x) => x.setType !== 'warmup' && x.completed && x.weightKg != null && x.reps != null).map((x) => ({ weightKg: x.weightKg!, reps: x.reps!, rpe: x.rpe }));
      if (!sets.length) continue;
      const e1 = bestE1RM(sets);
      tx.insert(exerciseStates)
        .values({ id: g.exercise.id, exerciseId: g.exercise.id, workingWeightKg: sessionWeight(sets), e1rmKg: e1, lastSessionId: sessionId })
        .onConflictDoUpdate({ target: exerciseStates.id, set: { workingWeightKg: sessionWeight(sets), e1rmKg: e1, lastSessionId: sessionId, updatedAt: now } })
        .run();
    }
    advanceProgram(tx as unknown as DB, s.enrolmentId, s.programDay);
  });
  return getSessionSummary(db, sessionId)!;
}

/** Totals, PRs (versus everything logged before this workout) and next targets for a finished workout. */
export function getSessionSummary(db: DB, sessionId: string): SessionSummary | undefined {
  const detail = getSessionDetail(db, sessionId);
  if (!detail || detail.session.status === 'in_progress' || detail.session.status === 'discarded') return undefined;
  const s = detail.session;
  const { planned, done } = sessionCounts(detail);

  const prs: SessionSummary['prs'] = [];
  const seen = new Set<string>();
  for (const g of detail.groups) {
    if (seen.has(g.exercise.id)) continue;
    seen.add(g.exercise.id);
    const current = datedSets(db, g.exercise.id, { onlySession: sessionId });
    const previous = datedSets(db, g.exercise.id, { excludeSession: sessionId, before: s.startedAt });
    for (const pr of findPRs(previous, current)) prs.push({ exerciseName: g.exercise.name, pr });
  }

  // What the engine suggests the next time this program day comes round (one cycle later),
  // with that week's phase and any accepted week plan applied, exactly as the session will start.
  const next: SessionSummary['next'] = [];
  const enrolment = s.enrolmentId ? db.select().from(enrolments).where(eq(enrolments.id, s.enrolmentId)).get() : undefined;
  if (enrolment && s.programDay != null) {
    const settings = getSettings(db);
    const current = programDayPlan(db, enrolment, s.programDay);
    const nextDay = s.programDay + current.cycleLength;
    if (nextDay < current.totalDays) {
      const plan = programDayPlan(db, enrolment, nextDay);
      for (const slot of plan.slots) {
        if (!detail.groups.some((g) => g.programExerciseId === slot.slot.id)) continue;
        next.push({ exerciseName: slot.exercise.name, target: targetForSlot(db, slot, addDays(s.date, 7), settings, slot.adjust) });
      }
    }
  }

  const working = detail.groups.flatMap((g) => g.sets).filter((x) => x.setType !== 'warmup' && x.completed && x.weightKg != null && x.reps != null);
  return {
    sessionId,
    status: s.status as 'completed' | 'partial',
    durationMin: Math.max(1, Math.round(((s.endedAt ?? s.startedAt) - s.startedAt) / 60000)),
    volumeKg: volumeKg(working.map((x) => ({ weightKg: x.weightKg!, reps: x.reps! }))),
    workingSetsDone: done,
    workingSetsPlanned: planned,
    prs,
    next,
  };
}

function advanceProgram(db: DB, enrolmentId: string | null, programDay: number | null) {
  if (!enrolmentId || programDay == null) return;
  const e = db.select().from(enrolments).where(eq(enrolments.id, enrolmentId)).get();
  if (!e || e.status !== 'active') return;
  const plan = programDayPlan(db, e, programDay);
  const nextDay = programDay + 1;
  if (e.currentDayIndex > programDay) return; // already past this day (e.g. a repeat of an earlier day)
  if (nextDay >= plan.totalDays) {
    db.update(enrolments)
      .set({ status: 'completed', currentDayIndex: plan.totalDays - 1, updatedAt: Date.now() })
      .where(eq(enrolments.id, e.id))
      .run();
  } else {
    db.update(enrolments).set({ currentDayIndex: nextDay, updatedAt: Date.now() }).where(eq(enrolments.id, e.id)).run();
  }
}

/** Mark a rest day done and move on. */
export function completeRestDay(db: DB, enrolmentId: string, programDay: number): void {
  advanceProgram(db, enrolmentId, programDay);
}

export function discardSession(db: DB, sessionId: string, now = Date.now()): void {
  const s = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!s) throw new Error('Workout not found');
  if (s.status !== 'in_progress') throw new Error('Only an unfinished workout can be discarded');
  db.update(sessions).set({ status: 'discarded', endedAt: now, updatedAt: now }).where(eq(sessions.id, sessionId)).run();
}

// ---------------------------------------------------------------------------
// History & progress
// ---------------------------------------------------------------------------

export type SessionListItem = Session & { volumeKg: number; setsDone: number };

export function listSessions(db: DB, limit = 50): SessionListItem[] {
  const rows = db
    .select()
    .from(sessions)
    .where(and(inArray(sessions.status, [...DONE_STATUSES]), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.startedAt))
    .limit(limit)
    .all();
  if (!rows.length) return [];
  const logs = db
    .select()
    .from(setLogs)
    .where(
      and(
        inArray(
          setLogs.sessionId,
          rows.map((r) => r.id),
        ),
        isNull(setLogs.deletedAt),
        eq(setLogs.completed, true),
        ne(setLogs.setType, 'warmup'),
      ),
    )
    .all();
  return rows.map((r) => {
    const mine = logs.filter((l) => l.sessionId === r.id && l.weightKg != null && l.reps != null);
    return { ...r, setsDone: mine.length, volumeKg: volumeKg(mine.map((l) => ({ weightKg: l.weightKg!, reps: l.reps! }))) };
  });
}

export type ExerciseProgress = {
  sessions: { sessionId: string; date: string; sets: DatedSet[]; e1rmKg: number; volumeKg: number }[];
  bestE1RM: { valueKg: number; date: string } | null;
  heaviest: { weightKg: number; reps: number; date: string } | null;
  repRecords: { reps: number; weightKg: number; date: string }[];
};

/** Everything logged for an exercise, newest first, with bests. */
export function exerciseProgress(db: DB, exerciseId: string): ExerciseProgress {
  const sets = datedSets(db, exerciseId, {});
  const bySession = new Map<string, DatedSet[]>();
  for (const s of sets) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s]);
  const list = [...bySession.entries()]
    .map(([sessionId, ss]) => ({ sessionId, date: ss[0].date, sets: ss, e1rmKg: bestE1RM(ss), volumeKg: volumeKg(ss) }))
    .sort((a, b) => b.date.localeCompare(a.date));

  let bestE: ExerciseProgress['bestE1RM'] = null;
  for (const s of list) if (!bestE || s.e1rmKg > bestE.valueKg) bestE = { valueKg: s.e1rmKg, date: s.date };
  let heaviest: ExerciseProgress['heaviest'] = null;
  for (const s of sets)
    if (!heaviest || s.weightKg > heaviest.weightKg || (s.weightKg === heaviest.weightKg && s.reps > heaviest.reps)) heaviest = { weightKg: s.weightKg, reps: s.reps, date: s.date };
  // Best weight achieved for each rep count 1–12 (classic rep-max table)
  const repRecords: ExerciseProgress['repRecords'] = [];
  for (let r = 1; r <= 12; r++) {
    const candidates = sets.filter((s) => s.reps >= r && s.weightKg > 0);
    if (!candidates.length) continue;
    const best = candidates.reduce((a, b) => (b.weightKg > a.weightKg ? b : a));
    if (!repRecords.length || best.weightKg < repRecords[repRecords.length - 1].weightKg || r === 1) repRecords.push({ reps: r, weightKg: best.weightKg, date: best.date });
  }
  return { sessions: list, bestE1RM: bestE && bestE.valueKg > 0 ? bestE : null, heaviest, repRecords };
}

/** Convenience for the Today screen. */
export function todayState(db: DB) {
  const inProgress = getInProgressSession(db);
  const enrolment = getActiveEnrolment(db);
  return { inProgress, enrolment };
}

/** Exercises you have logged, most recently trained first, with their latest estimates. */
export function listLoggedExercises(db: DB) {
  return db
    .select({ exercise: exercises, state: exerciseStates })
    .from(exerciseStates)
    .innerJoin(exercises, eq(exerciseStates.exerciseId, exercises.id))
    .where(isNull(exerciseStates.deletedAt))
    .orderBy(desc(exerciseStates.updatedAt))
    .all();
}

export type DayStatus = 'done' | 'partial' | 'rest' | 'rest_done' | 'missed' | 'current' | 'upcoming';

export type WeekDay = { programDay: number; name: string; focus: string; isRest: boolean; status: DayStatus; minutes?: number };

/** The days of one program week with their status, for the week strip on the Train screen. */
export function programWeek(db: DB, enrolmentId: string, week: number): { week: number; totalWeeks: number; days: WeekDay[] } {
  const enrolment = db.select().from(enrolments).where(eq(enrolments.id, enrolmentId)).get();
  if (!enrolment) throw new Error('Program not found');
  const tpl = getTemplateDetail(db, enrolment.templateId)!.template;
  const cycle = tpl.cycleLength;
  const totalDays = tpl.weeks * cycle;
  const totalWeeks = tpl.weeks;
  const w = Math.max(1, Math.min(totalWeeks, week));
  const start = (w - 1) * cycle;
  const done = db
    .select({ programDay: sessions.programDay, status: sessions.status })
    .from(sessions)
    .where(and(eq(sessions.enrolmentId, enrolmentId), inArray(sessions.status, [...DONE_STATUSES]), isNull(sessions.deletedAt)))
    .all();
  const days: WeekDay[] = [];
  for (let i = 0; i < cycle && start + i < totalDays; i++) {
    const pd = start + i;
    const plan = programDayPlan(db, enrolment, pd);
    const logged = done.filter((d) => d.programDay === pd);
    let status: DayStatus;
    if (logged.some((d) => d.status === 'completed')) status = 'done';
    else if (logged.length) status = 'partial';
    else if (pd === enrolment.currentDayIndex && enrolment.status === 'active') status = 'current';
    else if (pd < enrolment.currentDayIndex || enrolment.status === 'completed') status = plan.day.isRest ? 'rest_done' : 'missed';
    else status = plan.day.isRest ? 'rest' : 'upcoming';
    days.push({ programDay: pd, name: plan.day.name, focus: plan.day.focus, isRest: plan.day.isRest, status });
  }
  return { week: w, totalWeeks, days };
}

/** Most recent finished session for a program day (to open its log from the week strip). */
export function sessionForProgramDay(db: DB, enrolmentId: string, programDay: number): Session | undefined {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.enrolmentId, enrolmentId), eq(sessions.programDay, programDay), inArray(sessions.status, [...DONE_STATUSES]), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.startedAt))
    .get();
}

// ---------------------------------------------------------------------------
// In-workout extras: PRs as you log, and history without leaving the player
// ---------------------------------------------------------------------------

/**
 * Records this set just beat, compared with every other completed working set of the
 * exercise (earlier workouts and earlier sets today). Empty for warm-ups, bodyweight sets
 * and a lift's very first session (nothing to beat yet).
 */
export function prForSet(db: DB, setId: string): PR[] {
  const row = db.select({ l: setLogs, s: sessions }).from(setLogs).innerJoin(sessions, eq(setLogs.sessionId, sessions.id)).where(eq(setLogs.id, setId)).get();
  if (!row || !row.l.completed || row.l.setType === 'warmup' || row.l.weightKg == null || row.l.reps == null || row.l.weightKg <= 0) return [];
  const others = db
    .select({ l: setLogs, s: sessions })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(
      and(
        eq(setLogs.exerciseId, row.l.exerciseId),
        eq(setLogs.completed, true),
        isNull(setLogs.deletedAt),
        ne(setLogs.setType, 'warmup'),
        ne(setLogs.id, setId),
        isNull(sessions.deletedAt),
        inArray(sessions.status, [...DONE_STATUSES, 'in_progress']),
      ),
    )
    .all()
    .filter(({ l }) => l.weightKg != null && l.reps != null)
    .map(({ l, s }) => ({ weightKg: l.weightKg!, reps: l.reps!, rpe: l.rpe, date: s.date, sessionId: s.id }));
  const current = { weightKg: row.l.weightKg, reps: row.l.reps, rpe: row.l.rpe, date: row.s.date, sessionId: row.s.id };
  return findPRs(others, [current]);
}

/** The headline record for a toast: heaviest weight beats a rep record beats an e1RM record. */
export function headlinePR(prs: PR[]): PR | null {
  return prs.find((p) => p.kind === 'weight') ?? prs.find((p) => p.kind === 'reps_at_weight') ?? prs.find((p) => p.kind === 'e1rm') ?? null;
}

export type HistorySession = { sessionId: string; date: string; sets: DatedSet[]; e1rmKg: number };
export type ExerciseHistory = {
  /** Newest first, this program slot only */
  inProgram: HistorySession[];
  /** Newest first, every session of this exercise */
  allTime: HistorySession[];
  bestE1RM: ExerciseProgress['bestE1RM'];
  heaviest: ExerciseProgress['heaviest'];
  repRecords: ExerciseProgress['repRecords'];
};

/** History for the in-workout sheet; the workout in progress is left out. */
export function exerciseHistory(db: DB, exerciseId: string, opts: { programExerciseId?: string | null; excludeSessionId?: string; limit?: number } = {}): ExerciseHistory {
  const limit = opts.limit ?? 8;
  const progress = exerciseProgress(db, exerciseId);
  const allTime = progress.sessions.filter((s) => s.sessionId !== opts.excludeSessionId);
  let inProgram: HistorySession[] = [];
  if (opts.programExerciseId) {
    const ids = new Set(
      db
        .select({ id: setLogs.sessionId })
        .from(setLogs)
        .where(and(eq(setLogs.programExerciseId, opts.programExerciseId), eq(setLogs.completed, true), isNull(setLogs.deletedAt)))
        .all()
        .map((r) => r.id),
    );
    inProgram = allTime.filter((s) => ids.has(s.sessionId));
  }
  return {
    inProgram: inProgram.slice(0, limit),
    allTime: allTime.slice(0, limit),
    bestE1RM: progress.bestE1RM,
    heaviest: progress.heaviest,
    repRecords: progress.repRecords,
  };
}
