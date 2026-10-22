import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDb } from '@/db/client';
import type { DB } from '@/db/types';

function runQuery<T>(query: (db: DB) => T, _version: number): T {
  return query(getDb());
}

/**
 * Reads from the local database during render (queries are synchronous and fast).
 * Re-reads whenever the screen gains focus or `refresh()` is called after a write.
 */
export function useDbQuery<T>(query: (db: DB) => T): [T, () => void] {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useFocusEffect(refresh);
  return [runQuery(query, version), refresh];
}
