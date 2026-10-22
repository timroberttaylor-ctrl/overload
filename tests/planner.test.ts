import { describe, expect, it } from 'vitest';

import { addDays } from '@/core/dates';
import { nextTarget } from '@/core/overload';
import { changeSummary, decideWeek, regionAffects, setsUnderPlan, type CheckIn, type PlanInput, type WeekMetrics } from '@/core/planner';
import { programDayPlan, startProgram, type Enrolment } from '@/db/repositories/enrolments';
import { clearWeekPlan, getWeekPlan, recommendWeek, reviewState, saveCheckIn, saveWeekPlan, weekMetrics, weekVolume, weeksSinceDeload } from '@/db/repositories/planner';
import { completeRestDay, finishSession, getSessionDetail, logSet, startProgramSession } from '@/db/repositories/sessions';
import { enrolments } from '@/db/schema';
import type { DB } from '@/db/types';
import { eq } from 'drizzle-orm';
import { createTestDb } from './helpers';

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

const good: WeekMetrics = { plannedSessions: 4, completedSessions: 4, setsWithTarget: 40, setsHitTarget: 39, rpeGap: -0.3, mainLifts: [{ exerciseId: 'a', name: 'Bench', changePct: 2 }] };
const fresh: CheckIn = { fatigue: 2, soreness: 2, motivation: 4, jointPain: 1, jointPainRegion: null };
const input = (over: Partial<PlanInput> = {}): PlanInput => ({ week: 3, weeksSinceDeload: 2, programDeload: false, checkIn: fresh, metrics: good, ...over });

