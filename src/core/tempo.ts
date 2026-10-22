/**
 * Lifting tempo in the common four-part notation  E / P / C / T :
 *   E = seconds lowering (eccentric), P = pause in the stretched/bottom position,
 *   C = seconds lifting (concentric), T = pause at the top / squeeze.
 * "X" means as fast as possible (explosive, with control).
 */
export type TempoPart = number | 'X';
export type Tempo = { eccentric: TempoPart; bottom: TempoPart; concentric: TempoPart; top: TempoPart };

export function parseTempo(text: string | null | undefined): Tempo | null {
  if (!text) return null;
  const parts = text.trim().toUpperCase().split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length !== 4) return null;
  const vals: TempoPart[] = [];
  for (const p of parts) {
    if (p === 'X') vals.push('X');
    else if (/^\d{1,2}$/.test(p)) vals.push(Number(p));
    else return null;
  }
  return { eccentric: vals[0], bottom: vals[1], concentric: vals[2], top: vals[3] };
}

export function formatTempo(t: Tempo): string {
  return [t.eccentric, t.bottom, t.concentric, t.top].join('/');
}

/** Normalise any accepted spelling ("3-1-X-1", "31X1" is not accepted) to "3/1/X/1". */
export function normaliseTempo(text: string | null | undefined): string | null {
  const t = parseTempo(text);
  return t ? formatTempo(t) : null;
}

const secs = (p: TempoPart, word: string, zero: string | null) => (p === 'X' ? `explosive ${word}` : p === 0 ? zero : `${p} s ${word}`);

/** Plain-language cue, e.g. "3 s down · 1 s pause at the bottom · explosive up · 1 s squeeze at the top". */
export function describeTempo(t: Tempo): string {
  return [secs(t.eccentric, 'down', 'controlled down'), secs(t.bottom, 'pause at the bottom', null), secs(t.concentric, 'up', 'up'), secs(t.top, 'squeeze at the top', null)]
    .filter(Boolean)
    .join(' · ')
    .replace('explosive down', 'fast but controlled down')
    .replace('explosive pause at the bottom', 'no pause at the bottom')
    .replace('explosive squeeze at the top', 'no pause at the top');
}

/** Approximate seconds per rep (X counts as 1 s). */
export function secondsPerRep(t: Tempo): number {
  const v = (p: TempoPart) => (p === 'X' ? 1 : p);
  return v(t.eccentric) + v(t.bottom) + v(t.concentric) + v(t.top);
}
