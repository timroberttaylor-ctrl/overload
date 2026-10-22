/** Plate calculator, PRs as you log, and the in-workout history sheet. */
import { describe, expect, it } from 'vitest';

import { availablePlates, describeLoading, loadBar } from '@/core/plates';
import { startProgram } from '@/db/repositories/enrolments';
import { exerciseHistory, finishSession, getSessionDetail, headlinePR, logSet, prForSet, startProgramSession } from '@/db/repositories/sessions';
import { createTestDb } from './helpers';

describe('plate calculator', () => {
  it('loads a kg bar per side, heaviest plates first', () => {
    const l = loadBar(102.5, 'kg', 2.5)!;
    expect(l.perSide).toEqual([25, 15, 1.25]);
    expect(l.exact).toBe(true);
    expect(describeLoading(l, 'kg')).toBe('20 kg bar + 25 · 15 · 1.25 per side');
  });

  it('handles the empty bar, too-light weights and loads it cannot make exactly', () => {
    expect(describeLoading(loadBar(20, 'kg', 2.5)!, 'kg')).toBe('Empty bar (20 kg)');
    expect(loadBar(15, 'kg', 2.5)).toBeNull();
    const odd = loadBar(61, 'kg', 2.5)!; // 61 needs 0.5 kg per side, smaller than the 1.25 plates
    expect(odd.exact).toBe(false);
    expect(describeLoading(odd, 'kg')).toBe('20 kg bar + 20 per side (= 60 kg)');
  });

  it('uses micro plates only when your smallest jump allows them', () => {
    expect(availablePlates('kg', 2.5)).not.toContain(0.5);
    expect(availablePlates('kg', 1)).toContain(0.5);
    expect(loadBar(61, 'kg', 1)!.perSide).toEqual([20, 0.5]);
  });

  it('works in pounds', () => {
    expect(describeLoading(loadBar(225, 'lb', 5)!, 'lb')).toBe('45 lb bar + 45 · 45 per side');
    expect(loadBar(185, 'lb', 5)!.perSide).toEqual([45, 25]);
  });
});

async function benchSession(db: Awaited<ReturnType<typeof createTestDb>>['db'], enrolmentId: string, day: number, date: string, sets: [number, number][]) {
  const s = startProgramSession(db, { enrolmentId, programDay: day, date });
  const bench = getSessionDetail(db, s.id)!.groups.find((g) => g.exercise.id === 'bench_press')!;
  const working = bench.sets.filter((x) => x.setType === 'working');
  const ids = sets.map(([w, r], i) => {
    logSet(db, working[i].id, { weightKg: w, reps: r });
    return working[i].id;
  });
  return { session: s, bench, ids };
}

describe('PRs as you log', () => {
  it('flags a heavier set, more reps at a weight, and nothing on a first-ever session', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-05');
    const first = await benchSession(db, e.id, 0, '2026-10-05', [
      [80, 5],
      [80, 5],
    ]);
    expect(prForSet(db, first.ids[0])).toEqual([]); // nothing to beat yet
    expect(headlinePR(prForSet(db, first.ids[1]))).toBeNull(); // same as the set before it
    finishSession(db, first.session.id);

    const second = await benchSession(db, e.id, 7, '2026-10-12', [
      [82.5, 5],
      [80, 7],
    ]);
    const heavier = headlinePR(prForSet(db, second.ids[0]))!;
    expect(heavier.kind).toBe('weight');
    const reps = headlinePR(prForSet(db, second.ids[1]))!;
    expect(reps).toMatchObject({ kind: 'reps_at_weight', reps: 7, previousReps: 5 });
  });
});

describe('history in the player', () => {
  it('lists earlier sessions newest first, leaving out the workout in progress', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-05');
    const a = await benchSession(db, e.id, 0, '2026-10-05', [[80, 5]]);
    finishSession(db, a.session.id);
    const b = await benchSession(db, e.id, 7, '2026-10-12', [[82.5, 5]]);
    finishSession(db, b.session.id);
    const live = await benchSession(db, e.id, 14, '2026-10-19', [[85, 5]]);

    const h = exerciseHistory(db, 'bench_press', { programExerciseId: live.bench.programExerciseId, excludeSessionId: live.session.id });
    expect(h.inProgram.map((s) => s.date)).toEqual(['2026-10-12', '2026-10-05']);
    expect(h.allTime.map((s) => s.date)).toEqual(['2026-10-12', '2026-10-05']);
    expect(h.heaviest).toMatchObject({ weightKg: 82.5, reps: 5 });

    // A different program's bench shows in all-time but not "this program".
    const other = exerciseHistory(db, 'bench_press', { programExerciseId: 'some-other-slot' });
    expect(other.inProgram).toEqual([]);
    expect(other.allTime.length).toBe(2);
  });
});
