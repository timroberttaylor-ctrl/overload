/**
 * Colour coding: superset groups, set types and effort, program phases, weekly plan
 * decisions and muscle groups. Every code has a solid colour (bars, rails, filled chips),
 * a readable text colour and a soft tint for backgrounds, tuned for both themes.
 */
import type { PlanKind } from '@/core/planner';
import { groupOf, type MuscleGroup } from '@/core/volume';

export type Code = { solid: string; text: string; tint: string };
export type SchemeName = 'dark' | 'light';

const code = (scheme: SchemeName, solid: string, darkText: string, lightSolid: string): Code =>
  scheme === 'dark' ? { solid, text: darkText, tint: solid + '26' } : { solid: lightSolid, text: lightSolid, tint: lightSolid + '1F' };

const HUES = {
  green: (s: SchemeName) => code(s, '#2EE07A', '#2EE07A', '#12A150'),
  violet: (s: SchemeName) => code(s, '#A78BFA', '#C4B5FD', '#7C3AED'),
  sky: (s: SchemeName) => code(s, '#38BDF8', '#7DD3FC', '#0284C7'),
  amber: (s: SchemeName) => code(s, '#F59E0B', '#FCD34D', '#B45309'),
  gold: (s: SchemeName) => code(s, '#F5C451', '#F5C451', '#B7791F'),
  pink: (s: SchemeName) => code(s, '#F472B6', '#F9A8D4', '#DB2777'),
  fuchsia: (s: SchemeName) => code(s, '#E879F9', '#F0ABFC', '#C026D3'),
  teal: (s: SchemeName) => code(s, '#2DD4BF', '#5EEAD4', '#0D9488'),
  orange: (s: SchemeName) => code(s, '#FB923C', '#FDBA74', '#EA580C'),
  yellow: (s: SchemeName) => code(s, '#FACC15', '#FDE68A', '#A16207'),
  rose: (s: SchemeName) => code(s, '#FB7185', '#FB7185', '#E11D48'),
  blue: (s: SchemeName) => code(s, '#60A5FA', '#93C5FD', '#2563EB'),
  slate: (s: SchemeName) => code(s, '#94A3B8', '#CBD5E1', '#64748B'),
  neutral: (s: SchemeName) => (s === 'dark' ? { solid: '#8E9993', text: '#C9D2CD', tint: '#1F2522' } : { solid: '#5E6A64', text: '#5E6A64', tint: '#E6EBE8' }),
};

/** Superset series letters, in order: A violet, B sky, C amber, D pink, E teal, F orange, then repeat. */
const SERIES_ORDER = ['violet', 'sky', 'amber', 'pink', 'teal', 'orange'] as const;

export function seriesCode(series: string | null | undefined, scheme: SchemeName): Code {
  const letter = (series ?? 'A').trim().toUpperCase().charCodeAt(0);
  const i = Number.isFinite(letter) && letter >= 65 && letter <= 90 ? letter - 65 : 0;
  return HUES[SERIES_ORDER[i % SERIES_ORDER.length]](scheme);
}

/** "Superset" for two exercises, "Triset" for three, "Giant set" for four or more. */
export function groupName(size: number): string | null {
  return size >= 4 ? 'Giant set' : size === 3 ? 'Triset' : size === 2 ? 'Superset' : null;
}

/** Labels for exercises in series order: lone letters stay "B"; shared letters become "A1", "A2". */
export function seriesLabels(series: (string | null | undefined)[]): string[] {
  const count = new Map<string, number>();
  for (const s of series) if (s) count.set(s, (count.get(s) ?? 0) + 1);
  const seen = new Map<string, number>();
  return series.map((s) => {
    if (!s) return '';
    if ((count.get(s) ?? 0) < 2) return s;
    const n = (seen.get(s) ?? 0) + 1;
    seen.set(s, n);
    return `${s}${n}`;
  });
}

export type EffortBand = 'easy' | 'hard' | 'max';

/** RPE under 8 is comfortable, 8–8.5 hard, 9–10 at or near failure. */
export function effortBand(rpe: number | null | undefined): EffortBand | null {
  if (rpe == null || !Number.isFinite(rpe) || rpe <= 0) return null;
  return rpe < 8 ? 'easy' : rpe < 9 ? 'hard' : 'max';
}

export function effortCode(band: EffortBand, scheme: SchemeName): Code {
  return band === 'easy' ? HUES.teal(scheme) : band === 'hard' ? HUES.gold(scheme) : HUES.rose(scheme);
}

export const EFFORT_LABEL: Record<EffortBand, string> = { easy: 'RPE under 8', hard: 'RPE 8–8.5', max: 'RPE 9–10' };

export type SetKind = 'warmup' | 'working' | 'pr' | 'failure';

export function setCode(kind: SetKind, scheme: SchemeName): Code {
  return kind === 'pr' ? HUES.gold(scheme) : kind === 'failure' ? HUES.rose(scheme) : kind === 'warmup' ? HUES.neutral(scheme) : HUES.green(scheme);
}

export type PhaseKind = 'accumulation' | 'intensification' | 'realisation' | 'deload';

export const PHASE_LABEL: Record<PhaseKind, string> = { accumulation: 'Build', intensification: 'Intensify', realisation: 'Peak', deload: 'Deload' };

export function phaseCode(kind: string, scheme: SchemeName): Code {
  return kind === 'intensification' ? HUES.gold(scheme) : kind === 'realisation' ? HUES.rose(scheme) : kind === 'deload' ? HUES.blue(scheme) : HUES.green(scheme);
}

export function planCode(kind: PlanKind, scheme: SchemeName): Code {
  return kind === 'push' ? HUES.green(scheme) : kind === 'reduce' ? HUES.gold(scheme) : kind === 'deload' || kind === 'planned_deload' ? HUES.blue(scheme) : HUES.neutral(scheme);
}

const MUSCLE_HUE: Record<MuscleGroup, keyof typeof HUES> = {
  chest: 'orange',
  back: 'sky',
  shoulders: 'violet',
  biceps: 'pink',
  triceps: 'fuchsia',
  quads: 'teal',
  hamstrings: 'yellow',
  glutes: 'yellow',
  calves: 'slate',
  core: 'slate',
};

/** Colour for a muscle group, or for a muscle name such as "lats" or "front delts". */
export function muscleCode(muscle: string, scheme: SchemeName): Code {
  const g = (MUSCLE_HUE as Record<string, keyof typeof HUES>)[muscle] ? (muscle as MuscleGroup) : groupOf(muscle);
  return HUES[g ? MUSCLE_HUE[g] : 'neutral'](scheme);
}
