/**
 * Progressive overload engine: pure functions, no I/O.
 *
 * Given an exercise's prescription (rule, rep range, sets, RPE) and its recent
 * history, decide the next working weight and rep targets, with a plain-language
 * reason. Methods are standard public ones: linear progression, double
 * progression and RPE/e1RM-based loading.
 */
import { roundToIncrement } from './units';

export type RuleKind = 'linear' | 'double' | 'rpe' | 'none';

export type LoggedSet = { weightKg: number; reps: number; rpe?: number | null };

/** One past session of this exercise: completed working sets only, oldest → newest in the history array. */
export type SessionResult = { date: string; sets: LoggedSet[]; plannedSets: number };

export type Prescription = {
  rule: RuleKind;
  sets: number;
  repMin: number;
  repMax: number;
  targetRpe?: number | null;
  /** Load added on success, kg */
  incrementKg: number;
  /** Rounding step for calculated loads (plate pair / dumbbell jump), kg */
  roundStepKg: number;
  failsBeforeReset: number;
  /** Fraction of the current weight to drop back to after repeated failures */
  resetPct: number;
};

export type Adjustments = {
  /** Low readiness / pain: never increase load today */
  noIncrease?: boolean;
  /** Cap the effort target */
  rpeCap?: number | null;
  /** Deload or joint pain: use this fraction of last session's working weight */
  loadPct?: number | null;
  reason?: string;
};

export type TargetKind = 'first' | 'increase' | 'hold' | 'add_reps' | 'reset' | 'track' | 'estimate' | 'lighter';

export type Target = {
  /** null = no data yet, the lifter chooses */
  weightKg: number | null;
  /** Target reps for each working set */
  reps: number[];
  rpe: number | null;
  kind: TargetKind;
  reason: string;
  /** Consecutive unsuccessful sessions at the current weight (for display/debug) */
  fails: number;
  e1rmKg: number | null;
};

// ---------------------------------------------------------------------------
// Strength estimates
// ---------------------------------------------------------------------------

/** Reps in reserve implied by an RPE (10 = nothing left). */
const rir = (rpe: number | null | undefined) => (rpe == null ? 0 : Math.max(0, 10 - rpe));

/**
 * Estimated one-rep max (Epley), counting reps left in reserve as reps you could have done.
 * When RPE is unknown we assume the set was taken close to failure (conservative).
 */
export function estimate1RM(weightKg: number, reps: number, rpe?: number | null): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  const effective = reps + rir(rpe);
  if (effective <= 1) return weightKg;
  return weightKg * (1 + effective / 30);
}

/** Fraction of 1RM that allows `reps` reps at `rpe` (inverse of the estimate above). */
export function pctOf1RM(reps: number, rpe: number): number {
  const effective = reps + rir(rpe);
  if (effective <= 1) return 1;
  return 1 / (1 + effective / 30);
}

export function bestE1RM(sets: LoggedSet[], assumedRpe?: number | null): number {
  return sets.reduce((m, s) => Math.max(m, estimate1RM(s.weightKg, s.reps, s.rpe ?? assumedRpe)), 0);
}