describe('planner rules', () => {
  it('pushes when everything was done, targets were hit and you feel good', () => {
    const d = decideWeek(input());
    expect(d.kind).toBe('push');
    expect(d.extraAccessorySet).toBe(true);
    expect(d.volumeMult).toBe(1);
    expect(d.reasons.join(' ')).toMatch(/Every session done, 98% of sets hit target/);
  });

  it('never pushes without a check-in, with missed sessions, or with low motivation', () => {
    expect(decideWeek(input({ checkIn: null })).kind).toBe('as_written');
    expect(decideWeek(input({ checkIn: null })).reasons.at(-1)).toMatch(/No check-in/);
    expect(decideWeek(input({ metrics: { ...good, completedSessions: 3 } })).kind).toBe('as_written');
    expect(decideWeek(input({ checkIn: { ...fresh, motivation: 3 } })).kind).toBe('as_written');
  });

  it('goes lighter on one warning sign', () => {
    const d = decideWeek(input({ checkIn: { ...fresh, fatigue: 4 } }));
    expect(d).toMatchObject({ kind: 'reduce', volumeMult: 0.8, rpeCap: 8, noIncrease: false });
    expect(d.reasons[0]).toBe('Fatigue rated 4/5.');
    const misses = decideWeek(input({ metrics: { ...good, setsHitTarget: 24 } }));
    expect(misses.kind).toBe('reduce');
    expect(misses.reasons[0]).toMatch(/Only 60% of sets/);
    expect(decideWeek(input({ metrics: { ...good, rpeGap: 1.2 } })).reasons[0]).toMatch(/RPE \+1.2/);
  });

  it('deloads when fatigue plus soreness is high, on 3 warnings, or after 5+ weeks with 2 warnings', () => {
    expect(decideWeek(input({ checkIn: { ...fresh, fatigue: 4, soreness: 4 } }))).toMatchObject({ kind: 'deload', volumeMult: 0.5, rpeCap: 6, loadPct: 0.9, noIncrease: true });
    const two = { checkIn: { ...fresh, fatigue: 4 }, metrics: { ...good, rpeGap: 1 } };
    expect(decideWeek(input({ ...two, weeksSinceDeload: 3 })).kind).toBe('reduce');
    const late = decideWeek(input({ ...two, weeksSinceDeload: 5 }));
    expect(late.kind).toBe('deload');
    expect(late.reasons[0]).toMatch(/5 weeks since your last deload, with 2 warning signs/);
    const dip = {
      ...good,
      setsHitTarget: 20,
      rpeGap: 1.5,
      mainLifts: [
        { exerciseId: 'a', name: 'Bench', changePct: -3 },
        { exerciseId: 'b', name: 'Squat', changePct: -4 },
      ],
    };
    expect(decideWeek(input({ metrics: dip, checkIn: null })).kind).toBe('deload');
  });

  it('respects a deload the program already schedules, and weeks with no workouts', () => {
    expect(decideWeek(input({ programDeload: true, checkIn: { ...fresh, fatigue: 5, soreness: 5 } })).kind).toBe('planned_deload');
    expect(decideWeek(input({ metrics: { ...good, completedSessions: 0, setsWithTarget: 0, setsHitTarget: 0, rpeGap: null, mainLifts: [] } })).kind).toBe('as_written');
  });

  it('low attendance is never punished', () => {
    const d = decideWeek(input({ metrics: { ...good, completedSessions: 2 }, checkIn: null }));
    expect(d.kind).toBe('as_written');
    expect(d.reasons[0]).toMatch(/2 of 4 sessions. No penalty/);
  });

  it('joint pain adds a rule for that region only', () => {
    const sore = decideWeek(input({ checkIn: { ...fresh, jointPain: 4, jointPainRegion: 'knee' } }));
    expect(sore.region).toEqual({ region: 'knee', severity: 4, noIncrease: true, loadPct: 0.85, rpeCap: 7 });
    expect(sore.kind).toBe('as_written'); // pain stops a push
    expect(sore.reasons.join(' ')).toMatch(/Knee pain 4\/5.*physio/);
    expect(decideWeek(input({ checkIn: { ...fresh, jointPain: 3, jointPainRegion: 'elbow' } })).region).toMatchObject({ loadPct: null });
    expect(decideWeek(input({ checkIn: { ...fresh, jointPain: 3, jointPainRegion: null } })).kind).toBe('reduce');
    expect(regionAffects('knee', { primaryMuscle: 'quads', pattern: 'squat' })).toBe(true);
    expect(regionAffects('knee', { primaryMuscle: 'chest', pattern: 'push_h' })).toBe(false);
    expect(regionAffects('lower_back', { primaryMuscle: 'hamstrings', pattern: 'hinge' })).toBe(true);
  });

  it('scales sets and summarises changes', () => {
    expect(setsUnderPlan(3, { volumeMult: 0.8, extraAccessorySet: false }, false)).toBe(2);
    expect(setsUnderPlan(1, { volumeMult: 0.5, extraAccessorySet: false }, false)).toBe(1);
    expect(setsUnderPlan(3, { volumeMult: 1, extraAccessorySet: true }, true)).toBe(4);
    expect(setsUnderPlan(3, { volumeMult: 1, extraAccessorySet: true }, false)).toBe(3);
    expect(changeSummary(decideWeek(input({ checkIn: { ...fresh, fatigue: 5, soreness: 4 } })))).toEqual(['−50% working sets', 'Loads at 90% of last week', 'RPE 6 or less']);
  });

  it('engine: a deload load is a percentage of last time, rounded down', () => {
    const t = nextTarget({
      prescription: { rule: 'linear', sets: 3, repMin: 5, repMax: 5, targetRpe: 8, incrementKg: 2.5, roundStepKg: 2.5, failsBeforeReset: 3, resetPct: 0.9 },
      history: [{ date: '2026-10-20', plannedSets: 3, sets: [5, 5, 5].map((reps) => ({ weightKg: 100, reps })) }],
      today: '2026-10-27',
      adjust: { loadPct: 0.9, noIncrease: true, reason: 'Deload week' },
    });
    expect(t).toMatchObject({ weightKg: 90, kind: 'lighter' });
    expect(t.reason).toBe("Deload week: 90 kg (90% of last time's 100 kg).");
  });
});

// ---------------------------------------------------------------------------
// End to end on the database (Upper / Lower: 4 workouts + 3 rest days a week)
// ---------------------------------------------------------------------------

const START = '2026-10-19';
const START_TIME = Date.UTC(2026, 9, 18, 20, 0);
const FIRST_WEIGHT: Record<string, number> = { bench_press: 80, back_squat: 100, deadlift: 140, ohp: 50, barbell_row: 70, rdl: 90 };

/**
 * Run one program week. Every working set is logged at its target weight
 * (or a sensible starting weight), with `reps` deciding how many reps were done.
 */
