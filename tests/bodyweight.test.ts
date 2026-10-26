import { describe, expect, it } from 'vitest';

import { chartScale, inRange, weightStats, withTrend } from '@/core/bodyweight';
import { deleteBodyweight, latestBodyweight, listBodyweights, logBodyweight } from '@/db/repositories/body';
import { createTestDb } from './helpers';

describe('body-weight trend', () => {
  it('averages the weigh-ins in the last 7 days for each entry', () => {
    const t = withTrend([
      { date: '2026-10-01', kg: 100 },
      { date: '2026-10-03', kg: 98 },
      { date: '2026-10-07', kg: 99 },
      { date: '2026-10-08', kg: 97 }, // 10-01 drops out (7 days earlier)
    ]);
    expect(t.map((p) => p.trendKg)).toEqual([100, 99, 99, 98]);
  });

  it('filters by range and leaves All untouched', () => {
    const e = [
      { date: '2026-06-01', kg: 100 },
      { date: '2026-09-30', kg: 98 },
      { date: '2026-10-20', kg: 97 },
    ];
    expect(inRange(e, '1m', '2026-10-25').map((x) => x.date)).toEqual(['2026-09-30', '2026-10-20']);
    expect(inRange(e, 'all', '2026-10-25')).toHaveLength(3);
  });

  it('reports change, range and a per-week rate', () => {
    const s = weightStats([
      { date: '2026-10-01', kg: 100 },
      { date: '2026-10-08', kg: 99.5 },
      { date: '2026-10-15', kg: 99 },
    ])!;
    expect(s).toMatchObject({ currentKg: 99, startKg: 100, changeKg: -1, minKg: 99, maxKg: 100, entries: 3 });
    expect(s.perWeekKg).toBeCloseTo(-0.5, 6);
    expect(weightStats([{ date: '2026-10-01', kg: 90 }])!.perWeekKg).toBeNull();
    expect(weightStats([])).toBeNull();
  });

  it('pads a flat series so the chart never divides by zero', () => {
    const s = chartScale([96, 96, 96]);
    expect(s.max - s.min).toBeGreaterThanOrEqual(2);
    expect(s.ticks[0]).toBe(s.min);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
  });
});

describe('body-weight history', () => {
  it('logs, replaces the same day, and deletes', async () => {
    const { db } = await createTestDb();
    logBodyweight(db, '2026-10-20', 96);
    logBodyweight(db, '2026-10-21', 95.6);
    logBodyweight(db, '2026-10-21', 95.4); // same day replaces
    expect(listBodyweights(db).map((b) => [b.date, b.kg])).toEqual([
      ['2026-10-20', 96],
      ['2026-10-21', 95.4],
    ]);
    deleteBodyweight(db, '2026-10-21');
    expect(latestBodyweight(db)?.date).toBe('2026-10-20');
    logBodyweight(db, '2026-10-21', 95.2); // re-logging a deleted day brings it back
    expect(listBodyweights(db)).toHaveLength(2);
  });
});
