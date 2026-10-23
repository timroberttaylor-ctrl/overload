/** Colour coding rules: superset labels and colours, effort bands, phases, plans and muscles. */
import { describe, expect, it } from 'vitest';

import { effortBand, groupName, muscleCode, phaseCode, planCode, seriesCode, seriesLabels, setCode } from '@/constants/colour-codes';

describe('superset colours and labels', () => {
  it('numbers shared letters and leaves lone letters alone', () => {
    expect(seriesLabels(['A', 'A', 'B', 'C', 'C', 'C'])).toEqual(['A1', 'A2', 'B', 'C1', 'C2', 'C3']);
    expect(seriesLabels([null, 'A'])).toEqual(['', 'A']);
  });

  it('names group sizes', () => {
    expect([1, 2, 3, 5].map(groupName)).toEqual([null, 'Superset', 'Triset', 'Giant set']);
  });

  it('gives each letter its own colour, cycling after six, in both themes', () => {
    const dark = ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => seriesCode(l, 'dark').solid);
    expect(new Set(dark).size).toBe(6);
    expect(seriesCode('G', 'dark')).toEqual(seriesCode('A', 'dark'));
    expect(seriesCode('a', 'light')).toEqual(seriesCode('A', 'light'));
    expect(seriesCode('A', 'light').solid).not.toBe(seriesCode('A', 'dark').solid);
    expect(seriesCode('A', 'dark').tint).toMatch(/^#[0-9A-F]{8}$/i);
  });
});

describe('set types, effort, phases, plans and muscles', () => {
  it('bands RPE by effort', () => {
    expect([null, 6, 7.5, 8, 8.5, 9, 10].map(effortBand)).toEqual([null, 'easy', 'easy', 'hard', 'hard', 'max', 'max']);
  });

  it('keeps the meanings distinct', () => {
    expect(setCode('pr', 'dark').solid).not.toBe(setCode('failure', 'dark').solid);
    expect(phaseCode('realisation', 'dark')).toEqual(setCode('failure', 'dark'));
    expect(phaseCode('deload', 'dark')).toEqual(planCode('deload', 'dark'));
    expect(planCode('planned_deload', 'dark')).toEqual(planCode('deload', 'dark'));
  });

  it('colours a muscle by its group', () => {
    expect(muscleCode('lats', 'dark')).toEqual(muscleCode('back', 'dark'));
    expect(muscleCode('front delts', 'dark')).toEqual(muscleCode('shoulders', 'dark'));
    expect(muscleCode('chest', 'dark')).not.toEqual(muscleCode('back', 'dark'));
    expect(muscleCode('unknown', 'dark').solid).toBe('#8E9993');
  });
});
