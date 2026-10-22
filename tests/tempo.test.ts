import { describe, expect, it } from 'vitest';

import { describeTempo, normaliseTempo, parseTempo, secondsPerRep } from '@/core/tempo';

describe('tempo', () => {
  it('parses slash, dash and space notation with X for explosive', () => {
    expect(parseTempo('3/1/X/1')).toEqual({ eccentric: 3, bottom: 1, concentric: 'X', top: 1 });
    expect(normaliseTempo('3-1-1-1')).toBe('3/1/1/1');
    expect(normaliseTempo('2 0 x 0')).toBe('2/0/X/0');
    expect(parseTempo('31X1')).toBeNull();
    expect(parseTempo('3/1/1')).toBeNull();
    expect(parseTempo(null)).toBeNull();
  });

  it('describes it in plain language and estimates time per rep', () => {
    expect(describeTempo(parseTempo('3/1/X/1')!)).toBe('3 s down · 1 s pause at the bottom · explosive up · 1 s squeeze at the top');
    expect(describeTempo(parseTempo('2/0/1/0')!)).toBe('2 s down · 1 s up');
    expect(secondsPerRep(parseTempo('3/1/X/1')!)).toBe(6);
  });
});
