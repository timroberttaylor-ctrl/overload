/**
 * Program builder: create, copy, edit and delete your own programs.
 *
 * A program is edited as a whole "draft" (basics, days, exercises) and saved in
 * one transaction. Existing days and exercises keep their ids, so workout history
 * and progression for a slot carry on after edits. Removed rows are soft-deleted.
 * Built-in programs can't be edited; copy them instead.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';

import { uuid } from '@/core/ids';
import { formatScheme, parseScheme, readScheme, type RepScheme } from '@/core/scheme';
import { normaliseTempo } from '@/core/tempo';
import { GROUP_LABEL, groupOf, type MuscleGroup } from '@/core/volume';
import { defaultTempo } from '@/db/seed/tempo-defaults';

import { enrolments, exercises, phases, programExercises, programTemplates, PROGRESSION_RULES, templateDays, type PhaseKind, type ProgressionMethod, type ProgressionRuleKind } from '../schema';
import type { DB } from '../types';
import { getTemplateDetail } from './programs';

export type DraftSlot = {
  /** Existing program_exercises id; absent for new exercises */
  id?: string;
  exerciseId: string;
  /** Same letter as the exercise before it (alternate them as a superset) */
  supersetWithPrevious: boolean;
  sets: number;
  repMin: number;
  repMax: number;
  rule: ProgressionRuleKind;
  targetRpe: number | null;
  restS: number;
  warmupSets: number;
  tempo: string | null;
  incrementKg: number | null;
  /** Optional per-set reps, builder text: "12,10,8,8", "20,20,F", weeks separated by | */
  repScheme?: string | null;
};

export type DraftDay = { id?: string; name: string; isRest: boolean; slots: DraftSlot[] };

export type ProgramDraft = {
  name: string;
  summary: string;
  weeks: number;
  minutes: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  /** Make the last week a deload (half the sets, lighter loads, RPE 6) */
  deloadLastWeek: boolean;
  days: DraftDay[];
  /**
   * Phases carried over from the program being copied or edited. Kept on save only while they
   * still fit (same length, same deload choice); otherwise the simple build + deload is used.
   */
  phases?: DraftPhase[];
};

export type DraftPhase = { weekFrom: number; weekTo: number; kind: PhaseKind; volumeMult: number; rpeTarget: number | null; repMult: number | null };

/** True when phases cover weeks 1..weeks exactly once, in order, and agree with the deload switch. */
export function phasesFit(draft: Pick<ProgramDraft, 'weeks' | 'deloadLastWeek' | 'phases'>): boolean {
  const ph = draft.phases;
  if (!ph?.length) return false;
  let next = 1;
  for (const p of ph) {
    if (p.weekFrom !== next || p.weekTo < p.weekFrom) return false;
    next = p.weekTo + 1;
  }
  if (next !== draft.weeks + 1) return false;
  const last = ph[ph.length - 1];
  return (last.kind === 'deload' && last.weekFrom === draft.weeks) === draft.deloadLastWeek;
}

export const LIMITS = { name: 60, summary: 200, weeks: [1, 16], days: [1, 14], slots: 12, sets: [1, 10], reps: [1, 100], rest: [0, 600], warmups: [0, 4], minutes: [15, 180] } as const;

