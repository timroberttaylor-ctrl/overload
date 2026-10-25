/** Reads the training log for Level Up mode. Nothing is written: the profile is always derived. */
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';

import { isoDate } from '@/core/dates';
import { buildLevelProfile, type LevelProfile, type LevelSession, type SessionXp } from '@/core/leveling';

import { exercises, sessions, setLogs } from '../schema';
import type { DB } from '../types';

export function levelSessions(db: DB): LevelSession[] {
  const rows = db
    .select()
    .from(sessions)
    .where(and(inArray(sessions.status, ['completed', 'partial']), isNull(sessions.deletedAt)))
    .all();
  if (!rows.length) return [];
  const logs = db
    .select({ sessionId: setLogs.sessionId, exerciseId: setLogs.exerciseId, weightKg: setLogs.weightKg, reps: setLogs.reps, rpe: setLogs.rpe, isCompound: exercises.isCompound })
    .from(setLogs)
    .innerJoin(exercises, eq(setLogs.exerciseId, exercises.id))
    .innerJoin(sessions, eq(setLogs.sessionId, sessions.id))
    .where(and(eq(setLogs.completed, true), isNull(setLogs.deletedAt), ne(setLogs.setType, 'warmup'), inArray(sessions.status, ['completed', 'partial']), isNull(sessions.deletedAt)))
    .all();
  const bySession = new Map<string, LevelSession['sets']>();
  for (const l of logs) {
    if (l.reps == null) continue;
    const list = bySession.get(l.sessionId) ?? [];
    list.push({ exerciseId: l.exerciseId, weightKg: l.weightKg ?? 0, reps: l.reps, rpe: l.rpe, isCompound: l.isCompound });
    bySession.set(l.sessionId, list);
  }
  return rows.map((r) => ({ id: r.id, name: r.name, date: r.date, startedAt: r.startedAt, status: r.status as 'completed' | 'partial', sets: bySession.get(r.id) ?? [] }));
}

export function getLevelProfile(db: DB, today = isoDate()): LevelProfile {
  return buildLevelProfile(levelSessions(db), today);
}

/** XP earned by one finished workout, with any level, rank or title it unlocked. */
export function sessionXp(db: DB, sessionId: string): SessionXp | undefined {
  return getLevelProfile(db).log.find((l) => l.sessionId === sessionId);
}
