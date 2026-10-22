import { eq, sql } from 'drizzle-orm';

import { exercises, phases, programExercises, programTemplates, settings, templateDays } from '../schema';
import type { DB } from '../types';
import { SEED_EXERCISES } from './exercises';
import { SEED_PROGRAMS } from './programs';
import { defaultTempo } from './tempo-defaults';
import { normaliseTempo } from '@/core/tempo';

/** Bump when seed content changes; seeding re-runs (as upserts) when this differs. */
export const SEED_VERSION = 5; // 2: tempo · 3: six more programs, phase rep ranges · 4: OVRLD · 5: per-set rep schemes in OVRLD

export const dayId = (templateId: string, dayIndex: number) => `${templateId}:d${dayIndex}`;
export const slotId = (templateId: string, dayIndex: number, position: number) => `${templateId}:d${dayIndex}:${position}`;
export const phaseId = (templateId: string, i: number) => `${templateId}:p${i}`;

/**
 * Inserts or refreshes the built-in exercise library and program templates.
 * Idempotent: rows use stable ids and are upserted. User-created rows
 * (is_custom = 1) are never touched.
 */
export function seedDatabase(db: DB, opts: { force?: boolean } = {}): { seeded: boolean } {
  const current = db.select().from(settings).where(eq(settings.id, 'seed_version')).get();
  let currentVersion: unknown;
  try {
    currentVersion = current ? JSON.parse(current.value) : undefined;
  } catch {
    currentVersion = undefined; // unreadable marker: just re-seed (idempotent)
  }
  if (!opts.force && currentVersion === SEED_VERSION) return { seeded: false };

  db.transaction((tx) => {
    for (const x of SEED_EXERCISES) {
      const row = {
        id: x.id,
        name: x.name,
        primaryMuscle: x.primary,
        secondaryMuscles: JSON.stringify(x.secondary),
        equipment: x.equipment,
        pattern: x.pattern,
        isCompound: x.compound,
        defaultIncrementKg: x.incrementKg,
        cues: x.cues,
        isCustom: false,
      };
      const { id: _id, ...rest } = row;
      tx.insert(exercises).values(row).onConflictDoUpdate({ target: exercises.id, set: rest }).run();
    }

    for (const p of SEED_PROGRAMS) {
      const tpl = {
        id: p.id,
        name: p.name,
        method: p.method,
        level: p.level,
        weeks: p.weeks,
        daysPerWeek: p.days.filter((d) => !d.rest).length,
        cycleLength: p.days.length,
        minutes: p.minutes,
        summary: p.summary,
        rationale: p.rationale,
        isCustom: false,
      };
      const { id: _tid, ...tplRest } = tpl;
      tx.insert(programTemplates).values(tpl).onConflictDoUpdate({ target: programTemplates.id, set: tplRest }).run();

      p.phases.forEach((ph, i) => {
        const row = {
          id: phaseId(p.id, i),
          templateId: p.id,
          weekFrom: ph.weekFrom,
          weekTo: ph.weekTo,
          kind: ph.kind,
          volumeMult: ph.volumeMult,
          rpeTarget: ph.rpeTarget ?? null,
          repMult: ph.repMult ?? null,
        };
        const { id: _pid, ...rest } = row;
        tx.insert(phases).values(row).onConflictDoUpdate({ target: phases.id, set: rest }).run();
      });

      p.days.forEach((d, dayIndex) => {
        const dayRow = {
          id: dayId(p.id, dayIndex),
          templateId: p.id,
          dayIndex,
          name: d.name,
          isRest: !!d.rest,
          focus: d.focus,
        };
        const { id: _did, ...dayRest } = dayRow;
        tx.insert(templateDays).values(dayRow).onConflictDoUpdate({ target: templateDays.id, set: dayRest }).run();

        d.slots.forEach((sl, position) => {
          const ex = SEED_EXERCISES.find((x) => x.id === sl.exerciseId)!;
          const row = {
            id: slotId(p.id, dayIndex, position),
            templateDayId: dayRow.id,
            exerciseId: sl.exerciseId,
            series: sl.series,
            position,
            warmupSets: sl.warmup ?? 0,
            sets: sl.sets,
            repMin: sl.repMin,
            repMax: sl.repMax,
            targetRpe: sl.rpe ?? null,
            tempo: normaliseTempo(sl.tempo) ?? defaultTempo(ex, sl),
            restS: sl.restS ?? 120,
            rule: sl.rule,
            incrementKg: sl.incrementKg ?? null,
            repScheme: sl.scheme ? JSON.stringify(sl.scheme) : null,
          };
          const { id: _sid, ...rest } = row;
          tx.insert(programExercises).values(row).onConflictDoUpdate({ target: programExercises.id, set: rest }).run();
        });
      });
    }

    tx.insert(settings)
      .values({ id: 'seed_version', value: JSON.stringify(SEED_VERSION) })
      .onConflictDoUpdate({ target: settings.id, set: { value: JSON.stringify(SEED_VERSION), updatedAt: sql`(cast(unixepoch('subsec') * 1000 as integer))` } })
      .run();
  });

  return { seeded: true };
}
