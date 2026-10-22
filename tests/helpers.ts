import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { runMigrations } from '@/db/migrate';
import * as schema from '@/db/schema';
import { seedDatabase } from '@/db/seed/seed';
import type { DB } from '@/db/types';

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<{ db: DB; raw: Database.Database }> {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw, { schema }) as unknown as DB;
  await runMigrations(db);
  if (opts.seed !== false) seedDatabase(db);
  return { db, raw };
}
