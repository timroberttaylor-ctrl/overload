import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { exercises, phases, programExercises, programTemplates, templateDays } from '../schema';
import type { DB } from '../types';

export type ProgramTemplate = typeof programTemplates.$inferSelect;
export type Phase = typeof phases.$inferSelect;
export type TemplateDay = typeof templateDays.$inferSelect;
export type ProgramExercise = typeof programExercises.$inferSelect;
export type ExerciseRow = typeof exercises.$inferSelect;

export type SlotWithExercise = { slot: ProgramExercise; exercise: ExerciseRow };
export type DayDetail = { day: TemplateDay; slots: SlotWithExercise[] };
export type TemplateDetail = { template: ProgramTemplate; phases: Phase[]; days: DayDetail[] };

export function listTemplates(db: DB): ProgramTemplate[] {
  return db.select().from(programTemplates).where(isNull(programTemplates.deletedAt)).orderBy(asc(programTemplates.name)).all();
}

export function getTemplateDetail(db: DB, templateId: string): TemplateDetail | undefined {
  const template = db.select().from(programTemplates).where(eq(programTemplates.id, templateId)).get();
  if (!template) return undefined;
  const ph = db.select().from(phases).where(and(eq(phases.templateId, templateId), isNull(phases.deletedAt))).orderBy(asc(phases.weekFrom)).all();
  const days = db
    .select()
    .from(templateDays)
    .where(and(eq(templateDays.templateId, templateId), isNull(templateDays.deletedAt)))
    .orderBy(asc(templateDays.dayIndex))
    .all();
  const dayIds = days.map((d) => d.id);
  const rows = dayIds.length
    ? db
        .select({ slot: programExercises, exercise: exercises })
        .from(programExercises)
        .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
        .where(and(inArray(programExercises.templateDayId, dayIds), isNull(programExercises.deletedAt)))
        .orderBy(asc(programExercises.position))
        .all()
    : [];
  return {
    template,
    phases: ph,
    days: days.map((day) => ({ day, slots: rows.filter((r) => r.slot.templateDayId === day.id) })),
  };
}

/** Phase covering a 1-based program week (falls back to a neutral accumulation phase). */
export function phaseForWeek(ph: Phase[], week: number): Pick<Phase, 'kind' | 'volumeMult' | 'rpeTarget'> {
  return ph.find((p) => week >= p.weekFrom && week <= p.weekTo) ?? { kind: 'accumulation', volumeMult: 1, rpeTarget: null };
}

/** Working sets after applying a phase volume multiplier (never below 1). */
export function setsForPhase(sets: number, volumeMult: number): number {
  return Math.max(1, Math.round(sets * volumeMult));
}
