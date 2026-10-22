/**

 * 12-week simulation: a synthetic lifter runs Upper / Lower (8 weeks) and then the
 * first 4 weeks of the Strength Block, with the overload engine setting every
 * target and the weekly planner reviewing every week.
 *
 * The lifter is a simple deterministic model: each lift has a true strength that
 * grows a little each week, fatigue builds with hard weeks and drops with deloads,
 * and reps are whatever that strength allows (leaving 1 in reserve). The week-by-week
 * outcome is snapshotted, so any change to the engine or planner shows up as a diff.
 */
import { describe, expect, it } from 'vitest';

import { addDays } from '@/core/dates';
import type { PlanKind } from '@/core/planner';
import { startProgram } from '@/db/repositories/enrolments';
import { recommendWeek, saveCheckIn, saveWeekPlan } from '@/db/repositories/planner';
import { createTestDb } from './helpers';
import { Lifter, runProgramWeek, type WeekRow } from './sim-helpers';

describe('12-week simulation', () => {
  it('progresses, adapts to fatigue, and stays stable', async () => {
    const { db } = await createTestDb();
    const lifter = new Lifter();
    const rows: WeekRow[] = [];
    const blocks = [
      { template: 'tpl_upper_lower_4', weeks: 8, start: '2026-01-05' },
      { template: 'tpl_strength_block_4', weeks: 4, start: '2026-03-02' },
    ];
    let globalWeek = 0;
    for (const b of blocks) {
      const e = startProgram(db, b.template, b.start);
      for (let w = 1; w <= b.weeks; w++) {
        globalWeek++;
        let kind: PlanKind | null = null;
        if (w >= 2) {
          saveCheckIn(db, { enrolmentId: e.id, week: w - 1, checkIn: lifter.checkIn(), date: addDays(b.start, (w - 1) * 7) });
          const rec = recommendWeek(db, e.id, w);
          kind = rec.decision.kind;
          saveWeekPlan(db, { enrolmentId: e.id, recommendation: rec, accepted: true, date: addDays(b.start, (w - 1) * 7) });
        }
        const track: Record<string, number | null> = { bench_press: null, back_squat: null };
        const done = runProgramWeek(db, lifter, e.id, w, b.start, globalWeek * 7, track);
        rows.push({ week: globalWeek, program: b.template.replace('tpl_', ''), plan: kind ?? '-', bench: track.bench_press, squat: track.back_squat, fatigue: Math.round(lifter.fatigue * 10) / 10 });
        lifter.endWeek(kind, done);
      }
    }

    expect(rows).toMatchSnapshot();

    const plans = rows.map((r) => r.plan);
    // The planner reacts at least once to accumulated fatigue…
    expect(plans.some((p) => p === 'reduce' || p === 'deload')).toBe(true);
    // …never deloads two weeks running…
    for (let i = 1; i < plans.length; i++) expect(plans[i] === 'deload' && (plans[i - 1] === 'deload' || plans[i - 1] === 'planned_deload')).toBe(false);
    // …honours the program's own deload week…
    expect(rows[7].plan).toBe('planned_deload');
    // …and the lifter ends the Upper / Lower block stronger than they started.
    const ul = rows.slice(0, 7);
    expect(ul[6].bench!).toBeGreaterThan(ul[0].bench!);
    expect(ul[6].squat!).toBeGreaterThan(ul[0].squat!);
    // Fatigue never runs away.
    expect(Math.max(...rows.map((r) => r.fatigue))).toBeLessThan(5);
  });
});
