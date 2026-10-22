import { and, asc, eq, isNull, like, or } from 'drizzle-orm';

import { uuid } from '@/core/ids';
import { isSafeWebUrl } from '@/core/safe-url';

import { exercises, MOVEMENT_PATTERNS, type MovementPattern } from '../schema';
import type { DB } from '../types';

export type Exercise = typeof exercises.$inferSelect;

export type ExerciseFilter = { search?: string; muscle?: string; equipment?: string; customOnly?: boolean };

export function listExercises(db: DB, f: ExerciseFilter = {}): Exercise[] {
  const conds = [isNull(exercises.deletedAt)];
  if (f.search?.trim()) {
    const q = `%${f.search.trim()}%`;
    conds.push(or(like(exercises.name, q), like(exercises.primaryMuscle, q))!);
  }
  if (f.muscle) conds.push(or(eq(exercises.primaryMuscle, f.muscle), like(exercises.secondaryMuscles, `%"${f.muscle}"%`))!);
  if (f.equipment) conds.push(eq(exercises.equipment, f.equipment));
  if (f.customOnly) conds.push(eq(exercises.isCustom, true));
  return db.select().from(exercises).where(and(...conds)).orderBy(asc(exercises.name)).all();
}

export function getExercise(db: DB, id: string): Exercise | undefined {
  return db.select().from(exercises).where(eq(exercises.id, id)).get();
}

export function listMuscles(db: DB): string[] {
  const rows = db.selectDistinct({ m: exercises.primaryMuscle }).from(exercises).where(isNull(exercises.deletedAt)).orderBy(asc(exercises.primaryMuscle)).all();
  return rows.map((r) => r.m);
}

export function listEquipment(db: DB): string[] {
  const rows = db.selectDistinct({ e: exercises.equipment }).from(exercises).where(isNull(exercises.deletedAt)).orderBy(asc(exercises.equipment)).all();
  return rows.map((r) => r.e);
}

export type NewCustomExercise = {
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string[];
  equipment: string;
  pattern: MovementPattern;
  isCompound?: boolean;
  defaultIncrementKg?: number;
  cues?: string;
};

function validateCustom(x: NewCustomExercise) {
  const name = x.name.trim();
  if (!name) throw new Error('Give the exercise a name');
  if (name.length > 60) throw new Error('Keep the name under 60 characters');
  if (!x.primaryMuscle.trim()) throw new Error('Pick the main muscle');
  if (!x.equipment.trim()) throw new Error('Pick the equipment');
  if (!MOVEMENT_PATTERNS.includes(x.pattern)) throw new Error('Pick a movement type');
  if (x.defaultIncrementKg != null && (!(x.defaultIncrementKg >= 0) || x.defaultIncrementKg > 20)) throw new Error('Load step must be between 0 and 20 kg');
  return {
    name,
    primaryMuscle: x.primaryMuscle.trim(),
    secondaryMuscles: JSON.stringify((x.secondaryMuscles ?? []).filter((m) => m && m !== x.primaryMuscle)),
    equipment: x.equipment.trim(),
    pattern: x.pattern,
    isCompound: x.isCompound ?? false,
    defaultIncrementKg: x.defaultIncrementKg ?? 2.5,
    cues: (x.cues ?? '').trim(),
  };
}

export function createCustomExercise(db: DB, x: NewCustomExercise): Exercise {
  const row = { id: `custom_${uuid()}`, ...validateCustom(x), isCustom: true };
  db.insert(exercises).values(row).run();
  return getExercise(db, row.id)!;
}

/** Edit one of your own exercises. Built-in exercises can't be changed. */
export function updateCustomExercise(db: DB, id: string, x: NewCustomExercise): Exercise {
  const ex = getExercise(db, id);
  if (!ex || ex.deletedAt) throw new Error('Exercise not found');
  if (!ex.isCustom) throw new Error("Built-in exercises can't be edited");
  db.update(exercises).set({ ...validateCustom(x), updatedAt: Date.now() }).where(eq(exercises.id, id)).run();
  return getExercise(db, id)!;
}

/** Remove one of your own exercises from the library. Logged history is kept. */
export function deleteCustomExercise(db: DB, id: string): void {
  const ex = getExercise(db, id);
  if (!ex?.isCustom) throw new Error('Only your own exercises can be deleted');
  const t = Date.now();
  db.update(exercises).set({ deletedAt: t, updatedAt: t }).where(eq(exercises.id, id)).run();
}

/** Suggest replacements: same primary muscle first, then same movement pattern. */
export function suggestAlternatives(db: DB, exerciseId: string, limit = 8): Exercise[] {
  const ex = getExercise(db, exerciseId);
  if (!ex) return [];
  const same = db
    .select()
    .from(exercises)
    .where(and(isNull(exercises.deletedAt), or(eq(exercises.primaryMuscle, ex.primaryMuscle), eq(exercises.pattern, ex.pattern))))
    .all()
    .filter((e) => e.id !== ex.id);
  same.sort((a, b) => {
    const score = (e: Exercise) => (e.primaryMuscle === ex.primaryMuscle ? 2 : 0) + (e.pattern === ex.pattern ? 1 : 0);
    return score(b) - score(a) || a.name.localeCompare(b.name);
  });
  return same.slice(0, limit);
}

/** Attach (or clear with null) your own demo video link for an exercise. */
export function setExerciseMediaUrl(db: DB, id: string, url: string | null): void {
  const clean = url?.trim() || null;
  if (clean && !isSafeWebUrl(clean)) throw new Error('Enter a full web link starting with https://');
  db.update(exercises).set({ mediaUrl: clean, updatedAt: Date.now() }).where(eq(exercises.id, id)).run();
}
