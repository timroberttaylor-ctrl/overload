import { describe, expect, it } from 'vitest';

import { startProgram } from '@/db/repositories/enrolments';
import { createCustomExercise, deleteCustomExercise, getExercise, listExercises, suggestAlternatives, updateCustomExercise } from '@/db/repositories/exercises';
import { exerciseResults, finishSession, getSessionDetail, listSessions, logSet, startProgramSession } from '@/db/repositories/sessions';
import { getSettings } from '@/db/repositories/settings';
import { createTestDb } from './helpers';

describe('custom exercises', () => {
  it('creates, validates, edits and deletes your own exercise', async () => {
    const { db } = await createTestDb();
    const base = {
      name: ' Landmine press ',
      primaryMuscle: 'front delts',
      secondaryMuscles: ['triceps', 'front delts'],
      equipment: 'barbell',
      pattern: 'push_v' as const,
      isCompound: true,
      defaultIncrementKg: 2.5,
      cues: ' Lean in slightly. ',
    };
    const ex = createCustomExercise(db, base);
    expect(ex).toMatchObject({ name: 'Landmine press', isCustom: true, cues: 'Lean in slightly.' });
    expect(JSON.parse(ex.secondaryMuscles)).toEqual(['triceps']); // primary isn't repeated as secondary
    expect(listExercises(db, { customOnly: true }).map((e) => e.id)).toEqual([ex.id]);
    expect(suggestAlternatives(db, 'ohp').map((e) => e.id)).toContain(ex.id);

    expect(() => createCustomExercise(db, { ...base, name: '  ' })).toThrow(/name/);
    expect(() => createCustomExercise(db, { ...base, primaryMuscle: '' })).toThrow(/muscle/);
    expect(() => createCustomExercise(db, { ...base, pattern: 'jump' as never })).toThrow(/movement/);
    expect(() => createCustomExercise(db, { ...base, defaultIncrementKg: -1 })).toThrow(/step/);

    updateCustomExercise(db, ex.id, { ...base, name: 'Half-kneeling landmine press', defaultIncrementKg: 1.25 });
    expect(getExercise(db, ex.id)).toMatchObject({ name: 'Half-kneeling landmine press', defaultIncrementKg: 1.25 });
    expect(() => updateCustomExercise(db, 'bench_press', base)).toThrow(/Built-in/);
    expect(() => deleteCustomExercise(db, 'bench_press')).toThrow(/own/);

    deleteCustomExercise(db, ex.id);
    expect(listExercises(db, { customOnly: true })).toEqual([]);
  });
});

describe('backfilling a past workout', () => {
  it('dates the workout on the chosen day, keeps history in order and has no live timer duration', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-15');
    // A normal workout today…
    const live = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-22', now: new Date(2026, 9, 22, 7).getTime() });
    for (const s of getSessionDetail(db, live.id)!.groups[0].sets) logSet(db, s.id, { weightKg: 82.5, reps: 5 });
    finishSession(db, live.id);

    // …then the user remembers an earlier bench session from Monday.
    expect(() => startProgramSession(db, { enrolmentId: e.id, programDay: 1, date: '2026-10-25', backfill: true, today: '2026-10-22' })).toThrow(/future/);
    const past = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-19', backfill: true, today: '2026-10-22' });
    expect(past).toMatchObject({ isBackfill: true, date: '2026-10-19', startedAt: new Date(2026, 9, 19, 12).getTime() });
    for (const s of getSessionDetail(db, past.id)!.groups[0].sets) logSet(db, s.id, { weightKg: 80, reps: 5 });
    finishSession(db, past.id, past.createdAt + 5 * 60_000);
    const done = getSessionDetail(db, past.id)!.session;
    expect(done.endedAt! - done.startedAt).toBe(5 * 60_000);

    // History is ordered by when the workouts happened, not when they were entered.
    expect(exerciseResults(db, 'bench_press').map((r) => r.sets[0].weightKg)).toEqual([80, 82.5]);
    expect(listSessions(db).map((s) => s.date)).toEqual(['2026-10-22', '2026-10-19']);
  });
});

describe('settings', () => {
  it('no longer carries readiness-only settings', async () => {
    const { db } = await createTestDb();
    expect(Object.keys(getSettings(db)).sort()).toEqual(['appearance', 'autoAdvanceAfterLog', 'autoAdvanceAfterRest', 'onboarded', 'plateIncrementKg', 'restCountdownSound', 'units']);
  });
});

describe('logging carries the weight forward', () => {
  it('fills later sets of the same exercise that have no weight yet', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20' });
    const bench = () => getSessionDetail(db, s.id)!.groups[0].sets.filter((x) => x.setType === 'working');
    expect(bench().map((x) => x.weightKg)).toEqual([null, null, null]); // first time: no suggestion
    logSet(db, bench()[0].id, { weightKg: 80, reps: 5 });
    expect(bench().map((x) => x.weightKg)).toEqual([80, 80, 80]);
    logSet(db, bench()[1].id, { weightKg: 82.5, reps: 5 });
    expect(bench().map((x) => x.weightKg)).toEqual([80, 82.5, 80]); // only empty sets are filled
    expect(getSessionDetail(db, s.id)!.groups[1].sets.every((x) => x.weightKg == null || x.setType === 'warmup')).toBe(true);
  });
});

describe('notes', () => {
  it('saves set and workout notes, shows them next time and in the week review', async () => {
    const { db } = await createTestDb();
    const { weekNotes } = await import('@/db/repositories/planner');
    const { setSetNote, setSessionNote } = await import('@/db/repositories/sessions');
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20', now: Date.UTC(2026, 9, 20, 8) });
    const sets = getSessionDetail(db, s.id)!.groups[0].sets.filter((x) => x.setType === 'working');
    for (const x of sets) logSet(db, x.id, { weightKg: 80, reps: 5 });
    setSetNote(db, sets[2].id, '  Left shoulder felt off  ');
    setSessionNote(db, s.id, 'Slept badly');
    expect(() => setSetNote(db, sets[0].id, 'x'.repeat(281))).toThrow(/280/);
    finishSession(db, s.id, Date.UTC(2026, 9, 20, 9));

    // Next bench session shows the note from last time
    const next = startProgramSession(db, { enrolmentId: e.id, programDay: 7, date: '2026-10-27', now: Date.UTC(2026, 9, 27, 8) });
    expect(getSessionDetail(db, next.id)!.groups[0].lastNotes).toEqual([{ date: '2026-10-20', note: 'Left shoulder felt off' }]);
    expect(getSessionDetail(db, next.id)!.groups[1].lastNotes).toEqual([]);

    expect(weekNotes(db, e.id, 1)).toEqual([
      { date: '2026-10-20', session: 'Upper A', exercise: null, note: 'Slept badly' },
      { date: '2026-10-20', session: 'Upper A', exercise: 'Barbell Bench Press', note: 'Left shoulder felt off' },
    ]);
    setSetNote(db, sets[2].id, '   ');
    expect(weekNotes(db, e.id, 1)).toHaveLength(1);
  });
});
