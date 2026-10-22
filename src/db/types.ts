import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * Database handle used by every repository. Both the app driver (expo-sqlite)
 * and the test driver (better-sqlite3) are synchronous SQLite drivers, so the
 * same repository code runs unchanged in the app and in Node tests.
 */
export type DB = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
