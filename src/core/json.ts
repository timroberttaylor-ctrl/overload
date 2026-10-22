/**
 * JSON.parse for values read back from the database. Stored JSON can come from a
 * restored backup file, so a malformed value returns the fallback instead of
 * throwing inside a screen render (which would make that screen unusable).
 */
export function safeJsonParse<T>(text: string | null | undefined, fallback: T, guard?: (v: unknown) => v is T): T {
  if (text == null) return fallback;
  try {
    const v: unknown = JSON.parse(text);
    if (guard && !guard(v)) return fallback;
    return v as T;
  } catch {
    return fallback;
  }
}

export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
export const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => Number.isInteger(x));

/** An exercise's secondary_muscles column. */
export const parseMuscles = (text: string | null | undefined): string[] => safeJsonParse<string[]>(text, [], isStringArray);
