/**
 * Per-set rep schemes: "12/10/8/8" pyramids, "30/20/15/30" drop patterns and sets taken to
 * failure ("F"). A program slot can hold several schemes that rotate week by week, e.g. a
 * 3-week wave: [[10,10,10,10],[12,10,8,8],[8,6,6,10]].
 */

/** Target reps for one set, or "F" for as many as possible (to failure). */
export type RepEntry = number | 'F';
export type RepScheme = RepEntry[][];

const MAX_SETS = 10;
const MAX_WEEKS = 8;

/**
 * Parse builder text. Sets are separated by commas, weeks by "|", e.g.
 * "10,10,10,10 | 12,10,8,8 | 8,6,6,10" or "20,20,20,20,F". Empty text means no scheme.
 */
export function parseScheme(text: string): RepScheme | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const weeks = trimmed.split('|').map((w) => w.trim());
  if (weeks.length > MAX_WEEKS) throw new Error(`At most ${MAX_WEEKS} weekly schemes`);
  return weeks.map((w, wi) => {
    const sets = w.split(/[,/\s]+/).filter(Boolean);
    if (!sets.length) throw new Error(`Week ${wi + 1} has no sets`);
    if (sets.length > MAX_SETS) throw new Error(`At most ${MAX_SETS} sets per week`);
    return sets.map((s) => {
      const up = s.toUpperCase();
      if (up === 'F' || up === 'MAX' || s === '∞') return 'F';
      const n = Number(s);
      if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error(`"${s}" isn't a rep count (1–100) or F`);
      return n;
    });
  });
}

export function formatScheme(scheme: RepScheme | null | undefined): string {
  return scheme?.length ? scheme.map((w) => w.join(',')).join(' | ') : '';
}

/** Read a stored scheme; anything malformed counts as no scheme (never throws). */
export function readScheme(json: string | null | undefined): RepScheme | null {
  if (!json) return null;
  try {
    const v: unknown = JSON.parse(json);
    return isScheme(v) ? v : null;
  } catch {
    return null;
  }
}

export function isScheme(v: unknown): v is RepScheme {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= MAX_WEEKS &&
    v.every((w) => Array.isArray(w) && w.length > 0 && w.length <= MAX_SETS && w.every((e) => e === 'F' || (Number.isInteger(e) && e >= 1 && e <= 100)))
  );
}

/** The scheme for a 1-based program week (rotates). */
export function schemeForWeek(scheme: RepScheme, week: number): RepEntry[] {
  return scheme[(Math.max(1, week) - 1) % scheme.length];
}

/**
 * Fit a week's scheme to the number of working sets actually planned (a deload or lighter week
 * has fewer, a push week one more). Fewer: keep the first sets. More: repeat the last rep target.
 * Returned as targets per set: a number, or null for a set to failure.
 */
export function fitScheme(entries: RepEntry[], sets: number): (number | null)[] {
  const out: (number | null)[] = [];
  const lastNumber = [...entries].reverse().find((e): e is number => e !== 'F') ?? null;
  for (let i = 0; i < sets; i++) {
    const e = i < entries.length ? entries[i] : lastNumber;
    out.push(e === 'F' || e == null ? null : e);
  }
  return out;
}

/** Short label, e.g. "12/10/8/8" or "20/20/20/20 + F". */
export function describeEntries(entries: RepEntry[]): string {
  const nums = entries.filter((e): e is number => e !== 'F');
  const fails = entries.length - nums.length;
  if (!nums.length) return `${fails} × to failure`;
  const allSame = nums.every((n) => n === nums[0]);
  const base = allSame ? `${nums.length} × ${nums[0]}` : nums.join('/');
  return fails ? `${base} + ${fails === 1 ? '' : `${fails} × `}to failure` : base;
}
