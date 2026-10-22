/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, days: number): string {
  const d = parseIsoDate(s);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Monday of the week containing `s` (ISO weeks start on Monday). */
export function weekStart(s: string): string {
  const d = parseIsoDate(s);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(s, -dow);
}
