import { describe, expect, it } from 'vitest';

import { getActiveEnrolment, programDayPlan, startProgram } from '@/db/repositories/enrolments';
import {
  addSet,
  completeRestDay,
  discardSession,
  exerciseProgress,
  finishSession,
  getInProgressSession,
  getSessionDetail,
  listSessions,
  logSet,
  removeSet,
  startProgramSession,
  swapInSession,
  unlogSet,
} from '@/db/repositories/sessions';
import type { DB } from '@/db/types';
import { createTestDb } from './helpers';

const T0 = Date.UTC(2026, 9, 20, 20, 0); // 7am Sydney-ish

/** Log every working set in a session at the given weight/reps per exercise. */
function logAll(db: DB, sessionId: string, pick: (exerciseId: string) => { w: number; reps: number[] } | undefined, now: number) {
  const d = getSessionDetail(db, sessionId)!;
  for (const g of d.groups) {
    const p = pick(g.exercise.id);
    if (!p) continue;
    const working = g.sets.filter((s) => s.setType !== 'warmup');
    working.forEach((s, i) => logSet(db, s.id, { weightKg: p.w, reps: p.reps[i] ?? p.reps[p.reps.length - 1] }, now));
  }
}

describe('workout sessions', () => {
  it('starts from a program day with targets, warm-ups and rest times', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20', now: T0 });
    expect(s.status).toBe('in_progress');
    const d = getSessionDetail(db, s.id)!;
    expect(d.groups.map((g) => g.exercise.id)).toEqual(['bench_press', 'barbell_row', 'seated_db_press', 'lat_pulldown', 'triceps_pushdown', 'db_curl']);
    const bench = d.groups[0];
    // First time: no weight suggested, so no warm-ups can be calculated yet
    expect(bench.sets.filter((x) => x.setType === 'working')).toHaveLength(3);
    expect(bench.sets[0].targetWeightKg).toBeNull();
    expect(bench.note).toMatch(/First time/);
    expect(bench.restS).toBe(180);
    expect(() => startProgramSession(db, { enrolmentId: e.id, programDay: 1, date: '2026-10-20' })).toThrow(/already in progress/);
    expect(() => startProgramSession(db, { enrolmentId: e.id, programDay: 2, date: '2026-10-20' })).toThrow();
  });

  it('logs, edits, adds and removes sets; survives a "restart" by reading from the db', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20', now: T0 });
    const first = getSessionDetail(db, s.id)!.groups[0].sets[0];
    logSet(db, first.id, { weightKg: 80, reps: 5, rpe: 8 }, T0 + 60_000);
    expect(() => logSet(db, first.id, { weightKg: 80, reps: 5.5 })).toThrow();
    expect(() => logSet(db, first.id, { weightKg: -1, reps: 5 })).toThrow();
    const extra = addSet(db, s.id, 0);
    expect(extra.weightKg).toBe(80); // later sets picked up the logged weight
    removeSet(db, extra.id);
    unlogSet(db, first.id);
    logSet(db, first.id, { weightKg: 80, reps: 5 }, T0 + 90_000);

    // App killed and reopened: the in-progress workout is still there, with the logged set
    const resumed = getInProgressSession(db)!;
    expect(resumed.id).toBe(s.id);
    const g = getSessionDetail(db, resumed.id)!.groups[0];
    expect(g.sets.filter((x) => x.completed)).toHaveLength(1);
    expect(g.sets).toHaveLength(3);
  });

  it('finish requires at least one set, saves partial workouts honestly and advances the program', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20', now: T0 });
    expect(() => finishSession(db, s.id)).toThrow(/at least one set/);
    logAll(db, s.id, (id) => (id === 'bench_press' ? { w: 80, reps: [5, 5, 5] } : undefined), T0 + 600_000);
    const sum = finishSession(db, s.id, T0 + 3_600_000);
    expect(sum.status).toBe('partial');
    expect(sum.workingSetsDone).toBe(3);
    expect(sum.durationMin).toBe(60);
    expect(sum.volumeKg).toBe(1200);
    expect(getActiveEnrolment(db)!.currentDayIndex).toBe(1);
    expect(listSessions(db)[0]).toMatchObject({ id: s.id, setsDone: 3, volumeKg: 1200 });
    const bench = sum.next.find((n) => n.exerciseName === 'Barbell Bench Press')!;
    expect(bench.target).toMatchObject({ weightKg: 82.5, kind: 'increase' });
  });

  it('feeds the next session: progression, warm-ups and "last time"', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const s1 = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20', now: T0 });
    logAll(db, s1.id, (id) => ({ bench_press: { w: 80, reps: [5, 5, 5] }, seated_db_press: { w: 24, reps: [12, 12, 12] }, lat_pulldown: { w: 60, reps: [10, 9, 8] } })[id], T0 + 60_000);
    finishSession(db, s1.id, T0 + 3_600_000);

    // Repeat the same day a week later
    const s2 = startProgramSession(db, { enrolmentId: e.id, programDay: 7, date: '2026-10-27', now: T0 + 7 * 86_400_000 });
    const d = getSessionDetail(db, s2.id)!;
    const bench = d.groups.find((g) => g.exercise.id === 'bench_press')!;
    const working = bench.sets.filter((x) => x.setType === 'working');
    expect(working.map((x) => x.weightKg)).toEqual([82.5, 82.5, 82.5]);
    expect(bench.sets.filter((x) => x.setType === 'warmup').length).toBe(2);
    expect(bench.sets[0].weightKg).toBeLessThan(82.5);
    expect(bench.lastTime?.sets.map((x) => x.reps)).toEqual([5, 5, 5]);
    const press = d.groups.find((g) => g.exercise.id === 'seated_db_press')!;
    expect(press.sets.filter((x) => x.setType === 'working').map((x) => [x.weightKg, x.reps])).toEqual([
      [26, 8],
      [26, 8],
      [26, 8],
    ]);
    const pulldown = d.groups.find((g) => g.exercise.id === 'lat_pulldown')!;
    expect(pulldown.sets.map((x) => x.reps)).toEqual([10, 9, 9]);
    expect(pulldown.note).toMatch(/one more rep/);
  });

  it('finds PRs against earlier sessions', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const s1 = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20', now: T0 });
    logAll(db, s1.id, (id) => (id === 'bench_press' ? { w: 80, reps: [5, 5, 5] } : undefined), T0);
    expect(finishSession(db, s1.id, T0 + 1000).prs).toHaveLength(0); // no history yet → no "records"
    const s2 = startProgramSession(db, { enrolmentId: e.id, programDay: 7, date: '2026-10-27', now: T0 + 7 * 86_400_000 });
    logAll(db, s2.id, (id) => (id === 'bench_press' ? { w: 82.5, reps: [6, 5, 5] } : undefined), T0 + 7 * 86_400_000);
    const kinds = finishSession(db, s2.id, T0 + 7 * 86_400_000 + 1000).prs.map((p) => p.pr.kind).sort();
    expect(kinds).toEqual(['e1rm', 'weight']);
    const prog = exerciseProgress(db, 'bench_press');
    expect(prog.sessions).toHaveLength(2);
    expect(prog.heaviest).toMatchObject({ weightKg: 82.5, reps: 6 });
    expect(prog.repRecords[0]).toMatchObject({ reps: 1, weightKg: 82.5 });
  });

  it('discard records nothing and does not advance the program', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_ppl_6', '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20', now: T0 });
    logAll(db, s.id, () => ({ w: 50, reps: [8] }), T0);
    discardSession(db, s.id);
    expect(getInProgressSession(db)).toBeUndefined();
    expect(listSessions(db)).toHaveLength(0);
    expect(exerciseProgress(db, 'bench_press').sessions).toHaveLength(0);
    expect(getActiveEnrolment(db)!.currentDayIndex).toBe(0);
    expect(() => discardSession(db, s.id)).toThrow();
  });

  it('rest days advance the program; finishing the last day completes it', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    completeRestDay(db, e.id, 0);
    expect(getActiveEnrolment(db)!.currentDayIndex).toBe(1);
    completeRestDay(db, e.id, 0); // repeating an earlier day does not move backwards
    expect(getActiveEnrolment(db)!.currentDayIndex).toBe(1);
    const last = programDayPlan(db, e, 999).programDay;
    completeRestDay(db, e.id, last);
    expect(getActiveEnrolment(db)).toBeUndefined();
  });

  it('swaps an exercise mid-workout, keeping logged sets', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_ppl_6', '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 2, date: '2026-10-20', now: T0 });
    const curl = getSessionDetail(db, s.id)!.groups.find((g) => g.exercise.id === 'lying_leg_curl')!;
    logSet(db, curl.sets[0].id, { weightKg: 40, reps: 12 });
    swapInSession(db, { sessionId: s.id, exerciseOrder: curl.exerciseOrder, toExerciseId: 'seated_leg_curl', scope: 'session', today: '2026-10-20' });
    const after = getSessionDetail(db, s.id)!;
    const groups = after.groups.filter((g) => g.exerciseOrder === curl.exerciseOrder);
    expect(groups.map((g) => g.exercise.id)).toEqual(['lying_leg_curl', 'seated_leg_curl']);
    expect(groups[0].sets).toHaveLength(1); // the logged set stays, unlogged ones were replaced
    expect(groups[0].sets[0].completed).toBe(true);
    expect(groups[1].sets).toHaveLength(3);
    // session scope: the following week's plan is unchanged
    expect(programDayPlan(db, e, 9).slots.find((x) => x.slot.id === curl.programExerciseId)!.exercise.id).toBe('lying_leg_curl');
  });
});

import { programWeek } from '@/db/repositories/sessions';

describe('program week strip', () => {
  it('marks done, partial, missed, current and upcoming days', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20', now: T0 });
    logAll(db, s.id, () => ({ w: 50, reps: [5, 5, 5, 12] }), T0);
    finishSession(db, s.id, T0 + 1000);
    completeRestDay(db, e.id, 1); // skipped Lower A without logging → missed
    const w1 = programWeek(db, e.id, 1);
    expect(w1.totalWeeks).toBe(8);
    expect(w1.days.map((d) => d.status)).toEqual(['done', 'missed', 'current', 'upcoming', 'upcoming', 'rest', 'rest']);
    expect(programWeek(db, e.id, 99).week).toBe(8);
  });
});
