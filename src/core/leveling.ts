/**
 * Level Up mode: an optional RPG-style layer over the training log.
 *
 * Everything here is derived from workouts already logged. Nothing is stored, so
 * turning the mode on shows your level straight away (including all past training),
 * turning it off changes nothing, and a backup restore recalculates it exactly.
 *
 * Pure functions: (sessions, today) -> profile. Same input, same output.
 */
import { addDays, weekStart } from './dates';
import { estimate1RM } from './overload';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One completed working (non-warm-up) set. Bodyweight sets have weightKg 0. */
export type LevelSet = { exerciseId: string; weightKg: number; reps: number; rpe?: number | null; isCompound: boolean };

export type LevelSession = {
  id: string;
  name: string;
  date: string;
  startedAt: number;
  status: 'completed' | 'partial';
  sets: LevelSet[];
};

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/**
 * XP awards. Tuned so a typical first workout reaches level 2, a year of ~5 workouts
 * a week lands in the 40s (B-Rank), and S-Rank takes a few years of steady training.
 */
export const XP = {
  /** Every planned working set logged */
  completed: 100,
  /** Some planned sets skipped; still showed up */
  partial: 60,
  perSet: 8,
  /** Per 1,000 kg moved in the session */
  perTonne: 10,
  tonneCap: 150,
  /** Per exercise with a new best estimated 1RM */
  pr: 40,
  prCap: 5,
  /** Awarded on the 3rd workout in a Monday–Sunday week */
  weekClear: 150,
  weekClearSessions: 3,
} as const;

/** A week counts toward the streak with this many workouts. Rest weeks only break the streak, never cost XP. */
export const STREAK_SESSIONS = 2;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 200 + 80 * level;
}

