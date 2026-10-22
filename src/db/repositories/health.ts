import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';

import { healthDaily, settings, type HealthSource } from '../schema';
import type { DB } from '../types';

export type HealthRow = typeof healthDaily.$inferSelect;
export type HealthDay = Pick<HealthRow, 'date' | 'hrvMs' | 'rhrBpm' | 'sleepHours' | 'sleepScore' | 'vendorReadiness'> & { source: HealthSource };

/** When several sources report the same day, the first one in this list wins. */
export const SOURCE_PRIORITY: HealthSource[] = ['oura', 'healthconnect', 'healthkit', 'manual', 'sample'];

export type HealthInput = { date: string; hrvMs: number | null; rhrBpm: number | null; sleepHours: number | null; sleepScore: number | null; vendorReadiness: number | null };

/** Insert or update one row per (date, source). Returns how many rows were written. */
export function upsertHealthDays(db: DB, source: HealthSource, rows: HealthInput[]): number {
  if (!rows.length) return 0;
  const now = Date.now();
  db.transaction((tx) => {
    for (const r of rows) {
      const id = `${r.date}:${source}`;
      const values = { hrvMs: r.hrvMs, rhrBpm: r.rhrBpm, sleepHours: r.sleepHours, sleepScore: r.sleepScore, vendorReadiness: r.vendorReadiness };
      tx.insert(healthDaily)
        .values({ id, date: r.date, source, ...values })
        .onConflictDoUpdate({ target: healthDaily.id, set: { ...values, deletedAt: null, updatedAt: now } })
        .run();
    }
  });
  return rows.length;
}

/** One merged row per day in [from, to], picking the highest-priority source per day. */
export function listHealthDays(db: DB, from: string, to: string): HealthDay[] {
  const rows = db
    .select()
    .from(healthDaily)
    .where(and(gte(healthDaily.date, from), lte(healthDaily.date, to), isNull(healthDaily.deletedAt)))
    .orderBy(asc(healthDaily.date))
    .all();
  const byDate = new Map<string, HealthRow>();
  for (const r of rows) {
    const cur = byDate.get(r.date);
    if (!cur || SOURCE_PRIORITY.indexOf(r.source) < SOURCE_PRIORITY.indexOf(cur.source)) byDate.set(r.date, r);
  }
  return [...byDate.values()].map((r) => ({ date: r.date, source: r.source, hrvMs: r.hrvMs, rhrBpm: r.rhrBpm, sleepHours: r.sleepHours, sleepScore: r.sleepScore, vendorReadiness: r.vendorReadiness }));
}

export function latestHealthDay(db: DB, onOrBefore: string): HealthDay | undefined {
  const r = db.select().from(healthDaily).where(and(lte(healthDaily.date, onOrBefore), isNull(healthDaily.deletedAt))).orderBy(desc(healthDaily.date)).get();
  return r ? listHealthDays(db, r.date, r.date)[0] : undefined;
}

export function countHealthDays(db: DB, source: HealthSource): number {
  return db.select({ id: healthDaily.id }).from(healthDaily).where(and(eq(healthDaily.source, source), isNull(healthDaily.deletedAt))).all().length;
}

/** Soft-delete everything from one source (e.g. clearing sample data). */
export function removeHealthSource(db: DB, source: HealthSource): void {
  const t = Date.now();
  db.update(healthDaily).set({ deletedAt: t, updatedAt: t }).where(and(eq(healthDaily.source, source), isNull(healthDaily.deletedAt))).run();
}

// ---------------------------------------------------------------------------
// Small key-value store for integration bookkeeping (kept out of AppSettings)
// ---------------------------------------------------------------------------

const kvKey = (k: string) => `kv:${k}`;

export function getKv<T>(db: DB, key: string): T | undefined {
  const r = db.select().from(settings).where(eq(settings.id, kvKey(key))).get();
  if (!r) return undefined;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return undefined;
  }
}

export function setKv(db: DB, key: string, value: unknown): void {
  const json = JSON.stringify(value);
  db.insert(settings).values({ id: kvKey(key), value: json }).onConflictDoUpdate({ target: settings.id, set: { value: json, updatedAt: Date.now() } }).run();
}

export function deleteKv(db: DB, keys: string[]): void {
  if (keys.length) db.delete(settings).where(inArray(settings.id, keys.map(kvKey))).run();
}
