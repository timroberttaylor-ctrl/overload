import { describe, expect, it } from 'vitest';

import { bestE1RM, estimate1RM, nextTarget, pctOf1RM, sessionWeight, warmupSets, type Prescription, type SessionResult } from '@/core/overload';

const linear: Prescription = { rule: 'linear', sets: 3, repMin: 5, repMax: 5, targetRpe: 8, incrementKg: 2.5, roundStepKg: 2.5, failsBeforeReset: 3, resetPct: 0.9 };
const double: Prescription = { rule: 'double', sets: 3, repMin: 8, repMax: 12, targetRpe: null, incrementKg: 2.5, roundStepKg: 2.5, failsBeforeReset: 3, resetPct: 0.9 };
const rpe: Prescription = { rule: 'rpe', sets: 1, repMin: 6, repMax: 8, targetRpe: 9, incrementKg: 2.5, roundStepKg: 2.5, failsBeforeReset: 3, resetPct: 0.9 };

const sess = (date: string, weight: number, reps: number[], rpeVal?: number, planned = reps.length): SessionResult => ({
  date,
  plannedSets: planned,
  sets: reps.map((r) => ({ weightKg: weight, reps: r, rpe: rpeVal ?? null })),
});

describe('strength estimates', () => {
  it('Epley with reps in reserve', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 2);
    expect(estimate1RM(100, 5, 8)).toBeCloseTo(123.33, 2); // 5 reps + 2 in reserve
    expect(estimate1RM(0, 5)).toBe(0);
    // pct is the exact inverse
    expect(100 * (1 / pctOf1RM(5, 8))).toBeCloseTo(estimate1RM(100, 5, 8), 6);
    expect(bestE1RM([{ weightKg: 100, reps: 5 }, { weightKg: 110, reps: 3 }])).toBeCloseTo(121, 0);
  });

  it('session weight is the most common load', () => {
    expect(sessionWeight([{ weightKg: 60, reps: 8 }, { weightKg: 80, reps: 8 }, { weightKg: 80, reps: 7 }])).toBe(80);
    expect(sessionWeight([])).toBeNull();
  });
});

describe('linear progression', () => {
  it('first exposure asks the lifter to choose', () => {
    const t = nextTarget({ prescription: linear, history: [], today: '2026-10-22' });
    expect(t.weightKg).toBeNull();
    expect(t.kind).toBe('first');
    expect(t.reps).toEqual([5, 5, 5]);
  });

  it('adds the increment after a successful session', () => {
    const t = nextTarget({ prescription: linear, history: [sess('2026-10-20', 100, [5, 5, 5], 8)], today: '2026-10-22' });
    expect(t).toMatchObject({ weightKg: 102.5, kind: 'increase', reps: [5, 5, 5] });
    expect(t.reason).toMatch(/\+2.5 kg/);
  });

  it('linear may increase every session (no weekly cap)', () => {
    const h = [sess('2026-10-20', 100, [5, 5, 5]), sess('2026-10-22', 102.5, [5, 5, 5])];
    expect(nextTarget({ prescription: linear, history: h, today: '2026-10-24' }).weightKg).toBe(105);
  });

  it('holds after a miss, and RPE far above target counts as a miss', () => {
    expect(nextTarget({ prescription: linear, history: [sess('2026-10-20', 100, [5, 5, 4])], today: '2026-10-22' })).toMatchObject({ weightKg: 100, kind: 'hold', fails: 1 });
    expect(nextTarget({ prescription: linear, history: [sess('2026-10-20', 100, [5, 5, 5], 10)], today: '2026-10-22' }).kind).toBe('hold');
    // skipped set = not all done
    expect(nextTarget({ prescription: linear, history: [sess('2026-10-20', 100, [5, 5], undefined, 3)], today: '2026-10-22' }).kind).toBe('hold');
  });

  it('resets to 90% after three misses at the same weight', () => {
    const h = [sess('2026-10-13', 100, [5, 5, 4]), sess('2026-10-16', 100, [5, 4, 4]), sess('2026-10-20', 100, [5, 4, 3])];
    const t = nextTarget({ prescription: linear, history: h, today: '2026-10-22' });
    expect(t).toMatchObject({ weightKg: 90, kind: 'reset', fails: 3 });
  });

  it('a success in between clears the miss streak', () => {
    const h = [sess('2026-10-13', 100, [5, 5, 4]), sess('2026-10-16', 100, [5, 5, 4]), sess('2026-10-18', 97.5, [5, 5, 5]), sess('2026-10-20', 100, [5, 5, 4])];
    expect(nextTarget({ prescription: linear, history: h, today: '2026-10-22' })).toMatchObject({ kind: 'hold', fails: 1 });
  });
});

