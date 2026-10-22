import { runMigrations } from './migrate';
import { seedDatabase } from './seed/seed';
import type { DB } from './types';

/** Migrate and seed. Safe to call on every launch. */
export async function initDatabase(db: DB): Promise<void> {
  await runMigrations(db);
  seedDatabase(db);
}
