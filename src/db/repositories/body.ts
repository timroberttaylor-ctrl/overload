import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm';

import { uuid } from '@/core/ids';

import { bodyweights, nutritionTargets, type HealthSource } from '../schema';
import type { DB } from '../types';

export type Bodyweight = typeof bodyweights.$inferSelect;
export type NutritionTarget = typeof nutritionTargets.$inferSelect;

/**
 * Body weight is the single source of truth for "how much do I weigh".
 * One entry per date; logging the same date again replaces it.
 */
export function logBodyweight(db: DB, date: string, kg: number, source: HealthSource = 'manual'): Bodyweight {
  if (!(kg > 20 && kg < 400)) throw new Error('Body weight looks wrong');
  db.insert(bodyweights)
    .values({ id: date, date, kg, source })
    .onConflictDoUpdate({ target: bodyweights.id, set: { kg, source, deletedAt: null, updatedAt: Date.now() } })
    .run();
  return db.select().from(bodyweights).where(eq(bodyweights.id, date)).get()!;
}

export function latestBodyweight(db: DB, onOrBefore?: string): Bodyweight | undefined {
  const conds = [isNull(bodyweights.deletedAt)];
  if (onOrBefore) conds.push(lte(bodyweights.date, onOrBefore));
  return db.select().from(bodyweights).where(and(...conds)).orderBy(desc(bodyweights.date)).get();
}

export function listBodyweights(db: DB, from?: string, to?: string): Bodyweight[] {
  const conds = [isNull(bodyweights.deletedAt)];
  if (from) conds.push(gte(bodyweights.date, from));
  if (to) conds.push(lte(bodyweights.date, to));
  return db.select().from(bodyweights).where(and(...conds)).orderBy(asc(bodyweights.date)).all();
}

// ---------------------------------------------------------------------------
// Nutrition targets: simple, transparent rules of thumb based on body weight.
// Not shown in v1 (no profile for accurate targets); kept so the table, backups and restore stay compatible.
// ---------------------------------------------------------------------------

export type Goal = NutritionTarget['goal'];
export type Activity = NutritionTarget['activity'];

/** Approximate maintenance calories per kg of body weight by weekly activity level. */
const KCAL_PER_KG: Record<Activity, number> = { sedentary: 26, light: 29, moderate: 32, high: 35, very_high: 38 };
const GOAL_FACTOR: Record<Goal, number> = { cut: 0.85, maintain: 1, gain: 1.08 };
const PROTEIN_G_PER_KG: Record<Goal, number> = { cut: 2.2, maintain: 1.8, gain: 2.0 };
const FAT_G_PER_KG = 0.8;

export type MacroTargets = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export function calcNutritionTargets(kg: number, goal: Goal, activity: Activity): MacroTargets {
  const kcal = Math.round((kg * KCAL_PER_KG[activity] * GOAL_FACTOR[goal]) / 10) * 10;
  const proteinG = Math.round(kg * PROTEIN_G_PER_KG[goal]);
  const fatG = Math.round(kg * FAT_G_PER_KG);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG };
}

/** Recalculate from the latest logged body weight and save as the current target. */
export function setNutritionTarget(db: DB, effectiveFrom: string, goal: Goal, activity: Activity): NutritionTarget {
  const bw = latestBodyweight(db, effectiveFrom);
  if (!bw) throw new Error('Log a body weight first');
  const t = calcNutritionTargets(bw.kg, goal, activity);
  const id = uuid();
  db.insert(nutritionTargets).values({ id, effectiveFrom, goal, activity, basedOnKg: bw.kg, ...t }).run();
  return db.select().from(nutritionTargets).where(eq(nutritionTargets.id, id)).get()!;
}

export function currentNutritionTarget(db: DB, date: string): NutritionTarget | undefined {
  return db
    .select()
    .from(nutritionTargets)
    .where(and(isNull(nutritionTargets.deletedAt), lte(nutritionTargets.effectiveFrom, date)))
    .orderBy(desc(nutritionTargets.effectiveFrom), desc(nutritionTargets.createdAt))
    .get();
}
