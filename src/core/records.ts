/** Personal records and session totals. Pure functions. */
import { estimate1RM, type LoggedSet } from './overload';

export type DatedSet = LoggedSet & { date: string; sessionId: string };

export type PR =
  | { kind: 'e1rm'; valueKg: number; previousKg: number | null; set: DatedSet }
  | { kind: 'weight'; valueKg: number; previousKg: number | null; set: DatedSet }
  | { kind: 'reps_at_weight'; reps: number; weightKg: number; previousReps: number | null; set: DatedSet };

/** Total load moved: weight × reps over the given (working) sets. */
export function volumeKg(sets: LoggedSet[]): number {
  return sets.reduce((t, s) => t + s.weightKg * s.reps, 0);
}

/**
 * Records set in `current` compared with everything in `previous`.
 * Only meaningful for loaded exercises; bodyweight (0 kg) sets are ignored.
 */
export function findPRs(previous: DatedSet[], current: DatedSet[]): PR[] {
  const loadedPrev = previous.filter((s) => s.weightKg > 0 && s.reps > 0);
  const loadedCur = current.filter((s) => s.weightKg > 0 && s.reps > 0);
  if (!loadedCur.length) return [];
  const prs: PR[] = [];

  const bestPrevE1 = loadedPrev.length ? Math.max(...loadedPrev.map((s) => estimate1RM(s.weightKg, s.reps, s.rpe))) : null;
  const topE1 = loadedCur.reduce((a, b) => (estimate1RM(b.weightKg, b.reps, b.rpe) > estimate1RM(a.weightKg, a.reps, a.rpe) ? b : a));
  const topE1Val = estimate1RM(topE1.weightKg, topE1.reps, topE1.rpe);
  // Need some history before calling something a record
  if (bestPrevE1 != null && topE1Val > bestPrevE1 + 1e-9) prs.push({ kind: 'e1rm', valueKg: topE1Val, previousKg: bestPrevE1, set: topE1 });

  const heaviestPrev = loadedPrev.length ? Math.max(...loadedPrev.map((s) => s.weightKg)) : null;
  const heaviest = loadedCur.reduce((a, b) => (b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a));
  if (heaviestPrev != null && heaviest.weightKg > heaviestPrev) prs.push({ kind: 'weight', valueKg: heaviest.weightKg, previousKg: heaviestPrev, set: heaviest });

  // Rep records at a weight already lifted before (avoids duplicating the weight PR)
  const byWeight = new Map<number, DatedSet>();
  for (const s of loadedCur) if (!byWeight.has(s.weightKg) || s.reps > byWeight.get(s.weightKg)!.reps) byWeight.set(s.weightKg, s);
  for (const [w, s] of byWeight) {
    const prevAtW = loadedPrev.filter((p) => p.weightKg === w);
    if (!prevAtW.length) continue;
    const prevBest = Math.max(...prevAtW.map((p) => p.reps));
    if (s.reps > prevBest) prs.push({ kind: 'reps_at_weight', reps: s.reps, weightKg: w, previousReps: prevBest, set: s });
  }
  return prs;
}

export function describePR(pr: PR, fmt: (kg: number) => string): string {
  switch (pr.kind) {
    case 'e1rm':
      return `Best estimated 1RM: ${fmt(pr.valueKg)} (was ${fmt(pr.previousKg!)})`;
    case 'weight':
      return `Heaviest weight: ${fmt(pr.valueKg)} × ${pr.set.reps} (was ${fmt(pr.previousKg!)})`;
    case 'reps_at_weight':
      return `Most reps at ${fmt(pr.weightKg)}: ${pr.reps} (was ${pr.previousReps})`;
  }
}