/** The working weight used in a session: the most common weight across its sets (ties → heavier). */
export function sessionWeight(sets: LoggedSet[]): number | null {
  if (!sets.length) return null;
  const counts = new Map<number, number>();
  for (const s of sets) counts.set(s.weightKg, (counts.get(s.weightKg) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

const fmt = (kg: number) => `${Number(kg.toFixed(2))} kg`;
const repsText = (sets: LoggedSet[]) => sets.map((s) => s.reps).join(', ');

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Session evaluation
// ---------------------------------------------------------------------------

type Verdict = 'success' | 'progress' | 'fail';

function evaluate(p: Prescription, s: SessionResult, prev?: SessionResult): Verdict {
  const sets = s.sets;
  const allDone = sets.length >= s.plannedSets;
  const rpeOk = (x: LoggedSet) => p.targetRpe == null || x.rpe == null || x.rpe <= p.targetRpe + 1;
  if (p.rule === 'linear') {
    return allDone && sets.every((x) => x.reps >= p.repMin && rpeOk(x)) ? 'success' : 'fail';
  }
  // double progression
  if (allDone && sets.every((x) => x.reps >= p.repMax && rpeOk(x))) return 'success';
  if (sets.some((x) => x.reps < p.repMin) || !allDone) return 'fail';
  // inside the range: did total reps improve at the same weight?
  if (prev && sessionWeight(prev.sets) === sessionWeight(sets)) {
    const total = (r: SessionResult) => r.sets.reduce((t, x) => t + x.reps, 0);
    return total(s) > total(prev) ? 'progress' : 'fail';
  }
  return 'progress';
}

/** Date of the most recent session that used a heavier weight than the one before it. */
function lastIncreaseDate(history: SessionResult[]): string | null {
  for (let i = history.length - 1; i > 0; i--) {
    const w = sessionWeight(history[i].sets);
    const before = sessionWeight(history[i - 1].sets);
    if (w != null && before != null && w > before) return history[i].date;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function nextTarget(args: {
  prescription: Prescription;
  /** This slot's history, oldest first. Sessions with no completed sets are ignored. */
  history: SessionResult[];
  today: string;
  /** e1RM from this exercise logged elsewhere, used when this slot has no history */
  fallbackE1RM?: number | null;
  adjust?: Adjustments;
}): Target {
  const p = args.prescription;
  const history = args.history.filter((h) => h.sets.length > 0);
  const adjust = args.adjust ?? {};
  const rpeTarget = p.targetRpe != null && adjust.rpeCap != null ? Math.min(p.targetRpe, adjust.rpeCap) : (p.targetRpe ?? adjust.rpeCap ?? null);
  const flat = (r: number) => Array.from({ length: p.sets }, () => r);
  const last = history[history.length - 1];
  const lastE1RM = last ? bestE1RM(last.sets, p.targetRpe) : null;

  const result = (t: Omit<Target, 'rpe' | 'e1rmKg'> & { e1rmKg?: number | null }): Target =>
    applyAdjust({ ...t, rpe: rpeTarget, e1rmKg: t.e1rmKg ?? lastE1RM ?? args.fallbackE1RM ?? null }, last, adjust, p.roundStepKg);

  // ---- No history for this slot
  if (!last) {
    const e1 = args.fallbackE1RM;
    if (e1 && p.rule !== 'none') {
      const w = roundToIncrement(e1 * pctOf1RM(p.repMax, rpeTarget ?? 8), p.roundStepKg, 'down');
      return result({
        weightKg: w,
        reps: flat(p.rule === 'linear' ? p.repMin : p.repMax),
        kind: 'estimate',
        reason: `Estimated from your other ${fmt(e1)} e1RM; adjust if it feels off.`,
        fails: 0,
        e1rmKg: e1,
      });
    }
    return result({
      weightKg: null,
      reps: flat(p.rule === 'linear' ? p.repMin : p.repMax),
      kind: 'first',
      reason: `First time: pick a weight you could lift for about ${p.repMax + 2} reps, so ${p.repMin === p.repMax ? p.repMin : `${p.repMin}–${p.repMax}`} reps leaves 1–3 in reserve.`,
      fails: 0,
    });
  }

  const w = sessionWeight(last.sets)!;

  // ---- Tracking only
  if (p.rule === 'none') {
    return result({ weightKg: w, reps: last.sets.map((s) => s.reps).concat(flat(0)).slice(0, p.sets).map((r) => r || p.repMin), kind: 'track', reason: 'Tracked only: beat last time if you can.', fails: 0 });
  }

  // ---- RPE / e1RM based
  if (p.rule === 'rpe') {
    const e1 = lastE1RM!;
    const targetRpe = rpeTarget ?? 8;
    let next = roundToIncrement(e1 * pctOf1RM(p.repMin, targetRpe), p.roundStepKg, 'nearest');
    const capUp = w * 1.075;
    const capDown = w * 0.9;
    // At light loads 7.5 % is less than one plate step (e.g. 30 kg × 7.5 % = 2.25 kg < 2.5 kg), which
    // would freeze the lift for ever; always allow one step up when the e1RM says heavier.
    const upper = Math.max(roundToIncrement(capUp, p.roundStepKg, 'down'), next > w ? w + p.roundStepKg : w);
    next = Math.min(Math.max(next, roundToIncrement(capDown, p.roundStepKg, 'up')), upper);
    const recent = lastIncreaseDate(history);
    if (next > w && recent && daysBetween(recent, args.today) < 7) {
      return result({ weightKg: w, reps: flat(p.repMin), kind: 'hold', reason: `Held at ${fmt(w)}: load already went up this week.`, fails: 0, e1rmKg: e1 });
    }
    const kind: TargetKind = next > w ? 'increase' : next < w ? 'reset' : 'hold';
    return result({
      weightKg: next,
      reps: flat(p.repMin),
      kind,
      reason: `Your best set estimates ${fmt(e1)} e1RM → ${fmt(next)} for ${p.repMin}+ reps at RPE ${targetRpe}.`,
      fails: 0,
      e1rmKg: e1,
    });
  }

  // ---- Linear and double progression
  // Count consecutive unsuccessful sessions at the current weight, newest first.
  const verdictAt = (i: number): Verdict => {
    const prev = i > 0 && sessionWeight(history[i - 1].sets) === sessionWeight(history[i].sets) ? history[i - 1] : undefined;
    return evaluate(p, history[i], prev);
  };
  let fails = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (sessionWeight(history[i].sets) !== w || verdictAt(i) !== 'fail') break;
    fails++;
  }
  const verdict = verdictAt(history.length - 1);

  if (verdict === 'success') {
    const recent = lastIncreaseDate(history);
    if (p.rule === 'double' && recent && daysBetween(recent, args.today) < 7) {
      return result({ weightKg: w, reps: flat(p.repMax), kind: 'hold', reason: `Top of the range hit, but load already went up this week; repeat ${fmt(w)}.`, fails: 0 });
    }
    if (p.incrementKg <= 0) {
      return result({
        weightKg: w,
        reps: flat(p.repMax),
        kind: 'hold',
        reason: `Top of the range on every set: make it harder (add load, slow the lowering, or pause at the hardest point).`,
        fails: 0,
      });
    }
    const next = Number((w + p.incrementKg).toFixed(3));
    return result({
      weightKg: next,
      reps: flat(p.repMin),
      kind: 'increase',
      reason:
        p.rule === 'linear'
          ? `+${fmt(p.incrementKg)}: all ${last.sets.length} sets of ${p.repMin} done last time.`
          : `+${fmt(p.incrementKg)}: you reached ${p.repMax} reps on every set (${repsText(last.sets)}). Start back at ${p.repMin}.`,
      fails: 0,
    });
  }

  if (fails >= p.failsBeforeReset) {
    const next = roundToIncrement(w * p.resetPct, p.roundStepKg, 'down');
    return result({
      weightKg: next,
      reps: flat(p.repMin),
      kind: 'reset',
      reason: `Stalled ${fails} sessions at ${fmt(w)}, so drop to ${fmt(next)} (${Math.round(p.resetPct * 100)}%) and build back up.`,
      fails,
    });
  }

  if (p.rule === 'linear') {
    return result({
      weightKg: w,
      reps: flat(p.repMin),
      kind: 'hold',
      reason: `Repeat ${fmt(w)}: last time was ${repsText(last.sets)}${fails > 1 ? ` (miss ${fails} of ${p.failsBeforeReset} before a reset)` : ''}.`,
      fails,
    });
  }

  // double progression, inside the range: add a rep to the weakest set(s)
  const lastReps = Array.from({ length: p.sets }, (_, i) => last.sets[i]?.reps ?? p.repMin);
  const minReps = Math.min(...lastReps);
  const idx = lastReps.indexOf(minReps);
  const reps = lastReps.map((r, i) => Math.min(p.repMax, Math.max(p.repMin, i === idx ? r + 1 : r)));
  return result({
    weightKg: w,
    reps,
    kind: 'add_reps',
    reason: `Same ${fmt(w)}; aim for one more rep on your weakest set (last: ${repsText(last.sets)}). Add load once every set reaches ${p.repMax}.`,
    fails,
  });
}

function applyAdjust(t: Target, last: SessionResult | undefined, adjust: Adjustments, stepKg: number): Target {
  if (t.weightKg == null || !last) return t;
  const w = sessionWeight(last.sets);
  if (w == null) return t;
  if (adjust.loadPct != null && adjust.loadPct > 0 && adjust.loadPct < 1) {
    const lighter = Math.max(0, roundToIncrement(w * adjust.loadPct, stepKg, 'down'));
    if (lighter < t.weightKg) {
      return { ...t, weightKg: lighter, kind: 'lighter', reason: `${adjust.reason ?? 'Lighter week'}: ${fmt(lighter)} (${Math.round(adjust.loadPct * 100)}% of last time's ${fmt(w)}).` };
    }
  }
  if (!adjust.noIncrease || t.weightKg <= w) return t;
  return { ...t, weightKg: w, kind: 'hold', reason: `${adjust.reason ?? 'Recovery is low today'}, so stay at ${fmt(w)} instead of increasing.` };
}

// ---------------------------------------------------------------------------
// Warm-ups
// ---------------------------------------------------------------------------

/**
 * Ramp-up sets toward the working weight. Barbell lifts never go below the empty bar.
 * Returns heaviest last.
 */
export function warmupSets(workingKg: number | null, count: number, opts: { stepKg: number; barKg?: number }): LoggedSet[] {
  if (!workingKg || count <= 0) return [];
  const plan = [
    { pct: 0.4, reps: 8 },
    { pct: 0.55, reps: 5 },
    { pct: 0.7, reps: 3 },
    { pct: 0.85, reps: 2 },
  ].slice(-count);
  const bar = opts.barKg ?? 0;
  const out: LoggedSet[] = [];
  for (const s of plan) {
    const w = Math.max(bar, roundToIncrement(workingKg * s.pct, opts.stepKg, 'down'));
    if (w >= workingKg) continue;
    if (out.length && out[out.length - 1].weightKg >= w) continue;
    out.push({ weightKg: w, reps: s.reps });
  }
  return out;
}
