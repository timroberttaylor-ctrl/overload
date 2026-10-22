import { isNull } from 'drizzle-orm';

import { enrolments, sessions } from '../schema';
import type { DB } from '../types';
import { getSettings, updateSettings } from './settings';

/** Show first-run setup only to a brand-new user: not finished or skipped before, and no programs or workouts yet. */
export function needsOnboarding(db: DB): boolean {
  if (getSettings(db).onboarded) return false;
  const anyProgram = db.select({ id: enrolments.id }).from(enrolments).where(isNull(enrolments.deletedAt)).get();
  const anyWorkout = db.select({ id: sessions.id }).from(sessions).where(isNull(sessions.deletedAt)).get();
  return !anyProgram && !anyWorkout;
}

export function finishOnboarding(db: DB): void {
  updateSettings(db, { onboarded: true });
}
