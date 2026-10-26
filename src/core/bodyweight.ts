/** Body-weight trend maths. Pure functions over dated entries (kg), oldest first. */
import { addDays, parseIsoDate } from './dates';

export type WeightEntry = { date: string; kg: number };
export type TrendPoint = WeightEntry & { trendKg: number };

export const RANGES = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 91 },
  { id: '6m', label: '6M', days: 182 },
  { id: '1y', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: null },
] as const;
export type RangeId = (typeof RANGES)[number]['id'];

const DAY_MS = 86_400_000;

export function daysBetween(a: string, b: string): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / DAY_MS);
}

/** Entries on or after the start of the range ending `today`. */
export function inRange(entries: WeightEntry[], range: RangeId, today: string): WeightEntry[] {
  const r = RANGES.find((x) => x.id === range)!;
  if (r.days == null) return entries;
  const from = addDays(today, -r.days);
  return entries.filter((e) => e.date >= from && e.date <= today);
}

/**
 * Smoothed trend: the average of every weigh-in in the 7 days up to each entry.
 * Daily weight swings 1–2 kg with water and food; the trend shows the real direction.
 */
export function withTrend(entries: WeightEntry[], windowDays = 7): TrendPoint[] {
  return entries.map((e, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && daysBetween(entries[j].date, e.date) < windowDays; j--) {
      sum += entries[j].kg;
      n++;
    }
    return { ...e, trendKg: sum / n };
  });
}

export type WeightStats = {
  currentKg: number;
  startKg: number;
  changeKg: number;
  minKg: number;
  maxKg: number;
  /** Least-squares slope, kg per week; null with under 2 entries or a single day */
  perWeekKg: number | null;
  entries: number;
};

export function weightStats(entries: WeightEntry[]): WeightStats | null {
  if (!entries.length) return null;
  const first = entries[0];
  const last = entries[entries.length - 1];
  const kgs = entries.map((e) => e.kg);
  let perWeekKg: number | null = null;
  if (entries.length >= 2 && first.date !== last.date) {
    const xs = entries.map((e) => daysBetween(first.date, e.date));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = kgs.reduce((a, b) => a + b, 0) / kgs.length;
    let num = 0;
    let den = 0;
    xs.forEach((x, i) => {
      num += (x - mx) * (kgs[i] - my);
      den += (x - mx) ** 2;
    });
    perWeekKg = den ? (num / den) * 7 : null;
  }
  return { currentKg: last.kg, startKg: first.kg, changeKg: last.kg - first.kg, minKg: Math.min(...kgs), maxKg: Math.max(...kgs), perWeekKg, entries: entries.length };
}

/** "Nice" y-axis bounds and three gridline values around the data, at least `minSpan` wide. */
export function chartScale(values: number[], minSpan = 2): { min: number; max: number; ticks: number[] } {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const raw = (hi - lo) / 2;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(4)));
  return { min, max, ticks };
}