describe('double progression', () => {
  it('adds a rep to the weakest set inside the range', () => {
    const t = nextTarget({ prescription: double, history: [sess('2026-10-15', 50, [10, 9, 8])], today: '2026-10-22' });
    expect(t).toMatchObject({ weightKg: 50, kind: 'add_reps', reps: [10, 9, 9] });
  });

  it('adds load and resets reps once every set hits the top', () => {
    const t = nextTarget({ prescription: double, history: [sess('2026-10-15', 50, [12, 12, 12])], today: '2026-10-22' });
    expect(t).toMatchObject({ weightKg: 52.5, kind: 'increase', reps: [8, 8, 8] });
  });

  it('exercises with no load step ask for a harder variation instead of +0 kg', () => {
    const t = nextTarget({ prescription: { ...double, incrementKg: 0 }, history: [sess('2026-10-15', 0, [12, 12, 12])], today: '2026-10-22' });
    expect(t).toMatchObject({ weightKg: 0, kind: 'hold' });
    expect(t.reason).toMatch(/harder/);
  });

  it('at most one load increase per 7 days', () => {
    const h = [sess('2026-10-15', 50, [12, 12, 12]), sess('2026-10-18', 52.5, [12, 12, 12])];
    expect(nextTarget({ prescription: double, history: h, today: '2026-10-21' })).toMatchObject({ weightKg: 52.5, kind: 'hold' });
    expect(nextTarget({ prescription: double, history: h, today: '2026-10-25' })).toMatchObject({ weightKg: 55, kind: 'increase' });
  });

  it('counts stalls (no rep gains) and drops below-range sessions as misses', () => {
    const stalled = [sess('2026-10-01', 50, [10, 9, 8]), sess('2026-10-08', 50, [10, 9, 8]), sess('2026-10-15', 50, [10, 9, 8]), sess('2026-10-20', 50, [10, 9, 8])];
    expect(nextTarget({ prescription: double, history: stalled, today: '2026-10-22' })).toMatchObject({ kind: 'reset', weightKg: 45 });
    const improving = [sess('2026-10-08', 50, [10, 9, 8]), sess('2026-10-15', 50, [10, 9, 9]), sess('2026-10-20', 50, [10, 10, 9])];
    expect(nextTarget({ prescription: double, history: improving, today: '2026-10-22' }).kind).toBe('add_reps');
    expect(nextTarget({ prescription: double, history: [sess('2026-10-20', 50, [9, 7, 6])], today: '2026-10-22' })).toMatchObject({ fails: 1 });
  });

  it('uses an e1RM from elsewhere when the slot is new', () => {
    const t = nextTarget({ prescription: double, history: [], fallbackE1RM: 100, today: '2026-10-22' });
    expect(t.kind).toBe('estimate');
    expect(t.weightKg).toBe(67.5); // 100 / (1 + 14/30) ≈ 68.2 → rounded down to 67.5
  });
});

describe('RPE-based', () => {
  it('derives the next top-set load from the e1RM and rounds to plates', () => {
    const t = nextTarget({ prescription: rpe, history: [sess('2026-10-15', 100, [8], 9)], today: '2026-10-22' });
    // e1RM = 100 × (1 + 9/30) = 130; 6 reps @ RPE 9 → 130 / (1 + 7/30) = 105.4 → 105
    expect(t.e1rmKg).toBeCloseTo(130, 6);
    expect(t).toMatchObject({ weightKg: 105, kind: 'increase', reps: [6] });
  });

  it('caps the jump at +7.5% and drops on a bad day', () => {
    const big = nextTarget({ prescription: rpe, history: [sess('2026-10-15', 100, [12], 8)], today: '2026-10-22' });
    expect(big.weightKg).toBe(107.5);
    const bad = nextTarget({ prescription: rpe, history: [sess('2026-10-15', 100, [4], 10)], today: '2026-10-22' });
    expect(bad.weightKg).toBeLessThan(100);
    expect(bad.weightKg).toBeGreaterThanOrEqual(90);
  });
});

describe('adjustments', () => {
  it('low readiness blocks increases but not holds', () => {
    const t = nextTarget({ prescription: linear, history: [sess('2026-10-20', 100, [5, 5, 5])], today: '2026-10-22', adjust: { noIncrease: true, reason: 'Readiness is low' } });
    expect(t).toMatchObject({ weightKg: 100, kind: 'hold' });
    expect(t.reason).toMatch(/Readiness is low/);
  });

  it('an RPE cap lowers the RPE target and the calculated load', () => {
    const normal = nextTarget({ prescription: rpe, history: [sess('2026-10-15', 100, [8], 9)], today: '2026-10-22' });
    const capped = nextTarget({ prescription: rpe, history: [sess('2026-10-15', 100, [8], 9)], today: '2026-10-22', adjust: { rpeCap: 7 } });
    expect(capped.rpe).toBe(7);
    expect(capped.weightKg!).toBeLessThan(normal.weightKg!);
  });

  it('tracking-only exercises suggest repeating last time', () => {
    const t = nextTarget({ prescription: { ...double, rule: 'none' }, history: [sess('2026-10-15', 0, [45, 40, 38])], today: '2026-10-22' });
    expect(t).toMatchObject({ kind: 'track', reps: [45, 40, 38] });
  });
});

describe('warm-ups', () => {
  it('ramps toward the working weight, never below the bar', () => {
    expect(warmupSets(100, 3, { stepKg: 2.5, barKg: 20 })).toEqual([
      { weightKg: 55, reps: 5 },
      { weightKg: 70, reps: 3 },
      { weightKg: 85, reps: 2 },
    ]);
    expect(warmupSets(30, 3, { stepKg: 2.5, barKg: 20 })).toEqual([{ weightKg: 20, reps: 5 }, { weightKg: 25, reps: 2 }]);
    expect(warmupSets(null, 2, { stepKg: 2.5 })).toEqual([]);
  });
});
