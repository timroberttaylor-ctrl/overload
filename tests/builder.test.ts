import { describe, expect, it } from 'vitest';

import { copyProgram, defaultSlot, deleteProgram, draftFromTemplate, emptyDraft, saveProgram, seriesLetters, validateDraft, type ProgramDraft } from '@/db/repositories/builder';
import { programDayPlan, startProgram } from '@/db/repositories/enrolments';
import { getExercise } from '@/db/repositories/exercises';
import { getTemplateDetail, listTemplates } from '@/db/repositories/programs';
import { exerciseResults, finishSession, getSessionDetail, logSet, startProgramSession } from '@/db/repositories/sessions';
import type { DB } from '@/db/types';
import { createTestDb } from './helpers';

function twoDayDraft(db: DB): ProgramDraft {
  const slot = (id: string) => defaultSlot(getExercise(db, id)!);
  return {
    ...emptyDraft(),
    name: 'My push/pull',
    weeks: 6,
    days: [
      { name: 'Push', isRest: false, slots: [slot('bench_press'), slot('lateral_raise'), { ...slot('triceps_pushdown'), supersetWithPrevious: true }] },
      { name: '', isRest: true, slots: [] },
      { name: 'Pull', isRest: false, slots: [slot('barbell_row'), slot('db_curl')] },
    ],
  };
}

describe('program builder', () => {
  it('validates drafts with readable messages', async () => {
    const { db } = await createTestDb();
    const d = twoDayDraft(db);
    expect(() => validateDraft({ ...d, name: ' ' })).toThrow(/name/);
    expect(() => validateDraft({ ...d, weeks: 20 })).toThrow(/1–16 weeks/);
    expect(() => validateDraft({ ...d, days: [{ name: 'R', isRest: true, slots: [] }] })).toThrow(/training day/);
    expect(() => validateDraft({ ...d, days: [{ name: 'Empty', isRest: false, slots: [] }] })).toThrow(/Empty has no exercises/);
    const bad = twoDayDraft(db);
    bad.days[0].slots[0] = { ...bad.days[0].slots[0], repMin: 10, repMax: 8 };
    expect(() => validateDraft(bad)).toThrow(/Push, exercise 1: check the rep range/);
    bad.days[0].slots[0] = { ...bad.days[0].slots[0], repMin: 5, repMax: 5, tempo: '3-1-X' };
    expect(() => validateDraft(bad)).toThrow(/tempo/);
    bad.days[0].slots[0] = { ...bad.days[0].slots[0], tempo: null, rule: 'rpe', targetRpe: null };
    expect(() => validateDraft(bad)).toThrow(/target RPE/);
    expect(seriesLetters([{ supersetWithPrevious: false }, { supersetWithPrevious: false }, { supersetWithPrevious: true }, { supersetWithPrevious: false }])).toEqual(['A', 'B', 'B', 'C']);
  });

  it('creates a program you can start, with days, supersets, focus and a deload', async () => {
    const { db } = await createTestDb();
    const id = saveProgram(db, twoDayDraft(db));
    const t = getTemplateDetail(db, id)!;
    expect(t.template).toMatchObject({ name: 'My push/pull', isCustom: true, weeks: 6, daysPerWeek: 2, cycleLength: 3, method: 'double' });
    expect(t.days.map((d) => [d.day.name, d.day.isRest, d.day.focus])).toEqual([
      ['Push', false, 'Chest · Shoulders · Triceps'],
      ['Rest', true, 'Recovery'],
      ['Pull', false, 'Back · Biceps'],
    ]);
    expect(t.days[0].slots.map((s) => s.slot.series)).toEqual(['A', 'B', 'B']);
    expect(t.days[0].slots[0].slot).toMatchObject({ sets: 3, repMin: 6, repMax: 10, warmupSets: 1, restS: 150, tempo: '3/0/X/0' });
    expect(t.phases.map((p) => [p.kind, p.weekFrom, p.weekTo])).toEqual([
      ['accumulation', 1, 5],
      ['deload', 6, 6],
    ]);
    expect(listTemplates(db).some((x) => x.id === id)).toBe(true);
    const e = startProgram(db, id, '2026-10-20');
    expect(programDayPlan(db, e, 2).day.name).toBe('Pull');
  });

  it('edits in place: history carries on for kept exercises, removed ones disappear, days reorder', async () => {
    const { db } = await createTestDb();
    const id = saveProgram(db, twoDayDraft(db));
    const e = startProgram(db, id, '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20', now: Date.UTC(2026, 9, 20, 8) });
    for (const g of getSessionDetail(db, s.id)!.groups) for (const x of g.sets.filter((y) => y.setType !== 'warmup')) logSet(db, x.id, { weightKg: 60, reps: 10 });
    finishSession(db, s.id, Date.UTC(2026, 9, 20, 9));

    const d = draftFromTemplate(db, id);
    const benchSlotId = d.days[0].slots[0].id!;
    d.days[0].slots[0].sets = 4; // edit
    d.days[0].slots.splice(1, 1); // remove lateral raise
    d.days[0].slots[1].supersetWithPrevious = false;
    d.days = [d.days[2], d.days[1], d.days[0]]; // Pull first now
    saveProgram(db, d, id);

    const t = getTemplateDetail(db, id)!;
    expect(t.days.map((x) => x.day.name)).toEqual(['Pull', 'Rest', 'Push']);
    const push = t.days[2];
    expect(push.slots.map((x) => [x.slot.exerciseId, x.slot.series, x.slot.sets])).toEqual([
      ['bench_press', 'A', 4],
      ['triceps_pushdown', 'B', 3],
    ]);
    expect(push.slots[0].slot.id).toBe(benchSlotId);
    // Progression history follows the slot id
    expect(exerciseResults(db, 'bench_press', { programExerciseId: benchSlotId })).toHaveLength(1);
    // Saving again is stable
    saveProgram(db, draftFromTemplate(db, id), id);
    expect(getTemplateDetail(db, id)!.days.map((x) => x.day.name)).toEqual(['Pull', 'Rest', 'Push']);
  });

  it('copies built-in programs, refuses to edit them, and protects the active program from deletion', async () => {
    const { db } = await createTestDb();
    expect(() => saveProgram(db, draftFromTemplate(db, 'tpl_upper_lower_4'), 'tpl_upper_lower_4')).toThrow(/copy/);
    const copy = copyProgram(db, 'tpl_upper_lower_4');
    const t = getTemplateDetail(db, copy)!;
    expect(t.template).toMatchObject({ name: 'Upper / Lower Foundation (my copy)', isCustom: true, weeks: 8, cycleLength: 7 });
    expect(t.days[0].slots.map((s) => s.slot.series)).toEqual(['A', 'B', 'C', 'D', 'E', 'E']);
    expect(t.phases.at(-1)).toMatchObject({ kind: 'deload', weekFrom: 8 });
    expect(() => deleteProgram(db, 'tpl_upper_lower_4')).toThrow(/own programs/);
    startProgram(db, copy, '2026-10-20');
    expect(() => deleteProgram(db, copy)).toThrow(/active program/);
    startProgram(db, 'tpl_ppl_6', '2026-10-21');
    deleteProgram(db, copy);
    expect(listTemplates(db).some((x) => x.id === copy)).toBe(false);
  });
});
