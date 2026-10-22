/** Per-set rep schemes and sets to failure. */
import { describe, expect, it } from 'vitest';

import { nextTarget, type Prescription } from '@/core/overload';
import { describeEntries, fitScheme, formatScheme, parseScheme, readScheme, schemeForWeek } from '@/core/scheme';
import { startProgram } from '@/db/repositories/enrolments';
import { getSessionDetail, startProgramSession } from '@/db/repositories/sessions';
import { createTestDb } from './helpers';
import { Lifter, runProgramWeek } from './sim-helpers';

describe('rep scheme text', () => {
  it('parses sets, failure sets and weekly rotation, and round-trips', () => {
    expect(parseScheme('12,10,8,8')).toEqual([[12, 10, 8, 8]]);
    expect(parseScheme('20, 20, 20, 20, F')).toEqual([[20, 20, 20, 20, 'F']]);
    expect(parseScheme('10/10/10/10 | 12,10,8,8 | 8 6 6 10')).toEqual([
      [10, 10, 10, 10],
      [12, 10, 8, 8],
      [8, 6, 6, 10],
    ]);
    expect(parseScheme('max, ∞')).toEqual([['F', 'F']]);
    expect(parseScheme('  ')).toBeNull();
    expect(formatScheme(parseScheme('12,10,8,8 | 8,F'))).toBe('12,10,8,8 | 8,F');
  });

  it('rejects nonsense with a readable message', () => {
    expect(() => parseScheme('12,ten')).toThrow(/"ten" isn't a rep count/);
    expect(() => parseScheme('0')).toThrow();
    expect(() => parseScheme('1,1,1,1,1,1,1,1,1,1,1')).toThrow(/At most 10 sets/);
    expect(readScheme('{"bad":1}')).toBeNull();
    expect(readScheme('not json')).toBeNull();
  });

  it('rotates by week and fits fewer or more sets', () => {
    const wave = parseScheme('10,10,10,10 | 12,10,8,8 | 8,6,6,10')!;
    expect(schemeForWeek(wave, 1)).toEqual([10, 10, 10, 10]);
    expect(schemeForWeek(wave, 5)).toEqual([12, 10, 8, 8]);
    expect(fitScheme([12, 10, 8, 8], 2)).toEqual([12, 10]); // deload: first sets
    expect(fitScheme([20, 20, 'F'], 4)).toEqual([20, 20, null, 20]); // push: repeat last rep target
    expect(describeEntries([12, 10, 8, 8])).toBe('12/10/8/8');
    expect(describeEntries([20, 20, 20, 20, 'F'])).toBe('4 × 20 + to failure');
    expect(describeEntries(['F', 'F', 'F'])).toBe('3 × to failure');
  });
});

describe('progression with a scheme', () => {
  const p: Prescription = { rule: 'double', sets: 4, repMin: 15, repMax: 30, incrementKg: 2.5, roundStepKg: 2.5, failsBeforeReset: 3, resetPct: 0.9, repTargets: [30, 20, 15, 30] };
  const sess = (date: string, reps: number[], targets: (number | null)[]) => ({ date, plannedSets: reps.length, sets: reps.map((r, i) => ({ weightKg: 40, reps: r, target: targets[i] })) });

  it('adds load once every set hit its own target (30/20/15/30)', () => {
    const t = nextTarget({ prescription: p, history: [sess('2026-10-15', [30, 20, 15, 30], [30, 20, 15, 30])], today: '2026-10-22' });
    expect(t.kind).toBe('increase');
    expect(t.weightKg).toBe(42.5);
  });

  it('holds when a set fell short, and a failure set needs the top of the range', () => {
    const short = nextTarget({ prescription: p, history: [sess('2026-10-15', [30, 18, 15, 30], [30, 20, 15, 30])], today: '2026-10-22' });
    expect(short.weightKg).toBe(40);
    const amrap: Prescription = { ...p, repTargets: [20, 20, null], repMin: 15, repMax: 20, sets: 3 };
    const low = nextTarget({ prescription: amrap, history: [sess('2026-10-15', [20, 20, 14], [20, 20, null])], today: '2026-10-22' });
    expect(low.weightKg).toBe(40);
    const high = nextTarget({ prescription: amrap, history: [sess('2026-10-15', [20, 20, 22], [20, 20, null])], today: '2026-10-22' });
    expect(high.weightKg).toBe(42.5);
  });
});

describe('OVRLD workouts with schemes', () => {
  it('sets each pyramid set its own load and marks failure sets', async () => {
    const { db } = await createTestDb();
    const lifter = new Lifter();
    const e = startProgram(db, 'tpl_ovrld_intermediate', '2026-01-05');
    runProgramWeek(db, lifter, e.id, 1, '2026-01-05', 7, {});
    lifter.endWeek('as_written', 5);

    // Week 2, Chest day: incline pyramid 12/10/8/8.
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 8, date: '2026-01-13' });
    const groups = getSessionDetail(db, s.id)!.groups;
    const incline = groups.find((g) => g.exercise.id === 'incline_bench')!.sets.filter((x) => x.setType === 'working');
    expect(incline.map((x) => x.targetReps)).toEqual([12, 10, 8, 8]);
    const w = incline.map((x) => x.targetWeightKg!);
    expect(w[0]).toBeLessThan(w[2]); // 12 reps lighter than 8 reps
    expect(w[0]).toBeLessThanOrEqual(w[1]);
    expect(w[2]).toBe(w[3]);

    // Rope extension: 4 × 20 then a set to failure at the same load.
    const ext = groups.find((g) => g.exercise.id === 'overhead_triceps_ext')!.sets.filter((x) => x.setType === 'working');
    expect(ext.map((x) => x.targetReps)).toEqual([20, 20, 20, 20, null]);
    expect(ext.map((x) => x.toFailure)).toEqual([false, false, false, false, true]);
    expect(ext[4].targetRpe).toBe(10);
    expect(ext[4].targetWeightKg).toBe(ext[3].targetWeightKg);
  });

});

describe('program builder', () => {
  it('saves reps per set, checks they match Sets, and loads them back as text', async () => {
    const { db } = await createTestDb();
    const { emptyDraft, saveProgram, draftFromTemplate } = await import('@/db/repositories/builder');
    const d = emptyDraft();
    d.name = 'Pyramids';
    d.days = [{ name: 'Day 1', isRest: false, slots: [{ exerciseId: 'bench_press', supersetWithPrevious: false, sets: 4, repMin: 8, repMax: 12, rule: 'double', targetRpe: null, restS: 120, warmupSets: 1, tempo: null, incrementKg: null, repScheme: '12,10,8,8 | 10,10,10,10' }] }];
    const id = saveProgram(db, d);
    expect(draftFromTemplate(db, id).days[0].slots[0].repScheme).toBe('12,10,8,8 | 10,10,10,10');

    d.days[0].slots[0].repScheme = '12,10,8';
    expect(() => saveProgram(db, d)).toThrow(/needs 4 entries per week to match Sets/);
    d.days[0].slots[0].repScheme = '12,ten,8,8';
    expect(() => saveProgram(db, d)).toThrow(/reps per set: "ten"/);
  });
});
