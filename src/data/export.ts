import { asc, eq, getTableColumns, sql } from 'drizzle-orm';

import { exercises, sessions, setLogs, DATA_TABLES, type DataTableName } from '@/db/schema';
import type { DB } from '@/db/types';

import { MAX_BACKUP_BYTES, validateBackupTables } from './validate';

export const BACKUP_FORMAT = 'overload-backup';
export const BACKUP_VERSION = 1;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<DataTableName, Record<string, unknown>[]>;
};

const TABLE_NAMES = Object.keys(DATA_TABLES) as DataTableName[];

/** Every row of every data table (including soft-deleted rows) as a JSON-serialisable object. */
export function buildBackup(db: DB, now = new Date()): Backup {
  const tables = {} as Backup['tables'];
  for (const name of TABLE_NAMES) {
    tables[name] = db.select().from(DATA_TABLES[name]).all() as Record<string, unknown>[];
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), tables };
}

export function backupToJson(b: Backup): string {
  return JSON.stringify(b, null, 2);
}

/**
 * Parse and fully validate an untrusted backup file. Nothing is written here;
 * a backup that passes can be handed to restoreBackup.
 */
export function parseBackup(json: string): Backup {
  if (typeof json !== 'string' || json.length > MAX_BACKUP_BYTES) throw new Error('This backup is too large to restore');
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('That file is not an Overload backup');
  const b = data as Partial<Backup>;
  if (b.format !== BACKUP_FORMAT || typeof b.version !== 'number' || !Number.isInteger(b.version) || b.version < 1) throw new Error('That file is not an Overload backup');
  if (b.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app');
  if (typeof b.exportedAt !== 'string' || Number.isNaN(Date.parse(b.exportedAt))) throw new Error('That file is not an Overload backup');
  if (typeof b.tables !== 'object' || b.tables === null || Array.isArray(b.tables)) throw new Error('That file is not an Overload backup');
  validateBackupTables(b.tables as Record<string, unknown>);
  return { format: BACKUP_FORMAT, version: b.version, exportedAt: b.exportedAt, tables: b.tables as Backup['tables'] };
}

/**
 * Replace everything in the database with the backup's contents, atomically.
 * If anything fails, the transaction rolls back and the current data is kept.
 */
export function restoreBackup(db: DB, backup: Backup): { rows: number } {
  // Defence in depth: never write rows that have not passed validation.
  validateBackupTables(backup.tables as Record<string, unknown>);
  let rows = 0;
  db.transaction((tx) => {
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    for (const name of [...TABLE_NAMES].reverse()) tx.delete(DATA_TABLES[name]).run();
    for (const name of TABLE_NAMES) {
      const table = DATA_TABLES[name];
      const cols = Object.keys(getTableColumns(table));
      for (const row of backup.tables[name]) {
        const clean: Record<string, unknown> = {};
        for (const c of cols) if (c in row) clean[c] = row[c];
        tx.insert(table).values(clean as never).run();
        rows++;
      }
    }
  });
  return { rows };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
  // Spreadsheet formula injection: text such as =HYPERLINK(...) in a note would be
  // run as a formula by Excel / Sheets when the export is opened. Prefix text that
  // starts with a formula trigger so it is shown as text. Real numbers (including
  // negatives) are left alone.
  if (typeof v === 'string' && /^[=+\-@\t\r|]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** One CSV per table (snake_case headers as in the database), plus a flattened workout log. */
export function buildCsvFiles(db: DB): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of TABLE_NAMES) {
    const table = DATA_TABLES[name];
    const columns = Object.entries(getTableColumns(table));
    const rows = db.select().from(table).all() as Record<string, unknown>[];
    files[`${name}.csv`] = toCsv(
      columns.map(([, c]) => c.name),
      rows.map((r) => columns.map(([key]) => r[key])),
    );
  }

  const log = db
    .select({
      date: sessions.date,
      session: sessions.name,
      status: sessions.status,
      exercise: exercises.name,
      setIndex: setLogs.setIndex,
      setType: setLogs.setType,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      rpe: setLogs.rpe,
      completed: setLogs.completed,
      note: setLogs.note,
      sessionNote: sessions.notes,
    })
    .from(setLogs)
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .orderBy(asc(sessions.date), asc(sessions.startedAt), asc(setLogs.exerciseOrder), asc(setLogs.setIndex))
    .all();
  files['workout_log.csv'] = toCsv(
    ['date', 'session', 'status', 'exercise', 'set', 'set_type', 'weight_kg', 'reps', 'rpe', 'completed', 'set_note', 'session_note'],
    log.map((r) => [r.date, r.session, r.status, r.exercise, r.setIndex + 1, r.setType, r.weightKg, r.reps, r.rpe, r.completed, r.note, r.sessionNote]),
  );
  return files;
}
