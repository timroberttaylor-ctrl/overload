import { describe, expect, it } from 'vitest';

import { latestBodyweight, logBodyweight, calcNutritionTargets, setNutritionTarget, currentNutritionTarget } from '@/db/repositories/body';
import { getActiveEnrolment, programDayPlan, reorderDays, startProgram, swapExercise, undoSwap, cycleOrder } from '@/db/repositories/enrolments';
import { createCustomExercise, listExercises, suggestAlternatives } from '@/db/repositories/exercises';
import { getTemplateDetail, listTemplates, setsForPhase } from '@/db/repositories/programs';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '@/db/repositories/settings';
import { createTestDb } from './helpers';

describe('settings', () => {
  it('returns defaults and persists changes', async () => {
    const { db } = await createTestDb();
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS);
    updateSettings(db, { units: 'lb', plateIncrementKg: 1.25 });
    expect(getSettings(db)).toMatchObject({ units: 'lb', plateIncrementKg: 1.25, autoAdvanceAfterLog: true });
  });
});

describe('exercises', () => {
  it('searches, filters by secondary muscle and creates custom exercises', async () => {
    const { db } = await createTestDb();
    expect(listExercises(db, { search: 'squat' }).length).toBeGreaterThan(3);
    const glutes = listExercises(db, { muscle: 'glutes' });
    expect(glutes.some((e) => e.id === 'back_squat')).toBe(true); // secondary muscle match
    const c = createCustomExercise(db, { name: ' Belt Squat ', primaryMuscle: 'quads', equipment: 'machine', pattern: 'squat' });
    expect(c.name).toBe('Belt Squat');
    expect(listExercises(db, { customOnly: true }).map((e) => e.id)).toEqual([c.id]);
    expect(() => createCustomExercise(db, { name: '  ', primaryMuscle: 'quads', equipment: 'x', pattern: 'squat' })).toThrow();
  });

  it('suggests same-muscle alternatives first', async () => {
    const { db } = await createTestDb();
    const alts = suggestAlternatives(db, 'seated_leg_curl');
    expect(alts[0].primaryMuscle).toBe('hamstrings');
    expect(alts.find((a) => a.id === 'seated_leg_curl')).toBeUndefined();
  });
});