/** Total XP needed to reach `level` from level 1. */
export function xpForLevel(level: number): number {
  const n = Math.max(0, level - 1);
  return 40 * n * (n + 1) + 200 * n;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export type RankId = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type Rank = { id: RankId; name: string; minLevel: number };

export const RANKS: Rank[] = [
  { id: 'E', name: 'E-Rank', minLevel: 1 },
  { id: 'D', name: 'D-Rank', minLevel: 10 },
  { id: 'C', name: 'C-Rank', minLevel: 20 },
  { id: 'B', name: 'B-Rank', minLevel: 35 },
  { id: 'A', name: 'A-Rank', minLevel: 50 },
  { id: 'S', name: 'S-Rank', minLevel: 70 },
];

export function rankForLevel(level: number): Rank {
  let r = RANKS[0];
  for (const x of RANKS) if (level >= x.minLevel) r = x;
  return r;
}

/** Rough EXP for finishing a planned workout: completion, its working sets and, if due, the weekly quest. Volume and records come on top. */
export function questReward(workingSets: number, weekSessions: number): number {
  return XP.completed + workingSets * XP.perSet + (weekSessions + 1 === XP.weekClearSessions ? XP.weekClear : 0);
}

export function nextRank(rank: Rank): Rank | null {
  const i = RANKS.findIndex((r) => r.id === rank.id);
  return RANKS[i + 1] ?? null;
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

type Totals = { sessions: number; prs: number; volumeKg: number; bestStreak: number; level: number };

type TitleDef = { id: string; name: string; description: string; goal: number; value: (t: Totals) => number };

export const TITLES: TitleDef[] = [
  { id: 'first_session', name: 'Initiate', description: 'Finish your first workout', goal: 1, value: (t) => t.sessions },
  { id: 'first_pr', name: 'Record Breaker', description: 'Set your first personal record', goal: 1, value: (t) => t.prs },
  { id: 'streak_4', name: 'Unbroken', description: `Train ${STREAK_SESSIONS}+ times a week for 4 weeks in a row`, goal: 4, value: (t) => t.bestStreak },
  { id: 'sessions_25', name: 'Regular', description: 'Finish 25 workouts', goal: 25, value: (t) => t.sessions },
  { id: 'tonnes_100', name: 'Hundred-Tonne Club', description: 'Move 100,000 kg in total', goal: 100_000, value: (t) => t.volumeKg },
  { id: 'prs_25', name: 'Limit Breaker', description: 'Set 25 personal records', goal: 25, value: (t) => t.prs },
  { id: 'sessions_100', name: 'Centurion', description: 'Finish 100 workouts', goal: 100, value: (t) => t.sessions },
  { id: 'streak_12', name: 'Relentless', description: `Train ${STREAK_SESSIONS}+ times a week for 12 weeks in a row`, goal: 12, value: (t) => t.bestStreak },
  { id: 'rank_a', name: 'Vanguard', description: 'Reach A-Rank (level 50)', goal: 50, value: (t) => t.level },
  { id: 'tonnes_1000', name: 'Mountain Mover', description: 'Move 1,000,000 kg in total', goal: 1_000_000, value: (t) => t.volumeKg },
  { id: 'sessions_365', name: 'Year of Iron', description: 'Finish 365 workouts', goal: 365, value: (t) => t.sessions },
  { id: 'rank_s', name: 'Apex', description: 'Reach S-Rank (level 70)', goal: 70, value: (t) => t.level },
];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type XpPart = { label: string; xp: number };

export type SessionXp = {
  sessionId: string;
  name: string;
  date: string;
  xp: number;
  parts: XpPart[];
  levelBefore: number;
  levelAfter: number;
  rankBefore: RankId;
  rankAfter: RankId;
  /** Titles unlocked by this workout */
  titles: string[];
};

export type StatKey = 'STR' | 'END' | 'DIS' | 'CON';
export type Stat = { key: StatKey; label: string; value: number; hint: string };

export type Title = { id: string; name: string; description: string; unlocked: boolean; unlockedOn: string | null; progress: number };

export type LevelProfile = {
  totalXp: number;
  level: number;
  rank: Rank;
  next: Rank | null;
  xpIntoLevel: number;
  xpForNext: number;
  /** 0–1 through the current level */
  progress: number;
  stats: Stat[];
  sessions: number;
  prs: number;
  volumeKg: number;
  trainingDays: number;
  weekStreak: number;
  bestWeekStreak: number;
  /** Workouts so far this Monday–Sunday week (weekly quest progress) */
  weekSessions: number;
  titles: Title[];
  /** Most recently unlocked title */
  activeTitle: string | null;
  /** Newest first */
  log: SessionXp[];
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function sessionVolume(sets: LevelSet[]): number {
  return sets.reduce((t, s) => t + Math.max(0, s.weightKg) * Math.max(0, s.reps), 0);
}

/** Consecutive streak weeks ending this week (or last week, if this week isn't done yet). */
function streaks(weekCounts: Map<string, number>, today: string): { current: number; best: number } {
  const weeks = [...weekCounts.keys()].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of weeks) {
    if ((weekCounts.get(w) ?? 0) < STREAK_SESSIONS) {
      run = 0;
      prev = w;
      continue;
    }
    run = prev && addDays(prev, 7) === w && run > 0 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  const thisWeek = weekStart(today);
  let current = 0;
  let w = (weekCounts.get(thisWeek) ?? 0) >= STREAK_SESSIONS ? thisWeek : addDays(thisWeek, -7);
  while ((weekCounts.get(w) ?? 0) >= STREAK_SESSIONS) {
    current++;
    w = addDays(w, -7);
  }
  return { current, best };
}

function bestStreakSoFar(weekCounts: Map<string, number>): number {
  // Small maps (one entry per trained week), so recomputing is cheap.
  return streaks(weekCounts, '1970-01-05').best;
}

export function buildLevelProfile(input: LevelSession[], today: string): LevelProfile {
  const ordered = [...input].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  const bestE1 = new Map<string, number>();
  const weekCounts = new Map<string, number>();
  const days = new Set<string>();
  const unlocked = new Map<string, string>();
  const log: SessionXp[] = [];

  let xp = 0;
  let prs = 0;
  let volume = 0;
  let heavySets = 0;
  let reps = 0;
  let weeksCleared = 0;

  for (const s of ordered) {
    const parts: XpPart[] = [];
    parts.push({ label: s.status === 'completed' ? 'Workout complete' : 'Workout (partial)', xp: s.status === 'completed' ? XP.completed : XP.partial });
    if (s.sets.length) parts.push({ label: `${s.sets.length} working set${s.sets.length === 1 ? '' : 's'}`, xp: s.sets.length * XP.perSet });

    const vol = sessionVolume(s.sets);
    const tonneXp = Math.min(XP.tonneCap, Math.floor(vol / 1000) * XP.perTonne);
    if (tonneXp > 0) parts.push({ label: `${(vol / 1000).toFixed(1)} t moved`, xp: tonneXp });

    // Records: best estimated 1RM per exercise this session versus all earlier sessions.
    const sessionBest = new Map<string, number>();
    for (const x of s.sets) {
      if (x.weightKg <= 0 || x.reps <= 0) continue;
      const e = estimate1RM(x.weightKg, x.reps, x.rpe);
      if (e > (sessionBest.get(x.exerciseId) ?? 0)) sessionBest.set(x.exerciseId, e);
    }
    let sessionPrs = 0;
    for (const [ex, e] of sessionBest) {
      const before = bestE1.get(ex);
      if (before != null && e > before + 1e-9) sessionPrs++;
      if (before == null || e > before) bestE1.set(ex, e);
    }
    if (sessionPrs) parts.push({ label: `${sessionPrs} personal record${sessionPrs === 1 ? '' : 's'}`, xp: Math.min(sessionPrs, XP.prCap) * XP.pr });

    const wk = weekStart(s.date);
    const inWeek = (weekCounts.get(wk) ?? 0) + 1;
    weekCounts.set(wk, inWeek);
    if (inWeek === XP.weekClearSessions) {
      weeksCleared++;
      parts.push({ label: `Weekly quest: ${XP.weekClearSessions} workouts this week`, xp: XP.weekClear });
    }

    const gained = parts.reduce((t, p) => t + p.xp, 0);
    const levelBefore = levelForXp(xp);
    xp += gained;
    const levelAfter = levelForXp(xp);

    prs += sessionPrs;
    volume += vol;
    days.add(s.date);
    for (const x of s.sets) {
      reps += Math.max(0, x.reps);
      if (x.isCompound && x.reps > 0 && x.reps <= 6 && x.weightKg > 0) heavySets++;
    }

    const totals: Totals = { sessions: log.length + 1, prs, volumeKg: volume, bestStreak: bestStreakSoFar(weekCounts), level: levelAfter };
    const newTitles: string[] = [];
    for (const t of TITLES) {
      if (!unlocked.has(t.id) && t.value(totals) >= t.goal) {
        unlocked.set(t.id, s.date);
        newTitles.push(t.name);
      }
    }

    log.push({
      sessionId: s.id,
      name: s.name,
      date: s.date,
      xp: gained,
      parts,
      levelBefore,
      levelAfter,
      rankBefore: rankForLevel(levelBefore).id,
      rankAfter: rankForLevel(levelAfter).id,
      titles: newTitles,
    });
  }

  const level = levelForXp(xp);
  const rank = rankForLevel(level);
  const { current, best } = streaks(weekCounts, today);
  const totals: Totals = { sessions: ordered.length, prs, volumeKg: volume, bestStreak: best, level };
  const into = xp - xpForLevel(level);
  const need = xpToNext(level);

  const titles: Title[] = TITLES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    unlocked: unlocked.has(t.id),
    unlockedOn: unlocked.get(t.id) ?? null,
    progress: Math.max(0, Math.min(1, t.value(totals) / t.goal)),
  }));
  // Latest unlock wins; ties go to the harder title (later in the list).
  let active: string | null = null;
  let activeOn = '';
  for (const t of titles) {
    if (t.unlockedOn && t.unlockedOn >= activeOn) {
      active = t.name;
      activeOn = t.unlockedOn;
    }
  }

  return {
    totalXp: xp,
    level,
    rank,
    next: nextRank(rank),
    xpIntoLevel: into,
    xpForNext: need,
    progress: need ? into / need : 0,
    stats: [
      { key: 'STR', label: 'Strength', value: 10 + Math.floor(heavySets / 8) + prs, hint: 'Heavy compound sets (6 reps or fewer) and personal records' },
      { key: 'END', label: 'Endurance', value: 10 + Math.floor(reps / 300), hint: 'Total working reps' },
      { key: 'DIS', label: 'Discipline', value: 10 + days.size, hint: 'Days you trained' },
      { key: 'CON', label: 'Consistency', value: 10 + 3 * weeksCleared, hint: `Weeks with ${XP.weekClearSessions}+ workouts` },
    ],
    sessions: ordered.length,
    prs,
    volumeKg: volume,
    trainingDays: days.size,
    weekStreak: current,
    bestWeekStreak: best,
    weekSessions: weekCounts.get(weekStart(today)) ?? 0,
    titles,
    activeTitle: active,
    log: log.reverse(),
  };
}
