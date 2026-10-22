/** Shared synthetic lifter and week runner for the simulation tests. */
import { eq } from 'drizzle-orm';

import { addDays } from '@/core/dates';
import type { CheckIn, PlanKind } from '@/core/planner';
import { programDayPlan, type Enrolment } from '@/db/repositories/enrolments';
import { getTemplateDetail } from '@/db/repositories/programs';
import { completeRestDay, finishSession, getSessionDetail, logSet, startProgramSession } from '@/db/repositories/sessions';
import { enrolments } from '@/db/schema';
import type { DB } from '@/db/types';

export const START_WEIGHT: Record<string, number> = { hack_squat: 100, incline_bench: 60, underhand_pulldown: 55, bench_press: 80, back_squat: 100, deadlift: 140, ohp: 50, barbell_row: 70, rdl: 90, front_squat: 70, lateral_raise: 8, db_curl: 12, hammer_curl: 12 };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(x)));

export class Lifter {
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

export type WeekRow = { week: number; program: string; plan: PlanKind | '-'; bench: number | null; squat: number | null; fatigue: number };

export function runProgramWeek(db: DB, lifter: Lifter, enrolmentId: string, week: number, startDate: string, dayOffset: number, track: Record<string, number | null>) {
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