describe('programs and enrolments', () => {
  it('lists templates with days and slots', async () => {
    const { db } = await createTestDb();
    expect(listTemplates(db)).toHaveLength(13);
    const d = getTemplateDetail(db, 'tpl_upper_lower_4')!;
    expect(d.days).toHaveLength(7);
    expect(d.days[0].slots[0].exercise.id).toBe('bench_press');
    expect(d.days[2].day.isRest).toBe(true);
  });

  it('starting a program abandons the previous one', async () => {
    const { db } = await createTestDb();
    const a = startProgram(db, 'tpl_ppl_6', '2026-10-01');
    const b = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    expect(getActiveEnrolment(db)!.id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
    expect(() => startProgram(db, 'nope', '2026-10-20')).toThrow();
  });

  it('maps program days to weeks and applies the deload phase', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const day0 = programDayPlan(db, e, 0);
    expect(day0.week).toBe(1);
    expect(day0.day.name).toBe('Upper A');
    expect(day0.slots[0].workingSets).toBe(3);
    const deload = programDayPlan(db, e, 7 * 7); // first day of week 8
    expect(deload.week).toBe(8);
    expect(deload.phase.kind).toBe('deload');
    expect(deload.slots[0].workingSets).toBe(setsForPhase(3, 0.5));
    expect(deload.slots[0].targetRpe).toBe(6);
    expect(programDayPlan(db, e, 9999).programDay).toBe(day0.totalDays - 1); // clamped
  });

  it('reorders days within a cycle and rejects invalid orders', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    reorderDays(db, e.id, [1, 0, 2, 3, 4, 5, 6]);
    const reordered = getActiveEnrolment(db)!;
    expect(programDayPlan(db, reordered, 0).day.name).toBe('Lower A');
    expect(programDayPlan(db, reordered, 7).day.name).toBe('Lower A'); // applies every cycle
    expect(() => reorderDays(db, e.id, [0, 0, 2, 3, 4, 5, 6])).toThrow();
    reorderDays(db, e.id, null);
    expect(cycleOrder(getActiveEnrolment(db)!, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('swaps for one session or the whole program, with undo', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_ppl_6', '2026-10-20');
    const legs = programDayPlan(db, e, 2);
    const curl = legs.slots.find((s) => s.exercise.id === 'lying_leg_curl')!;

    const programWide = swapExercise(db, { enrolmentId: e.id, programExerciseId: curl.slot.id, fromExerciseId: 'lying_leg_curl', toExerciseId: 'seated_leg_curl', scope: 'program' });
    expect(programDayPlan(db, e, 2).slots.find((s) => s.slot.id === curl.slot.id)!.exercise.id).toBe('seated_leg_curl');
    expect(programDayPlan(db, e, 9).slots.find((s) => s.slot.id === curl.slot.id)!.exercise.id).toBe('seated_leg_curl');

    swapExercise(db, { enrolmentId: e.id, programExerciseId: curl.slot.id, fromExerciseId: 'seated_leg_curl', toExerciseId: 'nordic_curl', scope: 'session', programDay: 9 });
    expect(programDayPlan(db, e, 9).slots.find((s) => s.slot.id === curl.slot.id)!.exercise.id).toBe('nordic_curl');
    expect(programDayPlan(db, e, 16).slots.find((s) => s.slot.id === curl.slot.id)!.exercise.id).toBe('seated_leg_curl');

    undoSwap(db, programWide.id);
    expect(programDayPlan(db, e, 16).slots.find((s) => s.slot.id === curl.slot.id)!.exercise.id).toBe('lying_leg_curl');
    expect(() =>
      swapExercise(db, { enrolmentId: e.id, programExerciseId: curl.slot.id, fromExerciseId: 'a', toExerciseId: 'b', scope: 'session' }),
    ).toThrow();
  });
});

describe('body weight and nutrition', () => {
  it('keeps one body-weight series; same date replaces', async () => {
    const { db } = await createTestDb();
    logBodyweight(db, '2026-10-01', 95.2);
    logBodyweight(db, '2026-10-08', 95.8);
    logBodyweight(db, '2026-10-08', 95.6);
    expect(latestBodyweight(db)!.kg).toBe(95.6);
    expect(latestBodyweight(db, '2026-10-05')!.kg).toBe(95.2);
    expect(() => logBodyweight(db, '2026-10-09', 5)).toThrow();
  });

  it('derives macro targets from the latest weight', async () => {
    const t = calcNutritionTargets(95, 'gain', 'moderate');
    expect(t.kcal).toBe(3280);
    expect(t.proteinG).toBe(190);
    expect(t.fatG).toBe(76);
    expect(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9).toBeGreaterThan(t.kcal - 10);
    const { db } = await createTestDb();
    expect(() => setNutritionTarget(db, '2026-10-22', 'gain', 'moderate')).toThrow();
    logBodyweight(db, '2026-10-20', 95);
    setNutritionTarget(db, '2026-10-22', 'gain', 'moderate');
    expect(currentNutritionTarget(db, '2026-10-22')!.kcal).toBe(3280);
    expect(currentNutritionTarget(db, '2026-10-21')).toBeUndefined();
  });
});

import { getExercise, setExerciseMediaUrl } from '@/db/repositories/exercises';
import { EXERCISE_MEDIA } from '@/db/seed/exercise-media';
import { SEED_EXERCISES } from '@/db/seed/exercises';

describe('exercise media', () => {
  it('only references real exercises', () => {
    const ids = new Set(SEED_EXERCISES.map((e) => e.id));
    for (const id of Object.keys(EXERCISE_MEDIA)) expect(ids, id).toContain(id);
    expect(Object.keys(EXERCISE_MEDIA).length).toBeGreaterThan(50);
  });

  it('stores a validated personal video link', async () => {
    const { db } = await createTestDb();
    setExerciseMediaUrl(db, 'rdl', 'https://example.com/my-rdl-video');
    expect(getExercise(db, 'rdl')!.mediaUrl).toBe('https://example.com/my-rdl-video');
    expect(() => setExerciseMediaUrl(db, 'rdl', 'not a link')).toThrow();
    setExerciseMediaUrl(db, 'rdl', '  ');
    expect(getExercise(db, 'rdl')!.mediaUrl).toBeNull();
  });
});
