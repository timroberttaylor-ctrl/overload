/**
 * Adaptive weekly planner: pure functions, no I/O.
 *
 * After each program week it looks at what actually happened (sessions done,
 * sets that hit their target reps, effort versus target, main-lift strength
 * trend) plus an optional 1–5 check-in, and recommends how to run the next week:
 * deload, lighter, push, or as written. Every recommendation carries plain-language
 * reasons, and the lifter accepts or keeps the program as written.
 *
 * No wearable or readiness score is used (wearables are a post-launch feature).
 */

import { GROUP_LABEL, GROUP_TARGET, groupOf, laggingGroups, type MuscleGroup, type Volume } from './volume';

export const JOINT_REGIONS = ['shoulder', 'elbow', 'wrist', 'lower_back', 'hip', 'knee'] as const;
export type JointRegion = (typeof JOINT_REGIONS)[number];

export const REGION_LABEL: Record<JointRegion, string> = {
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist: 'Wrist',
  lower_back: 'Lower back',
  hip: 'Hip',
  knee: 'Knee',
};

/** Each item 1–5. Fatigue/soreness/joint pain: 1 = none, 5 = severe. Motivation: 1 = none, 5 = keen. */
export type CheckIn = {
  fatigue: number;
  soreness: number;
  motivation: number;
  jointPain: number;
  jointPainRegion: JointRegion | null;
};

export type LiftTrend = { exerciseId: string; name: string; changePct: number };

export type WeekMetrics = {
  plannedSessions: number;
  completedSessions: number;
  /** Working sets that had a rep target and were logged */
  setsWithTarget: number;
  /** …of which reached the target reps */
  setsHitTarget: number;
  /** Mean of (logged RPE − target RPE) over sets that have both; null when none */
  rpeGap: number | null;
  /** Best e1RM this week versus the best of the two weeks before, main (compound) lifts only */
  mainLifts: LiftTrend[];
  /** Working sets done per muscle group (optional for older stored plans) */
  volume?: Volume;
};

export type PlanKind = 'deload' | 'reduce' | 'push' | 'as_written' | 'planned_deload';

export type RegionRule = { region: JointRegion; severity: number; noIncrease: true; loadPct: number | null; rpeCap: number | null };

export type WeekDecision = {
  kind: PlanKind;
  /** Multiplier on working sets (on top of the program's own phase) */
  volumeMult: number;
  rpeCap: number | null;
  /** Hold loads at last week's weight (no increases) */
  noIncrease: boolean;
  /** Fraction of last working weight to use (deload), or null */
  loadPct: number | null;
  /** +1 working set on isolation (accessory) exercises (push, when no muscle is lagging) */
  extraAccessorySet: boolean;
  /** Push: muscle groups that were under their weekly range and get extra sets */
  pushGroups?: MuscleGroup[];
  /** Push: the program slots that get +1 set (chosen by the repository, up to 2 per group) */
  pushSlotIds?: string[];
  region: RegionRule | null;
  reasons: string[];
  warnings: string[];
};

export type PlanInput = {
  /** The week being planned (1-based) */
  week: number;
  /** Full program weeks since the last deload (or since the start) before `week` */
  weeksSinceDeload: number;
  /** The program already schedules a deload for `week` */
  programDeload: boolean;
  /** Muscle groups the planned week trains as a main muscle (where extra sets can go) */
  trainableGroups?: MuscleGroup[];
  checkIn: CheckIn | null;
  /** The week just finished */
  metrics: WeekMetrics;
};

export const PLAN_LABEL: Record<PlanKind, string> = {
  deload: 'Deload week',
  reduce: 'Lighter week',
  push: 'Push week',
  as_written: 'As written',
  planned_deload: 'Planned deload',
};

const MIN_SETS_FOR_RATES = 6;
const LIFT_DROP_PCT = -2.5;

export function hitRate(m: WeekMetrics): number | null {
  return m.setsWithTarget >= MIN_SETS_FOR_RATES ? m.setsHitTarget / m.setsWithTarget : null;
}

