import { migrationBundle } from './migrations/bundle';
import type { DB } from './types';

type MigrationMeta = { sql: string[]; bps: boolean; folderMillis: number; hash: string };

/** Applies pending migrations. Works with any synchronous Drizzle SQLite driver. */
export async function runMigrations(db: DB): Promise<void> {
  const metas: MigrationMeta[] = migrationBundle.journal.entries.map((entry) => {
    const key = `m${String(entry.idx).padStart(4, '0')}` as keyof typeof migrationBundle.migrations;
    const sql = migrationBundle.migrations[key];
    if (!sql) throw new Error(`Missing migration: ${entry.tag}`);
    return { sql: sql.split('--> statement-breakpoint'), bps: entry.breakpoints, folderMillis: entry.when, hash: '' };
  });
  // Same call drizzle's own expo-sqlite migrator makes.
  const internal = db as unknown as { dialect: { migrate: (m: MigrationMeta[], s: unknown) => unknown }; session: unknown };
  await internal.dialect.migrate(metas, internal.session);
}