function runWeek(db: DB, e: Enrolment, week: number, opts: { reps?: (target: number) => number; rpe?: number; skip?: number[] } = {}) {
  for (let i = 0; i < 7; i++) {
    const pd = (week - 1) * 7 + i;
    const date = addDays(START, pd);
    const now = START_TIME + pd * 86_400_000;
    const plan = programDayPlan(db, db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!, pd);
    if (plan.day.isRest || opts.skip?.includes(i)) {
      completeRestDay(db, e.id, pd);
      continue;
    }
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: pd, date, now });
    for (const g of getSessionDetail(db, s.id)!.groups) {
      for (const set of g.sets.filter((x) => x.setType !== 'warmup')) {
        const target = set.targetReps ?? 8;
        logSet(db, set.id, { weightKg: set.targetWeightKg ?? FIRST_WEIGHT[g.exercise.id] ?? 20, reps: opts.reps ? opts.reps(target) : target, rpe: opts.rpe ?? null }, now + 60_000);
      }
    }
    finishSession(db, s.id, now + 3_600_000);
  }
}

const slotOf = (db: DB, e: Enrolment, pd: number, exerciseId: string) => programDayPlan(db, e, pd).slots.find((s) => s.exercise.id === exerciseId)!;

describe('weekly planner on real logs', () => {
  it('reviews week 1, pushes week 2 and adds sets to the under-trained muscles', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', START);
    expect(reviewState(db, e)).toEqual({ status: 'none' });
    runWeek(db, e, 1, { rpe: 7 });

    const m = weekMetrics(db, e.id, 1);
    expect(m).toMatchObject({ plannedSessions: 4, completedSessions: 4, rpeGap: -1 }); // RPE 7 logged vs 8 targeted on main lifts
    expect(m.setsHitTarget).toBe(m.setsWithTarget);
    const live = () => db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!;
    expect(reviewState(db, live())).toEqual({ status: 'due', reviewWeek: 1, planWeek: 2 });

    saveCheckIn(db, { enrolmentId: e.id, week: 1, checkIn: { fatigue: 2, soreness: 2, motivation: 5, jointPain: 1, jointPainRegion: null }, date: '2026-10-26' });
    const rec = recommendWeek(db, e.id, 2);
    expect(rec.decision.kind).toBe('push');
    saveWeekPlan(db, { enrolmentId: e.id, recommendation: rec, accepted: true, date: '2026-10-26' });
    expect(reviewState(db, live())).toMatchObject({ status: 'planned', planWeek: 2 });

    // Upper / Lower plans 6 chest and 4.5 calf sets a week (below 10 and 6), so those get the extra sets.
    expect(rec.decision.pushGroups).toEqual(['chest', 'calves']);
    expect(rec.decision.reasons.join(' ')).toMatch(/Chest \(6 sets, aim 10\+\) and Calves \(4.5 sets, aim 6\+\)/);
    expect(slotOf(db, live(), 7, 'bench_press').workingSets).toBe(4);
    expect(slotOf(db, live(), 10, 'incline_db_press').workingSets).toBe(4);
    expect(slotOf(db, live(), 8, 'standing_calf_raise').workingSets).toBe(4);
    expect(slotOf(db, live(), 7, 'db_curl').workingSets).toBe(2); // biceps already in range
    expect(slotOf(db, live(), 0, 'bench_press').workingSets).toBe(3); // week 1 untouched
    expect(weekVolume(db, e.id, 2).planned).toMatchObject({ chest: 8, calves: 5.5 }); // only one calf exercise, so +1
  });

  it('a hard week leads to a lighter week; "keep as written" changes nothing; undo asks again', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', START);
    runWeek(db, e, 1);
    runWeek(db, e, 2, { reps: (t) => Math.max(1, t - 1) });
    const live = db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!;

    const rec = recommendWeek(db, e.id, 3);
    expect(rec.metrics.setsHitTarget).toBe(0);
    expect(rec.decision.kind).toBe('reduce');

    saveWeekPlan(db, { enrolmentId: e.id, recommendation: rec, accepted: false, date: '2026-11-02' });
    expect(getWeekPlan(db, e.id, 3)!.row.accepted).toBe(false);
    expect(slotOf(db, live, 15, 'lying_leg_curl').workingSets).toBe(3); // as written

    saveWeekPlan(db, { enrolmentId: e.id, recommendation: rec, accepted: true, date: '2026-11-02' });
    expect(slotOf(db, live, 15, 'lying_leg_curl').workingSets).toBe(2); // 3 × 0.8
    expect(slotOf(db, live, 15, 'lying_leg_curl').adjust).toMatchObject({ rpeCap: 8 });

    clearWeekPlan(db, e.id, 3);
    expect(reviewState(db, live)).toEqual({ status: 'due', reviewWeek: 2, planWeek: 3 });
  });

  it('a deload lowers loads and sets, then progression resumes from the pre-deload weights', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', START);
    runWeek(db, e, 1);
    saveCheckIn(db, { enrolmentId: e.id, week: 1, checkIn: { fatigue: 4, soreness: 4, motivation: 2, jointPain: 1, jointPainRegion: null }, date: '2026-10-26' });
    const rec = recommendWeek(db, e.id, 2);
    expect(rec.decision.kind).toBe('deload');
    saveWeekPlan(db, { enrolmentId: e.id, recommendation: rec, accepted: true, date: '2026-10-26' });

    // Week 1 bench: 80 kg. Week 2 (deload) would have been 82.5; instead 90% of 80 = 72, rounded down to 70; 2 sets (3 × 0.5 rounds to 2).
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 7, date: addDays(START, 7), now: START_TIME + 7 * 86_400_000 });
    const bench = getSessionDetail(db, s.id)!.groups.find((g) => g.exercise.id === 'bench_press')!;
    const working = bench.sets.filter((x) => x.setType === 'working');
    expect(working).toHaveLength(2);
    expect(working[0].targetWeightKg).toBe(70);
    expect(working[0].targetRpe).toBe(6);
    expect(bench.note).toMatch(/Deload week: 70 kg/);
    expect(JSON.parse(getSessionDetail(db, s.id)!.session.adjustments!)).toMatchObject({ deload: true });
    for (const g of getSessionDetail(db, s.id)!.groups) for (const x of g.sets.filter((y) => y.setType !== 'warmup')) logSet(db, x.id, { weightKg: x.targetWeightKg ?? 20, reps: x.targetReps ?? 8 });
    finishSession(db, s.id, START_TIME + 7 * 86_400_000 + 3_600_000);
    for (const pd of [8, 9, 10, 11, 12, 13]) {
      if (programDayPlan(db, db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!, pd).day.isRest) completeRestDay(db, e.id, pd);
      else {
        const x = startProgramSession(db, { enrolmentId: e.id, programDay: pd, date: addDays(START, pd), now: START_TIME + pd * 86_400_000 });
        for (const g of getSessionDetail(db, x.id)!.groups)
          for (const y of g.sets.filter((z) => z.setType !== 'warmup')) logSet(db, y.id, { weightKg: y.targetWeightKg ?? FIRST_WEIGHT[g.exercise.id] ?? 20, reps: y.targetReps ?? 8 });
        finishSession(db, x.id, START_TIME + pd * 86_400_000 + 3_600_000);
      }
    }
    expect(weeksSinceDeload(db, e.id, 3)).toBe(0);

    // Week 3: no plan, back to normal. Bench continues from 80 → 82.5, not from the deload's 70.
    const live = db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!;
    expect(reviewState(db, live)).toMatchObject({ status: 'due', planWeek: 3 });
    const s3 = startProgramSession(db, { enrolmentId: e.id, programDay: 14, date: addDays(START, 14), now: START_TIME + 14 * 86_400_000 });
    const bench3 = getSessionDetail(db, s3.id)!.groups.find((g) => g.exercise.id === 'bench_press')!;
    expect(bench3.sets.filter((x) => x.setType === 'working').map((x) => x.targetWeightKg)).toEqual([82.5, 82.5, 82.5]);
    expect(bench3.lastTime?.sets[0].weightKg).toBe(70); // "last time" still shows what you really did
  });

  it('knee pain lightens knee-dominant exercises only', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', START);
    runWeek(db, e, 1);
    saveCheckIn(db, { enrolmentId: e.id, week: 1, checkIn: { fatigue: 2, soreness: 2, motivation: 4, jointPain: 4, jointPainRegion: 'knee' }, date: '2026-10-26' });
    expect(() => saveCheckIn(db, { enrolmentId: e.id, week: 1, checkIn: { fatigue: 2, soreness: 2, motivation: 4, jointPain: 4, jointPainRegion: null }, date: '2026-10-26' })).toThrow(/where/);
    const rec = recommendWeek(db, e.id, 2);
    saveWeekPlan(db, { enrolmentId: e.id, recommendation: rec, accepted: true, date: '2026-10-26' });
    const live = db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!;
    expect(slotOf(db, live, 8, 'back_squat').adjust).toMatchObject({ loadPct: 0.85, rpeCap: 7, noIncrease: true });
    expect(slotOf(db, live, 8, 'back_squat').planNote).toBe('Knee: 85% load');
    expect(slotOf(db, live, 7, 'bench_press').adjust).toBeUndefined();

    // Squat was 100 kg in week 1 → 85 kg; bench still progresses to 82.5.
    completeRestDay(db, e.id, 7);
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 8, date: addDays(START, 8), now: START_TIME + 8 * 86_400_000 });
    const squat = getSessionDetail(db, s.id)!.groups.find((g) => g.exercise.id === 'back_squat')!;
    expect(squat.sets.find((x) => x.setType === 'working')!.targetWeightKg).toBe(85);
    expect(JSON.parse(getSessionDetail(db, s.id)!.session.adjustments!).deload).toBeUndefined();
  });

  it("the program's own deload week drops loads to 90% too", async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', START);
    for (let w = 1; w <= 7; w++) runWeek(db, e, w);
    const live = db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!;
    expect(recommendWeek(db, e.id, 8).decision.kind).toBe('planned_deload');
    const bench = slotOf(db, live, 49, 'bench_press');
    expect(bench.workingSets).toBe(2);
    expect(bench.adjust).toMatchObject({ loadPct: 0.9, deload: true });
    // Bench is on Upper A only: +2.5 kg a week → 80 + 6 × 2.5 = 95 kg in week 7
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 49, date: addDays(START, 49), now: START_TIME + 49 * 86_400_000 });
    const w = getSessionDetail(db, s.id)!
      .groups.find((g) => g.exercise.id === 'bench_press')!
      .sets.find((x) => x.setType === 'working')!;
    expect(w.targetWeightKg).toBe(85); // 90% of 95, rounded down to 2.5
  });
});

