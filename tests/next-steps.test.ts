/** Program-complete summary, starting the next block, and first-run setup. */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { addDays } from '@/core/dates';
import { recommendPrograms, type SetupAnswers } from '@/core/recommend';
import { blockSummary, lastCompletedBlock, startNextBlock } from '@/db/repositories/block';
import { getActiveEnrolment, programDayPlan, startProgram } from '@/db/repositories/enrolments';
import { finishOnboarding, needsOnboarding } from '@/db/repositories/onboarding';
import { listTemplates } from '@/db/repositories/programs';
import { getSessionDetail, startProgramSession } from '@/db/repositories/sessions';
import { getSettings } from '@/db/repositories/settings';
import { enrolments } from '@/db/schema';
import { createTestDb } from './helpers';
import { Lifter, runProgramWeek } from './sim-helpers';

const START = '2026-01-05';

async function finishedMinimalist() {
  const { db } = await createTestDb();
  const lifter = new Lifter();
  const e = startProgram(db, 'tpl_minimal_2', START);
  for (let w = 1; w <= 8; w++) {
    runProgramWeek(db, lifter, e.id, w, START, w * 7, {});
    lifter.endWeek(w === 8 ? 'planned_deload' : 'as_written', 2);
  }
  return { db, e };
}

describe('program complete', () => {
  it('summarises the block: workouts, volume, records and strength change', async () => {
    const { db, e } = await finishedMinimalist();
    expect(db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!.status).toBe('completed');
    expect(lastCompletedBlock(db)?.id).toBe(e.id);
    expect(getActiveEnrolment(db)).toBeUndefined();

    const s = blockSummary(db, e.id)!;
    expect(s.sessionsDone).toBe(16);
    expect(s.sessionsPlanned).toBe(16);
    expect(s.firstDate).toBe(START);
    expect(s.volumeKg).toBeGreaterThan(0);
    expect(s.workingSets).toBeGreaterThan(100);
    // First block ever: nothing before it to beat, so no "records" yet.
    expect(s.recordLifts).toBe(0);
    // Main lifts got stronger and are listed biggest gain first.
    expect(s.lifts.length).toBeGreaterThan(2);
    expect(s.lifts.every((l) => l.endE1rmKg > l.startE1rmKg)).toBe(true);
    expect(s.lifts.map((l) => l.changePct)).toEqual([...s.lifts.map((l) => l.changePct)].sort((a, b) => b - a));
    expect(s.stepUp).toBeNull();
  });

  it('running it again carries on from the finishing weights', async () => {
    const { db, e } = await finishedMinimalist();
    const lastSquat = blockSummary(db, e.id)!;
    expect(lastSquat.lifts.find((l) => l.exerciseId === 'back_squat')).toBeDefined();

    const next = startNextBlock(db, { templateId: 'tpl_minimal_2', date: addDays(START, 63), deloadFirst: false });
    expect(lastCompletedBlock(db)).toBeUndefined(); // a program is running again
    const s = startProgramSession(db, { enrolmentId: next.id, programDay: 0, date: addDays(START, 63) });
    const squat = getSessionDetail(db, s.id)!.groups.find((g) => g.exercise.id === 'back_squat')!;
    const target = squat.sets.find((x) => x.setType === 'working')!.targetWeightKg!;
    expect(target).toBeGreaterThan(100); // started at 100 kg in the simulation
  });

  it('"deload week first" makes week 1 lighter, then normal from week 2', async () => {
    const { db } = await finishedMinimalist();
    const next = startNextBlock(db, { templateId: 'tpl_minimal_2', date: addDays(START, 63), deloadFirst: true });
    const live = db.select().from(enrolments).where(eq(enrolments.id, next.id)).get()!;
    const wk1 = programDayPlan(db, live, 0).slots.find((x) => x.exercise.id === 'back_squat')!;
    const wk2 = programDayPlan(db, live, 7).slots.find((x) => x.exercise.id === 'back_squat')!;
    expect(wk1.workingSets).toBe(2); // 3 × 0.5, rounded
    expect(wk1.adjust).toMatchObject({ deload: true, loadPct: 0.9, noIncrease: true });
    expect(wk2.workingSets).toBe(3);
    expect(wk2.adjust).toBeUndefined();
  });

  it('offers the next OVRLD level', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_ovrld_beginner', START);
    expect(blockSummary(db, e.id)!.stepUp?.id).toBe('tpl_ovrld_intermediate');
    const e2 = startProgram(db, 'tpl_ovrld_advanced', START);
    expect(blockSummary(db, e2.id)!.stepUp).toBeNull();
  });
});

describe('first-run setup', () => {
  it('shows only for a brand-new user, and never again once finished or skipped', async () => {
    const { db } = await createTestDb();
    expect(needsOnboarding(db)).toBe(true);
    finishOnboarding(db);
    expect(getSettings(db).onboarded).toBe(true);
    expect(needsOnboarding(db)).toBe(false);
  });

  it('is skipped for people who already have data (existing installs)', async () => {
    const { db } = await createTestDb();
    startProgram(db, 'tpl_ppl_6', START);
    expect(needsOnboarding(db)).toBe(false);
  });

  it('recommends programs that fit experience, days, goal and equipment', async () => {
    const { db } = await createTestDb();
    const all = listTemplates(db);
    const pick = (a: SetupAnswers) => recommendPrograms(all, a).map((p) => p.id);

    expect(pick({ experience: 'new', days: 3, goal: 'strength', equipment: 'gym' })[0]).toBe('tpl_fullbody_novice_3');
    expect(pick({ experience: 'some', days: 5, goal: 'muscle', equipment: 'gym' })[0]).toBe('tpl_ovrld_intermediate');
    expect(pick({ experience: 'experienced', days: 5, goal: 'muscle', equipment: 'gym' })[0]).toBe('tpl_ovrld_advanced');
    expect(pick({ experience: 'new', days: 2, goal: 'both', equipment: 'gym' })[0]).toBe('tpl_minimal_2');
    expect(pick({ experience: 'experienced', days: 4, goal: 'strength', equipment: 'gym' })[0]).toBe('tpl_strength_block_4');
    expect(pick({ experience: 'some', days: 3, goal: 'muscle', equipment: 'dumbbells' })).toEqual(['tpl_dumbbell_3']);

    // Never suggests more training days than you have by more than one, and never an advanced program to a beginner.
    for (const experience of ['new', 'some', 'experienced'] as const)
      for (const days of [2, 3, 4, 5, 6])
        for (const goal of ['muscle', 'strength', 'both'] as const) {
          const top = recommendPrograms(all, { experience, days, goal, equipment: 'gym' });
          expect(top.length).toBe(3);
          expect(top[0].daysPerWeek, `${experience}/${days}/${goal}`).toBeLessThanOrEqual(days);
          if (experience === 'new') expect(top.some((p) => p.level === 'advanced')).toBe(false);
        }
  });
});
