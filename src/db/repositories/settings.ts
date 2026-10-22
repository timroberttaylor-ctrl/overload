import { inArray } from 'drizzle-orm';

import type { WeightUnit } from '@/core/units';

import { settings } from '../schema';
import type { DB } from '../types';

export type AppSettings = {
  appearance: 'dark' | 'light' | 'system';
  units: WeightUnit;
  /** Smallest load jump you can make on a barbell (two smallest plates), kg */
  plateIncrementKg: number;
  autoAdvanceAfterLog: boolean;
  autoAdvanceAfterRest: boolean;
  restCountdownSound: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: 'dark',
  units: 'kg',
  plateIncrementKg: 2.5,
  autoAdvanceAfterLog: true,
  autoAdvanceAfterRest: true,
  restCountdownSound: true,
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];

/** Allowed values per setting. Anything else falls back to the default. */
const VALID: { [K in keyof AppSettings]: (v: unknown) => v is AppSettings[K] } = {
  appearance: (v): v is AppSettings['appearance'] => v === 'dark' || v === 'light' || v === 'system',
  units: (v): v is WeightUnit => v === 'kg' || v === 'lb',
  plateIncrementKg: (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 50,
  autoAdvanceAfterLog: (v): v is boolean => typeof v === 'boolean',
  autoAdvanceAfterRest: (v): v is boolean => typeof v === 'boolean',
  restCountdownSound: (v): v is boolean => typeof v === 'boolean',
};

/**
 * Settings are read on every launch, so a malformed stored value must never throw:
 * it would stop the app from opening at all. Bad values fall back to defaults.
 */
export function getSettings(db: DB): AppSettings {
  const rows = db.select().from(settings).where(inArray(settings.id, KEYS)).all();
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    const key = r.id as keyof AppSettings;
    let value: unknown;
    try {
      value = JSON.parse(r.value);
    } catch {
      continue;
    }
    if (VALID[key]?.(value)) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export function updateSettings(db: DB, patch: Partial<AppSettings>): AppSettings {
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (!KEYS.includes(key as keyof AppSettings) || value === undefined) continue;
      if (!VALID[key as keyof AppSettings](value)) throw new Error(`Invalid value for setting ${key}`);
      const json = JSON.stringify(value);
      tx.insert(settings).values({ id: key, value: json }).onConflictDoUpdate({ target: settings.id, set: { value: json, updatedAt: Date.now() } }).run();
    }
  });
  return getSettings(db);
}
