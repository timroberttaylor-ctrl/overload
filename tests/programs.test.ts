/**
 * Every built-in program, run end to end by the synthetic lifter with the weekly planner
 * in the loop, plus checks that phases really change the main lifts (fewer reps, more load).
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { addDays } from '@/core/dates';
import type { PlanKind } from '@/core/planner';
import { copyProgram, draftFromTemplate, phasesFit, saveProgram } from '@/db/repositories/builder';
import { programDayPlan, startProgram } from '@/db/repositories/enrolments';
import { recommendWeek, saveCheckIn, saveWeekPlan } from '@/db/repositories/planner';
import { getTemplateDetail, repsForPhase } from '@/db/repositories/programs';
import { enrolments } from '@/db/schema';
import { SEED_PROGRAMS } from '@/db/seed/programs';
import { createTestDb } from './helpers';
import { Lifter, runProgramWeek } from './sim-helpers';

const START = '2026-01-05';

describe('phase rep ranges', () => {
  it('only change RPE-prescribed lifts, and never go below 1 rep', () => {
    expect(repsForPhase('rpe', 8, 10, 0.6)).toEqual({ repMin: 5, repMax: 6 });
    expect(repsForPhase('rpe', 4, 6, 0.5)).toEqual({ repMin: 2, repMax: 3 });
    expect(repsForPhase('rpe', 1, 2, 0.3)).toEqual({ repMin: 1, repMax: 1 });
    expect(repsForPhase('double', 8, 12, 0.5)).toEqual({ repMin: 8, repMax: 12 });
    expect(repsForPhase('rpe', 5, 5, null)).toEqual({ repMin: 5, repMax: 5 });
  });

  it('Power & Size: bench goes 4–6 → 3–5 → 2–3 reps through the block, accessories unchanged', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_power_size_4', START);
    const live = () => db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!;
    const at = (week: number, id: string) => programDayPlan(db, live(), (week - 1) * 7).slots.find((x) => x.exercise.id === id)!;
    expect([at(1, 'bench_press').slot.repMin, at(1, 'bench_press').slot.repMax]).toEqual([4, 6]);
    expect([at(5, 'bench_press').slot.repMin, at(5, 'bench_press').slot.repMax]).toEqual([3, 5]);
    expect([at(8, 'bench_press').slot.repMin, at(8, 'bench_press').slot.repMax]).toEqual([2, 3]);
    expect(at(8, 'bench_press').targetRpe).toBe(9);
    expect([at(8, 'pull_up').slot.repMin, at(8, 'pull_up').slot.repMax]).toEqual([5, 8]); // double progression: as written
    expect(at(8, 'bench_press').slot.id).toBe(at(1, 'bench_press').slot.id); // same slot, so history carries on
  });
});

describe('every built-in program runs end to end', () => {
  for (const p of SEED_PROGRAMS) {
    it(`${p.name} (${p.weeks} weeks)`, async () => {
      const { db } = await createTestDb();
      const lifter = new Lifter();
      const e = startProgram(db, p.id, START);
      const trainingDays = p.days.filter((d) => !d.rest).length;
      const main = p.days.find((d) => !d.rest)!.slots[0].exerciseId;
      const deloadWeeks = new Set(p.phases.filter((ph) => ph.kind === 'deload').flatMap((ph) => Array.from({ length: ph.weekTo - ph.weekFrom + 1 }, (_, i) => ph.weekFrom + i)));

      const plans: (PlanKind | null)[] = [];
      const mainWeight: (number | null)[] = [];
      for (let w = 1; w <= p.weeks; w++) {
        let kind: PlanKind | null = null;
        if (w >= 2) {
          saveCheckIn(db, { enrolmentId: e.id, week: w - 1, checkIn: lifter.checkIn(), date: addDays(START, (w - 1) * 7) });
          const rec = recommendWeek(db, e.id, w);
          kind = rec.decision.kind;
          saveWeekPlan(db, { enrolmentId: e.id, recommendation: rec, accepted: true, date: addDays(START, (w - 1) * 7) });
        }
        const track: Record<string, number | null> = { [main]: null };
        const done = runProgramWeek(db, lifter, e.id, w, START, w * 7, track);
        expect(done, `week ${w} sessions`).toBe(trainingDays);
        plans.push(kind);
        mainWeight.push(track[main]);
        lifter.endWeek(kind, done);
      }

      // The program's own deload weeks are honoured, and the planner never stacks a second deload on one.
      for (const w of deloadWeeks) if (w > 1) expect(plans[w - 1], `week ${w}`).toBe('planned_deload');
      for (let i = 1; i < plans.length; i++) {
        const back2back = plans[i] === 'deload' && (plans[i - 1] === 'deload' || plans[i - 1] === 'planned_deload');
        expect(back2back, `weeks ${i}–${i + 1}`).toBe(false);
      }

      // The first lift of the first day is heavier by the last hard week than in week 1.
      const lastHard = Math.max(...Array.from({ length: p.weeks }, (_, i) => i + 1).filter((w) => !deloadWeeks.has(w)));
      expect(mainWeight[lastHard - 1]!, `${main}: week 1 ${mainWeight[0]} → week ${lastHard} ${mainWeight[lastHard - 1]}`).toBeGreaterThan(mainWeight[0]!);

      // Finishing the last day completes the program.
      expect(db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!.status).toBe('completed');
    });
  }
});

describe('copying a periodised program', () => {
  it('keeps its phases while the length and deload stay the same', async () => {
    const { db } = await createTestDb();
    const id = copyProgram(db, 'tpl_undulating_3');
    const phases = getTemplateDetail(db, id)!.phases.map((ph) => [ph.kind, ph.weekFrom, ph.weekTo, ph.repMult]);
    expect(phases).toEqual([
      ['accumulation', 1, 3, null],
      ['intensification', 4, 6, 0.75],
      ['realisation', 7, 7, 0.5],
      ['deload', 8, 8, null],
    ]);
  });

  it('falls back to build weeks + deload when the length changes', async () => {
    const { db } = await createTestDb();
    const id = copyProgram(db, 'tpl_undulating_3');
    const d = { ...draftFromTemplate(db, id), weeks: 10 };
    expect(phasesFit(d)).toBe(false);
    saveProgram(db, d, id);
    expect(getTemplateDetail(db, id)!.phases.map((ph) => [ph.kind, ph.weekFrom, ph.weekTo])).toEqual([
      ['accumulation', 1, 9],
      ['deload', 10, 10],
    ]);
  });
});
