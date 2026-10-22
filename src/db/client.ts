import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';
import type { DB } from './types';

const DB_NAME = 'overload.db';

let instance: DB | null = null;

/** The app's single database connection (expo-sqlite). */
export function getDb(): DB {
  if (!instance) {
    const sqlite = openDatabaseSync(DB_NAME, { enableChangeListener: true });
    sqlite.execSync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    instance = drizzle(sqlite, { schema }) as unknown as DB;
  }
  return instance;
}