const inRange = (v: number, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && v >= lo && v <= hi;

export function emptyDraft(): ProgramDraft {
  return { name: '', summary: '', weeks: 8, minutes: 60, level: 'intermediate', deloadLastWeek: true, days: [{ name: 'Day 1', isRest: false, slots: [] }] };
}

/** Sensible starting prescription for a newly added exercise. */
export function defaultSlot(ex: { id: string; isCompound: boolean; pattern: string; primaryMuscle: string }): DraftSlot {
  const compound = ex.isCompound && ex.pattern !== 'isolation';
  const base: DraftSlot = compound
    ? { exerciseId: ex.id, supersetWithPrevious: false, sets: 3, repMin: 6, repMax: 10, rule: 'double', targetRpe: null, restS: 150, warmupSets: 1, tempo: null, incrementKg: null }
    : { exerciseId: ex.id, supersetWithPrevious: false, sets: 3, repMin: 10, repMax: 15, rule: 'double', targetRpe: null, restS: 90, warmupSets: 0, tempo: null, incrementKg: null };
  if (ex.pattern === 'carry') Object.assign(base, { rule: 'none', repMin: 30, repMax: 40, warmupSets: 0, restS: 90 });
  base.tempo = defaultTempo(
    { id: ex.id, primary: ex.primaryMuscle, pattern: ex.pattern as never, compound } as never,
    { exerciseId: ex.id, series: 'A', sets: base.sets, repMin: base.repMin, repMax: base.repMax, rule: base.rule } as never,
  );
  return base;
}

/** Throws a readable error for the first problem found. */
export function validateDraft(d: ProgramDraft): void {
  if (!d.name.trim()) throw new Error('Give the program a name');
  if (d.name.trim().length > LIMITS.name) throw new Error(`Keep the name under ${LIMITS.name} characters`);
  if (d.summary.length > LIMITS.summary) throw new Error(`Keep the summary under ${LIMITS.summary} characters`);
  if (!inRange(d.weeks, LIMITS.weeks)) throw new Error('A program runs 1–16 weeks');
  if (!inRange(d.minutes, LIMITS.minutes)) throw new Error('Session length must be 15–180 minutes');
  if (!inRange(d.days.length, LIMITS.days)) throw new Error('A cycle has 1–14 days');
  if (!d.days.some((x) => !x.isRest)) throw new Error('Add at least one training day');
  d.days.forEach((day, i) => {
    const label = day.name.trim() || `Day ${i + 1}`;
    if (!day.isRest && !day.slots.length) throw new Error(`${label} has no exercises. Add one or make it a rest day.`);
    if (day.slots.length > LIMITS.slots) throw new Error(`${label}: at most ${LIMITS.slots} exercises`);
    day.slots.forEach((s, j) => {
      const where = `${label}, exercise ${j + 1}`;
      if (!PROGRESSION_RULES.includes(s.rule)) throw new Error(`${where}: pick a progression rule`);
      if (!inRange(s.sets, LIMITS.sets)) throw new Error(`${where}: 1–10 sets`);
      if (!inRange(s.repMin, LIMITS.reps) || !inRange(s.repMax, LIMITS.reps) || s.repMax < s.repMin) throw new Error(`${where}: check the rep range`);
      if (s.targetRpe != null && (s.targetRpe < 5 || s.targetRpe > 10)) throw new Error(`${where}: RPE is 5–10`);
      if (!inRange(s.restS, LIMITS.rest)) throw new Error(`${where}: rest is 0–600 s`);
      if (!inRange(s.warmupSets, LIMITS.warmups)) throw new Error(`${where}: 0–4 warm-up sets`);
      if (s.tempo && !normaliseTempo(s.tempo)) throw new Error(`${where}: tempo looks like 3/1/X/1 (down / pause / up / pause)`);
      if (s.rule === 'rpe' && s.targetRpe == null) throw new Error(`${where}: RPE-based progression needs a target RPE`);
      if (s.repScheme?.trim()) {
        let scheme: RepScheme | null;
        try {
          scheme = parseScheme(s.repScheme);
        } catch (e) {
          throw new Error(`${where}: reps per set: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (scheme?.some((w) => w.length !== s.sets)) throw new Error(`${where}: reps per set needs ${s.sets} entr${s.sets === 1 ? 'y' : 'ies'} per week to match Sets`);
      }
    });
  });
}

/** Series letters: a new letter per exercise unless it's supersetted with the one before. */
export function seriesLetters(slots: Pick<DraftSlot, 'supersetWithPrevious'>[]): string[] {
  const out: string[] = [];
  let n = -1;
  slots.forEach((s, i) => {
    if (i === 0 || !s.supersetWithPrevious) n++;
    out.push(String.fromCharCode(65 + Math.min(n, 25)));
  });
  return out;
}

function focusFor(db: DB, slots: DraftSlot[]): string {
  const counts = new Map<MuscleGroup, number>();
  for (const s of slots) {
    const ex = db.select({ m: exercises.primaryMuscle }).from(exercises).where(eq(exercises.id, s.exerciseId)).get();
    const g = ex ? groupOf(ex.m) : null;
    if (g) counts.set(g, (counts.get(g) ?? 0) + s.sets);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => GROUP_LABEL[g])
    .join(' · ');
}

function methodFor(days: DraftDay[]): ProgressionMethod {
  const rules = days.flatMap((d) => d.slots.map((s) => s.rule));
  if (rules.includes('rpe')) return 'rpe';
  if (rules.includes('linear') && !rules.includes('double')) return 'linear';
  return 'double';
}

/** Create (no id) or update your own program. Returns the template id. */
export function saveProgram(db: DB, draft: ProgramDraft, templateId?: string): string {
  validateDraft(draft);
  for (const s of draft.days.flatMap((d) => d.slots)) {
    const ex = db.select().from(exercises).where(eq(exercises.id, s.exerciseId)).get();
    if (!ex) throw new Error('One of the exercises no longer exists');
  }
  if (templateId) {
    const tpl = db.select().from(programTemplates).where(eq(programTemplates.id, templateId)).get();
    if (!tpl || tpl.deletedAt) throw new Error('Program not found');
    if (!tpl.isCustom) throw new Error('Built-in programs can’t be edited. Make a copy instead.');
  }
  const id = templateId ?? `custom_${uuid()}`;
  const now = Date.now();
  const training = draft.days.filter((d) => !d.isRest).length;

  db.transaction((tx) => {
    const row = {
      name: draft.name.trim(),
      method: methodFor(draft.days),
      level: draft.level,
      weeks: draft.weeks,
      daysPerWeek: training,
      cycleLength: draft.days.length,
      minutes: draft.minutes,
      summary: draft.summary.trim() || `${training} training day${training === 1 ? '' : 's'} per ${draft.days.length}-day cycle, ${draft.weeks} weeks.`,
      rationale: 'Your own program.',
      isCustom: true,
    };
    if (templateId)
      tx.update(programTemplates)
        .set({ ...row, updatedAt: now })
        .where(eq(programTemplates.id, id))
        .run();
    else
      tx.insert(programTemplates)
        .values({ id, ...row })
        .run();

    // Phases: replace.
    tx.update(phases)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(phases.templateId, id), isNull(phases.deletedAt)))
      .run();
    if (phasesFit(draft)) {
      for (const p of draft.phases!)
        tx.insert(phases)
          .values({ id: uuid(), templateId: id, ...p })
          .run();
    } else {
      const deload = draft.deloadLastWeek && draft.weeks >= 2;
      tx.insert(phases)
        .values({ id: uuid(), templateId: id, weekFrom: 1, weekTo: deload ? draft.weeks - 1 : draft.weeks, kind: 'accumulation', volumeMult: 1 })
        .run();
      if (deload) tx.insert(phases).values({ id: uuid(), templateId: id, weekFrom: draft.weeks, weekTo: draft.weeks, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 }).run();
    }

    // Days: free every index first (the (template, day_index) pair is unique), then place the draft's days.
    const allDays = tx.select().from(templateDays).where(eq(templateDays.templateId, id)).all();
    allDays.forEach((d, k) =>
      tx
        .update(templateDays)
        .set({ dayIndex: -(k + 1) })
        .where(eq(templateDays.id, d.id))
        .run(),
    );
    const keptDayIds = new Set<string>();
    const keptSlotIds = new Set<string>();

    draft.days.forEach((day, dayIndex) => {
      const values = {
        templateId: id,
        dayIndex,
        name: day.name.trim() || (day.isRest ? 'Rest' : `Day ${dayIndex + 1}`),
        isRest: day.isRest,
        focus: day.isRest ? 'Recovery' : focusFor(tx as unknown as DB, day.slots),
        deletedAt: null,
      };
      let dayId = day.id && allDays.some((d) => d.id === day.id) ? day.id : undefined;
      if (dayId)
        tx.update(templateDays)
          .set({ ...values, updatedAt: now })
          .where(eq(templateDays.id, dayId))
          .run();
      else {
        dayId = uuid();
        tx.insert(templateDays)
          .values({ id: dayId, ...values })
          .run();
      }
      keptDayIds.add(dayId);

      const letters = seriesLetters(day.slots);
      (day.isRest ? [] : day.slots).forEach((s, position) => {
        const slotValues = {
          templateDayId: dayId!,
          exerciseId: s.exerciseId,
          series: letters[position],
          position,
          warmupSets: s.warmupSets,
          sets: s.sets,
          repMin: s.repMin,
          repMax: s.repMax,
          targetRpe: s.targetRpe,
          tempo: normaliseTempo(s.tempo),
          restS: s.restS,
          rule: s.rule,
          incrementKg: s.incrementKg,
          repScheme: s.repScheme?.trim() ? JSON.stringify(parseScheme(s.repScheme)) : null,
          deletedAt: null,
        };
        const existing = s.id ? tx.select().from(programExercises).where(eq(programExercises.id, s.id)).get() : undefined;
        if (existing) {
          tx.update(programExercises)
            .set({ ...slotValues, updatedAt: now })
            .where(eq(programExercises.id, existing.id))
            .run();
          keptSlotIds.add(existing.id);
        } else {
          const sid = uuid();
          tx.insert(programExercises)
            .values({ id: sid, ...slotValues })
            .run();
          keptSlotIds.add(sid);
        }
      });
    });

    // Soft-delete what the draft dropped.
    for (const d of allDays) {
      if (!keptDayIds.has(d.id) && !d.deletedAt) tx.update(templateDays).set({ deletedAt: now, updatedAt: now }).where(eq(templateDays.id, d.id)).run();
      const slots = tx.select().from(programExercises).where(eq(programExercises.templateDayId, d.id)).all();
      for (const s of slots) if (!keptSlotIds.has(s.id) && !s.deletedAt) tx.update(programExercises).set({ deletedAt: now, updatedAt: now }).where(eq(programExercises.id, s.id)).run();
    }
  });
  return id;
}

/** Load a program as an editable draft (ids included, so saving updates in place). */
export function draftFromTemplate(db: DB, templateId: string): ProgramDraft {
  const t = getTemplateDetail(db, templateId);
  if (!t) throw new Error('Program not found');
  const deload = t.phases.some((p) => p.kind === 'deload' && p.weekFrom === t.template.weeks);
  return {
    name: t.template.name,
    summary: t.template.isCustom ? t.template.summary : '',
    weeks: t.template.weeks,
    minutes: t.template.minutes,
    level: t.template.level,
    deloadLastWeek: deload,
    phases: t.phases.map((p) => ({ weekFrom: p.weekFrom, weekTo: p.weekTo, kind: p.kind, volumeMult: p.volumeMult, rpeTarget: p.rpeTarget, repMult: p.repMult })),
    days: t.days.map(({ day, slots }) => ({
      id: day.id,
      name: day.name,
      isRest: day.isRest,
      slots: slots.map(({ slot }, i) => ({
        id: slot.id,
        exerciseId: slot.exerciseId,
        supersetWithPrevious: i > 0 && slots[i - 1].slot.series === slot.series,
        sets: slot.sets,
        repMin: slot.repMin,
        repMax: slot.repMax,
        rule: slot.rule,
        targetRpe: slot.targetRpe,
        restS: slot.restS,
        warmupSets: slot.warmupSets,
        tempo: slot.tempo,
        incrementKg: slot.incrementKg,
        repScheme: formatScheme(readScheme(slot.repScheme)) || null,
      })),
    })),
  };
}

/** Copy any program (built-in or yours) into a new program of your own. Returns its id. */
export function copyProgram(db: DB, templateId: string, name?: string): string {
  const d = draftFromTemplate(db, templateId);
  const strip: ProgramDraft = {
    ...d,
    name: (name ?? `${d.name} (my copy)`).slice(0, LIMITS.name),
    days: d.days.map((day) => ({ ...day, id: undefined, slots: day.slots.map((s) => ({ ...s, id: undefined })) })),
  };
  return saveProgram(db, strip);
}

/** Delete one of your programs. Not allowed while it's your active program. */
export function deleteProgram(db: DB, templateId: string): void {
  const tpl = db.select().from(programTemplates).where(eq(programTemplates.id, templateId)).get();
  if (!tpl?.isCustom) throw new Error('Only your own programs can be deleted');
  const active = db
    .select()
    .from(enrolments)
    .where(and(eq(enrolments.templateId, templateId), eq(enrolments.status, 'active'), isNull(enrolments.deletedAt)))
    .orderBy(asc(enrolments.createdAt))
    .get();
  if (active) throw new Error('This is your active program. Start a different one first.');
  const now = Date.now();
  db.update(programTemplates).set({ deletedAt: now, updatedAt: now }).where(eq(programTemplates.id, templateId)).run();
}