describe('8-week simulation with the planner in the loop', () => {
  it('reviews every week, adapts to a rough patch and finishes the program', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', START);
    const live = () => db.select().from(enrolments).where(eq(enrolments.id, e.id)).get()!;
    const feel: Record<number, CheckIn> = {
      1: { fatigue: 2, soreness: 2, motivation: 5, jointPain: 1, jointPainRegion: null },
      2: { fatigue: 2, soreness: 3, motivation: 4, jointPain: 1, jointPainRegion: null },
      3: { fatigue: 4, soreness: 3, motivation: 3, jointPain: 1, jointPainRegion: null },
      4: { fatigue: 3, soreness: 3, motivation: 3, jointPain: 1, jointPainRegion: null },
      5: { fatigue: 4, soreness: 5, motivation: 2, jointPain: 1, jointPainRegion: null },
      6: { fatigue: 2, soreness: 2, motivation: 4, jointPain: 3, jointPainRegion: 'shoulder' },
      7: { fatigue: 2, soreness: 2, motivation: 4, jointPain: 1, jointPainRegion: null },
    };
    const kinds: string[] = [];
    for (let w = 1; w <= 8; w++) {
      if (w >= 2) {
        expect(reviewState(db, live())).toMatchObject({ status: 'due', planWeek: w });
        saveCheckIn(db, { enrolmentId: e.id, week: w - 1, checkIn: feel[w - 1], date: addDays(START, w * 7 - 7) });
        const rec = recommendWeek(db, e.id, w);
        kinds.push(rec.decision.kind);
        saveWeekPlan(db, { enrolmentId: e.id, recommendation: rec, accepted: true, date: addDays(START, w * 7 - 7) });
      }
      runWeek(db, e, w, { skip: w === 4 ? [3, 4] : [] });
    }
    // 2: push · 3: push · 4: fatigue 4 → lighter · 5: two skipped sessions, no penalty
    // 6: fatigue 4 + soreness 5 → deload · 7: shoulder pain 3 → as written + region rule · 8: program deload
    expect(kinds).toEqual(['push', 'push', 'reduce', 'as_written', 'deload', 'as_written', 'planned_deload']);
    expect(getWeekPlan(db, e.id, 7)!.decision.region).toMatchObject({ region: 'shoulder', loadPct: null });
    expect(live().status).toBe('completed');
    expect(reviewState(db, live())).toEqual({ status: 'none' });
  });
});
