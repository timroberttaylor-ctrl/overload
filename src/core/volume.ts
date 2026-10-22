/**
 * Weekly training volume per muscle group: hard working sets, with a set counting
 * fully for the exercise's main muscle and half for each secondary muscle.
 *
 * The target ranges are a common, broadly evidence-based guide for building muscle
 * (roughly 10–20 hard sets per muscle per week, less for small or indirectly trained
 * muscles). They are hints, not rules.
 */

export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
};

/** Weekly set range per group: below `min` is flagged as under-trained, above `max` as high. */
export const GROUP_TARGET: Record<MuscleGroup, { min: number; max: number }> = {
  chest: { min: 10, max: 20 },
  back: { min: 10, max: 20 },
  shoulders: { min: 8, max: 18 },
  biceps: { min: 6, max: 16 },
  triceps: { min: 6, max: 16 },
  quads: { min: 10, max: 20 },
  hamstrings: { min: 8, max: 16 },
  glutes: { min: 8, max: 18 },
  calves: { min: 6, max: 14 },
  core: { min: 4, max: 14 },
};

const MUSCLE_TO_GROUP: Record<string, MuscleGroup> = {
  chest: 'chest',
  lats: 'back',
  'upper back': 'back',
  traps: 'back',
  'front delts': 'shoulders',
  'side delts': 'shoulders',
  'rear delts': 'shoulders',
  biceps: 'biceps',
  brachialis: 'biceps',
  triceps: 'triceps',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  abs: 'core',
  obliques: 'core',
  core: 'core',
};

export function groupOf(muscle: string): MuscleGroup | null {
  return MUSCLE_TO_GROUP[muscle] ?? null;
}

export type VolumeSet = { primaryMuscle: string; secondaryMuscles: string[]; sets: number };

export type Volume = Record<MuscleGroup, number>;

export function emptyVolume(): Volume {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Volume;
}

/** Sum sets per group. A muscle shared by primary and secondary only counts once (as primary). */
export function weeklyVolume(items: VolumeSet[]): Volume {
  const v = emptyVolume();
  for (const it of items) {
    const primary = groupOf(it.primaryMuscle);
    if (primary) v[primary] += it.sets;
    const seen = new Set<MuscleGroup>(primary ? [primary] : []);
    for (const m of it.secondaryMuscles) {
      const g = groupOf(m);
      if (g && !seen.has(g)) {
        v[g] += it.sets * 0.5;
        seen.add(g);
      }
    }
  }
  for (const g of MUSCLE_GROUPS) v[g] = Math.round(v[g] * 2) / 2;
  return v;
}

export type GroupStatus = 'low' | 'ok' | 'high' | 'none';

export function groupStatus(g: MuscleGroup, sets: number): GroupStatus {
  if (sets <= 0) return 'none';
  const t = GROUP_TARGET[g];
  return sets < t.min ? 'low' : sets > t.max ? 'high' : 'ok';
}

/**
 * Muscles that got the fewest sets relative to their minimum last week, among the
 * ones the coming week actually trains (so extra sets can go somewhere). Up to `limit`.
 */
export function laggingGroups(done: Volume, trainable: MuscleGroup[], limit = 2): MuscleGroup[] {
  return trainable
    .filter((g) => done[g] < GROUP_TARGET[g].min)
    .sort((a, b) => done[a] / GROUP_TARGET[a].min - done[b] / GROUP_TARGET[b].min || GROUP_TARGET[b].min - GROUP_TARGET[a].min)
    .slice(0, limit);
}

/** A short hint for the volume card. */
export function volumeHint(g: MuscleGroup, sets: number): string | null {
  const t = GROUP_TARGET[g];
  const s = groupStatus(g, sets);
  if (s === 'low') return `${GROUP_LABEL[g]}: ${sets} sets, below the ${t.min}–${t.max} a week that usually builds muscle.`;
  if (s === 'high') return `${GROUP_LABEL[g]}: ${sets} sets, above ${t.max}. Fine if you're recovering well; trim if it's dragging.`;
  return null;
}
