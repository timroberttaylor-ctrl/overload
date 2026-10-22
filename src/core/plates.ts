/** Barbell loading: which plates go on each side. Pure, in the display unit. */
import type { WeightUnit } from './units';

export const BAR = { kg: 20, lb: 45 } as const;
const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5, 0.25];
const LB_PLATES = [45, 35, 25, 10, 5, 2.5, 1.25];

/** Plates available per side: everything down to half the smallest jump you can make (two smallest plates). */
export function availablePlates(unit: WeightUnit, smallestJump: number): number[] {
  const smallest = smallestJump / 2;
  const all = unit === 'kg' ? KG_PLATES : LB_PLATES;
  const list = all.filter((p) => p >= smallest - 1e-9);
  return list.length ? list : [all[0]];
}

export type Loading = { bar: number; perSide: number[]; loaded: number; exact: boolean };

/**
 * Greedy plate loading for a target total (bar included). Greedy is optimal for standard
 * plate sets. Returns null when the target is lighter than the empty bar.
 */
export function loadBar(total: number, unit: WeightUnit, smallestJump: number, bar: number = BAR[unit]): Loading | null {
  if (!Number.isFinite(total) || total < bar - 1e-9) return null;
  let side = (total - bar) / 2;
  const perSide: number[] = [];
  for (const p of availablePlates(unit, smallestJump)) {
    while (side >= p - 1e-9) {
      perSide.push(p);
      side -= p;
    }
  }
  const loaded = bar + 2 * perSide.reduce((a, b) => a + b, 0);
  return { bar, perSide, loaded: Math.round(loaded * 100) / 100, exact: Math.abs(loaded - total) < 1e-6 };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** "20 kg bar + 20 · 5 · 1.25 per side", "Empty bar (20 kg)", or a note when it can't be loaded exactly. */
export function describeLoading(l: Loading, unit: WeightUnit): string {
  if (!l.perSide.length) return `Empty bar (${fmt(l.bar)} ${unit})`;
  const text = `${fmt(l.bar)} ${unit} bar + ${l.perSide.map(fmt).join(' · ')} per side`;
  return l.exact ? text : `${text} (= ${fmt(l.loaded)} ${unit})`;
}
