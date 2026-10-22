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
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { addDays } from '@/core/dates';
import type { CheckIn, PlanKind } from '@/core/planner';
import { programDayPlan, startProgram, type Enrolment } from '@/db/repositories/enrolments';
import { recommendWeek, saveCheckIn, saveWeekPlan } from '@/db/repositories/planner';
import { getTemplateDetail } from '@/db/repositories/programs';
import { completeRestDay, finishSession, getSessionDetail, logSet, startProgramSession } from '@/db/repositories/sessions';
import { enrolments } from '@/db/schema';
import type { DB } from '@/db/types';
import { createTestDb } from './helpers';

const START_WEIGHT: Record<string, number> = { bench_press: 80, back_squat: 100, deadlift: 140, ohp: 50, barbell_row: 70, rdl: 90, front_squat: 70, lateral_raise: 8, db_curl: 12, hammer_curl: 12 };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(x)));

class Lifter {
  /** True one-rep max per exercise, kg */
  cap = new Map<string, number>();
  fatigue = 0;

  /** First time on a lift, the lifter picks a weight they could do for about target + 3 reps. */
  strength(id: string, firstWeight: number, target: number): number {
    if (!this.cap.has(id)) this.cap.set(id, firstWeight * (1 + (target + 3) / 30));
    return this.cap.get(id)! * (1 - 0.025 * this.fatigue);
  }

  /** Reps done for a target, leaving 1 in reserve; RPE from what was left. */
  perform(id: string, weightKg: number, target: number): { reps: number; rpe: number } {
    if (weightKg <= 0) return { reps: target, rpe: 7 };
    const possible = Math.floor(30 * (this.strength(id, weightKg, target) / weightKg - 1)) + 1;
    const reps = Math.max(1, Math.min(target, possible - 1));
    return { reps, rpe: Math.min(10, Math.max(6, 10 - (possible - reps))) };
  }

  endWeek(kind: PlanKind | null, sessionsDone: number) {
    for (const [id, c] of this.cap) this.cap.set(id, c * (1 + 0.015 * Math.max(0, 1 - this.fatigue / 6))); // ~1.5 %/week when fresh
    const load = kind === 'deload' || kind === 'planned_deload' ? -2.5 : kind === 'reduce' ? 0.2 : kind === 'push' ? 0.9 : 0.6;
    this.fatigue = Math.max(0, this.fatigue + load * (sessionsDone / 4));
  }

  checkIn(): CheckIn {
    const f = this.fatigue;
    return { fatigue: clamp(1.5 + f, 1, 5), soreness: clamp(1.2 + 0.8 * f, 1, 5), motivation: clamp(5 - 0.7 * f, 1, 5), jointPain: 1, jointPainRegion: null };
  }
}

type WeekRow = { week: number; program: string; plan: PlanKind | '-'; bench: number | null; squat: number | null; fatigue: number };

function runProgramWeek(db: DB, lifter: Lifter, enrolmentId: string, week: number, startDate: string, dayOffset: number, track: Record<string, number | null>) {
  const live = () => db.select().from(enrolments).where(eq(enrolments.id, enrolmentId)).get()! as Enrolment;
  const cycle = getTemplateDetail(db, live().templateId)!.template.cycleLength;
  let done = 0;
  for (let i = 0; i < cycle; i++) {
    const pd = (week - 1) * cycle + i;
    const plan = programDayPlan(db, live(), pd);
    if (plan.day.isRest) {
      completeRestDay(db, enrolmentId, pd);
      continue;
    }
    const date = addDays(startDate, pd);
    const now = Date.UTC(2026, 0, 1) + (dayOffset + pd) * 86_400_000;
    const s = startProgramSession(db, { enrolmentId, programDay: pd, date, now });
    for (const g of getSessionDetail(db, s.id)!.groups) {
      for (const set of g.sets.filter((x) => x.setType !== 'warmup')) {
        const w = set.targetWeightKg ?? START_WEIGHT[g.exercise.id] ?? 20;
        const r = lifter.perform(g.exercise.id, w, set.targetReps ?? 8);
        logSet(db, set.id, { weightKg: w, reps: r.reps, rpe: r.rpe }, now + 60_000);
        if (g.exercise.id in track && track[g.exercise.id] == null) track[g.exercise.id] = w;
      }
    }
    finishSession(db, s.id, now + 3_600_000);
    done++;
  }
  return done;
}

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
