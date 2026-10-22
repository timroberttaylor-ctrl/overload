/**
 * Strict validation of backup files before they are restored.
 *
 * A backup is an untrusted file: it can come from email, chat or a download and
 * may have been edited or crafted. Restoring writes straight into the database
 * and bypasses every repository-level check, so everything the rest of the app
 * assumes about stored data is re-checked here:
 *
 * - column types, NOT NULL constraints and string lengths
 * - enum-like columns hold one of the known values
 * - JSON-in-text columns parse and have the right shape (a bad value here would
 *   crash screens on every launch, leaving the user unable to reach Restore)
 * - links are plain web links (they are later handed to the OS to open)
 * - settings rows are limited to keys the app itself writes
 * - overall size limits, so a huge file cannot exhaust memory or storage
 */
import { getTableColumns } from 'drizzle-orm';

import { isSafeWebUrl } from '@/core/safe-url';
import { readScheme } from '@/core/scheme';
import {
  DATA_TABLES,
  HEALTH_SOURCES,
  MOVEMENT_PATTERNS,
  PHASE_KINDS,
  PROGRESSION_METHODS,
  PROGRESSION_RULES,
  SESSION_STATUSES,
  SET_TYPES,
  type DataTableName,
} from '@/db/schema';

/** Largest backup file we will read, in bytes. Years of daily logging is a few MB. */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
/** Upper bound on rows across all tables. */
export const MAX_BACKUP_ROWS = 500_000;
/** Upper bound on any single text value (notes, cues, JSON blobs). */
export const MAX_TEXT_LENGTH = 20_000;
/** Upper bound on ids. */
export const MAX_ID_LENGTH = 200;

type Check = (v: unknown) => boolean;

const oneOf =
  (values: readonly string[]): Check =>
  (v) =>
    typeof v === 'string' && values.includes(v);

function parseJson(v: unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof v !== 'string') return { ok: false };
  try {
    return { ok: true, value: JSON.parse(v) };
  } catch {
    return { ok: false };
  }
}

const jsonStringArray: Check = (v) => {
  const p = parseJson(v);
  return p.ok && Array.isArray(p.value) && p.value.every((x) => typeof x === 'string');
};
const jsonArray: Check = (v) => {
  const p = parseJson(v);
  return p.ok && Array.isArray(p.value);
};
const jsonIntArray: Check = (v) => {
  const p = parseJson(v);
  return p.ok && Array.isArray(p.value) && p.value.every((x) => Number.isInteger(x));
};
const jsonObject: Check = (v) => {
  const p = parseJson(v);
  return p.ok && typeof p.value === 'object' && p.value !== null && !Array.isArray(p.value);
};
const anyJson: Check = (v) => parseJson(v).ok;
const isoDate: Check = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Extra per-column rules, keyed by table then by the column's JS property name.
 * Rules are only applied to non-null values; NOT NULL is checked separately.
 */
const COLUMN_RULES: Partial<Record<DataTableName, Record<string, Check>>> = {
  exercises: { pattern: oneOf(MOVEMENT_PATTERNS), secondaryMuscles: jsonStringArray, mediaUrl: isSafeWebUrl },
  program_templates: { method: oneOf(PROGRESSION_METHODS), level: oneOf(['beginner', 'intermediate', 'advanced']) },
  phases: { kind: oneOf(PHASE_KINDS) },
  program_exercises: { rule: oneOf(PROGRESSION_RULES), repScheme: (v) => typeof v === 'string' && readScheme(v) != null },
  enrolments: { status: oneOf(['active', 'completed', 'abandoned']), dayOrder: jsonIntArray, startedOn: isoDate },
  enrolment_swaps: { scope: oneOf(['program', 'session']) },
  sessions: { status: oneOf(SESSION_STATUSES), adjustments: jsonObject, date: isoDate },
  set_logs: { setType: oneOf(SET_TYPES) },
  health_daily: { source: oneOf(HEALTH_SOURCES), date: isoDate },
  readiness_daily: { band: oneOf(['green', 'amber', 'red', 'unknown']), reasons: jsonArray, date: isoDate },
  checkins: { weekStart: isoDate },
  week_plans: { reasons: jsonArray, details: jsonObject, weekStart: isoDate },
  bodyweights: { source: oneOf(HEALTH_SOURCES), date: isoDate },
  nutrition_targets: {
    goal: oneOf(['cut', 'maintain', 'gain']),
    activity: oneOf(['sedentary', 'light', 'moderate', 'high', 'very_high']),
    effectiveFrom: isoDate,
  },
  settings: { value: anyJson },
};

/** Settings keys the app writes itself (see repositories/settings, health kv, seed). */
const SETTINGS_ID = /^(?:[A-Za-z][A-Za-z0-9_]{0,63}|kv:[A-Za-z0-9_.:-]{1,128})$/;

function checkType(columnType: string, v: unknown): boolean {
  switch (columnType) {
    case 'SQLiteText':
      return typeof v === 'string' && v.length <= MAX_TEXT_LENGTH;
    case 'SQLiteInteger':
      return typeof v === 'number' && Number.isSafeInteger(v);
    case 'SQLiteReal':
      return typeof v === 'number' && Number.isFinite(v);
    case 'SQLiteBoolean':
      return typeof v === 'boolean';
    default:
      return false; // unknown column kind: refuse rather than guess
  }
}

function fail(table: string, index: number, msg: string): never {
  throw new Error(`Backup is damaged or not from OVRLD (${table} row ${index + 1}: ${msg})`);
}

/**
 * Throws a user-readable error if any row in the backup is not something this
 * app could have written itself. Returns nothing on success.
 */
export function validateBackupTables(tables: Record<string, unknown>): void {
  let total = 0;
  for (const name of Object.keys(DATA_TABLES) as DataTableName[]) {
    const rows = tables[name];
    if (!Array.isArray(rows)) throw new Error(`Backup is missing table "${name}"`);
    total += rows.length;
    if (total > MAX_BACKUP_ROWS) throw new Error('This backup is too large to restore');

    const columns = Object.entries(getTableColumns(DATA_TABLES[name]));
    const known = new Set(columns.map(([key]) => key));
    const rules = COLUMN_RULES[name] ?? {};
    const seenIds = new Set<unknown>();

    rows.forEach((row: unknown, i) => {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) fail(name, i, 'not an object');
      const r = row as Record<string, unknown>;
      for (const key of Object.keys(r)) if (!known.has(key)) fail(name, i, `unexpected field "${key}"`);

      for (const [key, col] of columns) {
        const v = r[key];
        if (v === null || v === undefined) {
          // Missing values are fine only where the database would fill in a default.
          if (col.notNull && !(v === undefined && col.hasDefault)) fail(name, i, `"${key}" is required`);
          continue;
        }
        if (!checkType(col.columnType, v)) fail(name, i, `"${key}" has the wrong type`);
        const rule = rules[key];
        if (rule && !rule(v)) fail(name, i, `"${key}" has an invalid value`);
      }

      const id = r.id ?? r.seq;
      if (name !== 'settings' && typeof id === 'string' && (id.length === 0 || id.length > MAX_ID_LENGTH)) fail(name, i, 'invalid id');
      if (name === 'settings' && !(typeof r.id === 'string' && SETTINGS_ID.test(r.id))) fail(name, i, 'unknown setting');
      if (seenIds.has(id)) fail(name, i, 'duplicate id');
      seenIds.add(id);
    });
  }
}