export function adherence(m: WeekMetrics): number | null {
  return m.plannedSessions > 0 ? m.completedSessions / m.plannedSessions : null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const one = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

/** The warning signs, each as a readable sentence. */
export function warningSigns(input: Pick<PlanInput, 'checkIn' | 'metrics'>): string[] {
  const { checkIn: c, metrics: m } = input;
  const out: string[] = [];
  if (c && c.fatigue >= 4) out.push(`Fatigue rated ${c.fatigue}/5.`);
  if (c && c.soreness >= 4) out.push(`Soreness rated ${c.soreness}/5.`);
  if (c && c.jointPain >= 3 && !c.jointPainRegion) out.push(`Joint pain rated ${c.jointPain}/5.`);
  const hr = hitRate(m);
  if (hr != null && hr < 0.7) out.push(`Only ${pct(hr)} of sets reached their target reps.`);
  if (m.rpeGap != null && m.rpeGap >= 1 && m.setsWithTarget >= MIN_SETS_FOR_RATES) out.push(`Sets felt harder than planned (RPE +${one(m.rpeGap)} on average).`);
  const down = m.mainLifts.filter((l) => l.changePct <= LIFT_DROP_PCT);
  if (down.length >= 2) out.push(`Strength dipped on ${down.map((l) => l.name).join(', ')}.`);
  return out;
}

function regionRule(c: CheckIn | null): RegionRule | null {
  if (!c || !c.jointPainRegion || c.jointPain < 3) return null;
  return c.jointPain >= 4
    ? { region: c.jointPainRegion, severity: c.jointPain, noIncrease: true, loadPct: 0.85, rpeCap: 7 }
    : { region: c.jointPainRegion, severity: c.jointPain, noIncrease: true, loadPct: null, rpeCap: null };
}

function regionReason(r: RegionRule): string {
  const where = REGION_LABEL[r.region].toLowerCase();
  return r.loadPct
    ? `${REGION_LABEL[r.region]} pain ${r.severity}/5: exercises that load the ${where} drop to ${pct(r.loadPct)} of last week's weight at RPE 7 or less. If pain persists, see a physio.`
    : `${REGION_LABEL[r.region]} pain ${r.severity}/5: no load increases on exercises that load the ${where}.`;
}

export function decideWeek(input: PlanInput): WeekDecision {
  const { checkIn: c, metrics: m } = input;
  const warnings = warningSigns(input);
  const region = regionRule(c);
  const hr = hitRate(m);
  const adh = adherence(m);
  const reasons: string[] = [];
  const base = { region, warnings, extraAccessorySet: false, noIncrease: false, loadPct: null as number | null };

  const finish = (d: Pick<WeekDecision, 'kind' | 'volumeMult' | 'rpeCap'> & Partial<WeekDecision>): WeekDecision => {
    const out = [...reasons];
    if (region) out.push(regionReason(region));
    if (!c) out.push('No check-in this week, so this is based on your logged sets only.');
    return { ...base, ...d, reasons: out };
  };

  if (input.programDeload) {
    reasons.push('Your program schedules a deload this week: lighter loads and fewer sets so you recover and come back stronger.');
    return finish({ kind: 'planned_deload', volumeMult: 1, rpeCap: null });
  }

  if (m.completedSessions === 0) {
    reasons.push('No workouts were logged last week, so there is nothing to adjust from. Pick up where you left off.');
    return finish({ kind: 'as_written', volumeMult: 1, rpeCap: null });
  }

  const tired = c ? c.fatigue + c.soreness : 0;
  const deloadDue = tired >= 8 || warnings.length >= 3 || (input.weeksSinceDeload >= 5 && warnings.length >= 2);
  if (deloadDue) {
    if (tired >= 8) reasons.push(`Fatigue plus soreness is ${tired}/10, which is high.`);
    else if (input.weeksSinceDeload >= 5 && warnings.length < 3) reasons.push(`${input.weeksSinceDeload} weeks since your last deload, with ${warnings.length} warning signs.`);
    else reasons.push(`${warnings.length} warning signs at once.`);
    reasons.push(...warnings.filter((w) => !reasons.includes(w)));
    reasons.push("Deload: half the sets, about 90% of last week's weights, RPE 6 or less. Your progression picks up from your pre-deload weights afterwards.");
    return finish({ kind: 'deload', volumeMult: 0.5, rpeCap: 6, noIncrease: true, loadPct: 0.9 });
  }

  if (warnings.length >= 1) {
    reasons.push(...warnings);
    reasons.push('Lighter week: about 20% fewer sets and RPE 8 or less, to absorb the work without losing momentum.');
    return finish({ kind: 'reduce', volumeMult: 0.8, rpeCap: 8 });
  }

  const pushReady = !!c && c.motivation >= 4 && c.fatigue <= 3 && c.soreness <= 3 && c.jointPain <= 2 && hr != null && hr >= 0.9 && (m.rpeGap == null || m.rpeGap <= 0) && adh != null && adh >= 1;
  if (pushReady) {
    reasons.push(`Every session done, ${pct(hr!)} of sets hit target${m.rpeGap != null ? `, effort ${m.rpeGap <= 0 ? 'at or below' : 'above'} plan` : ''}, and motivation ${c!.motivation}/5.`);
    const lagging = m.volume ? laggingGroups(m.volume, input.trainableGroups ?? []) : [];
    if (lagging.length) {
      const list = lagging.map((g) => `${GROUP_LABEL[g]} (${m.volume![g]} sets, aim ${GROUP_TARGET[g].min}+)`).join(' and ');
      reasons.push(`Under-trained last week: ${list}.`);
      reasons.push(
        `Push: +1 set on up to two ${lagging.length > 1 ? 'exercises for each of those muscles' : `${GROUP_LABEL[lagging[0]].toLowerCase()} exercises`}. Main lifts keep progressing as normal.`,
      );
      return finish({ kind: 'push', volumeMult: 1, rpeCap: null, pushGroups: lagging });
    }
    reasons.push('Push: every muscle is in its weekly range, so one extra set goes on accessory exercises. Main lifts keep progressing as normal.');
    return finish({ kind: 'push', volumeMult: 1, rpeCap: null, extraAccessorySet: true });
  }

  if (adh != null && adh < 0.6) {
    reasons.push(`You did ${m.completedSessions} of ${m.plannedSessions} sessions. No penalty: run the week as written and keep the streak going.`);
  } else {
    reasons.push(hr != null ? `${pct(hr)} of sets hit target with no warning signs. Keep going as written.` : 'No warning signs. Keep going as written.');
  }
  return finish({ kind: 'as_written', volumeMult: 1, rpeCap: null });
}

/** Working sets for a slot under a week plan (on top of the phase-adjusted count). Never below 1. */
export function setsUnderPlan(phaseSets: number, plan: Pick<WeekDecision, 'volumeMult' | 'extraAccessorySet' | 'pushSlotIds'> | null, isAccessory: boolean, slotId?: string): number {
  if (!plan) return phaseSets;
  const scaled = Math.max(1, Math.round(phaseSets * plan.volumeMult));
  if (plan.pushSlotIds?.length) return slotId && plan.pushSlotIds.includes(slotId) ? scaled + 1 : scaled;
  return plan.extraAccessorySet && isAccessory ? scaled + 1 : scaled;
}

/**
 * Choose which slots get the extra set for lagging muscles: up to `perGroup` per group
 * across the week, accessories first, then in program order.
 */
export function pickPushSlots(groups: MuscleGroup[], slots: { id: string; primaryMuscle: string; isAccessory: boolean }[], perGroup = 2): string[] {
  const out: string[] = [];
  for (const g of groups) {
    const mine = slots.filter((s) => groupOf(s.primaryMuscle) === g && !out.includes(s.id));
    const ordered = [...mine.filter((s) => s.isAccessory), ...mine.filter((s) => !s.isAccessory)];
    out.push(...ordered.slice(0, perGroup).map((s) => s.id));
  }
  return out;
}

/** Which exercises a joint region affects, from primary muscle and movement pattern. */
const REGION_MAP: Record<JointRegion, { muscles: string[]; patterns: string[] }> = {
  shoulder: { muscles: ['chest', 'front delts', 'side delts', 'rear delts'], patterns: ['push_v', 'push_h', 'pull_v'] },
  elbow: { muscles: ['biceps', 'brachialis', 'triceps', 'forearms'], patterns: [] },
  wrist: { muscles: ['forearms', 'biceps', 'triceps'], patterns: ['push_h'] },
  lower_back: { muscles: [], patterns: ['hinge', 'squat'] },
  hip: { muscles: ['glutes', 'adductors', 'abductors'], patterns: ['squat', 'hinge', 'lunge'] },
  knee: { muscles: ['quads'], patterns: ['squat', 'lunge'] },
};

export function regionAffects(region: JointRegion, exercise: { primaryMuscle: string; pattern: string }): boolean {
  const r = REGION_MAP[region];
  return r.muscles.includes(exercise.primaryMuscle) || r.patterns.includes(exercise.pattern);
}

/** Plain summary of what changes, for the plan card. */
export function changeSummary(d: WeekDecision): string[] {
  const out: string[] = [];
  if (d.kind === 'planned_deload') out.push('Deload as scheduled by the program');
  if (d.volumeMult !== 1) out.push(`${d.volumeMult < 1 ? '−' : '+'}${Math.round(Math.abs(1 - d.volumeMult) * 100)}% working sets`);
  if (d.pushGroups?.length) out.push(`+1 set on ${d.pushGroups.map((g) => GROUP_LABEL[g].toLowerCase()).join(' and ')} exercises`);
  else if (d.extraAccessorySet) out.push('+1 set on accessories');
  if (d.loadPct) out.push(`Loads at ${pct(d.loadPct)} of last week`);
  else if (d.noIncrease) out.push('No load increases');
  if (d.rpeCap != null) out.push(`RPE ${d.rpeCap} or less`);
  if (d.region) out.push(`${REGION_LABEL[d.region.region]}: ${d.region.loadPct ? `${pct(d.region.loadPct)} load, RPE ≤ ${d.region.rpeCap}` : 'no load increases'}`);
  if (!out.length) out.push('No changes');
  return out;
}
