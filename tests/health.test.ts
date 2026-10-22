import { describe, expect, it } from 'vitest';

import { countHealthDays, latestHealthDay, listHealthDays, removeHealthSource, upsertHealthDays } from '@/db/repositories/health';
import { generateSampleRecovery } from '@/integrations/sample';
import { createTestDb } from './helpers';

describe('health storage', () => {
  it('stores one row per day and source, updating in place', async () => {
    const { db } = await createTestDb();
    upsertHealthDays(db, 'manual', [{ date: '2026-10-21', hrvMs: 60, rhrBpm: 50, sleepHours: 7.5, sleepScore: null, vendorReadiness: null }]);
    upsertHealthDays(db, 'manual', [{ date: '2026-10-21', hrvMs: 64, rhrBpm: 50, sleepHours: 7.5, sleepScore: null, vendorReadiness: null }]);
    expect(countHealthDays(db, 'manual')).toBe(1);
    expect(latestHealthDay(db, '2026-10-23')).toMatchObject({ date: '2026-10-21', hrvMs: 64, source: 'manual' });
  });

  it('prefers a real source over sample data on the same day, and sample data can be removed', async () => {
    const { db } = await createTestDb();
    upsertHealthDays(db, 'sample', generateSampleRecovery('2026-10-22', 10));
    upsertHealthDays(db, 'manual', [{ date: '2026-10-21', hrvMs: 70, rhrBpm: 49, sleepHours: 8, sleepScore: null, vendorReadiness: null }]);
    const days = listHealthDays(db, '2026-10-13', '2026-10-22');
    expect(days).toHaveLength(10);
    expect(days.find((d) => d.date === '2026-10-21')).toMatchObject({ source: 'manual', hrvMs: 70 });
    expect(days.filter((d) => d.source === 'sample')).toHaveLength(9);
    removeHealthSource(db, 'sample');
    expect(listHealthDays(db, '2026-10-13', '2026-10-22')).toHaveLength(1);
  });
});

describe('sample recovery data', () => {
  it('is deterministic, plausible, and ends with a tired stretch', () => {
    const a = generateSampleRecovery('2026-10-22', 60);
    expect(a).toEqual(generateSampleRecovery('2026-10-22', 60));
    expect(a).toHaveLength(60);
    expect(a[59].date).toBe('2026-10-22');
    for (const d of a) {
      expect(d.hrvMs!).toBeGreaterThanOrEqual(20);
      expect(d.rhrBpm!).toBeGreaterThanOrEqual(40);
      expect(d.sleepHours!).toBeGreaterThanOrEqual(4.5);
    }
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(a.slice(-3).map((d) => d.hrvMs!))).toBeLessThan(avg(a.slice(0, 50).map((d) => d.hrvMs!)));
  });
});
