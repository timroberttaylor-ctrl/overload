import { describe, expect, it } from 'vitest';

import { addDays, weekStart } from '@/core/dates';
import { uuid } from '@/core/ids';
import { displayToKg, formatWeight, kgToDisplay, roundToIncrement } from '@/core/units';

describe('units', () => {
  it('converts and rounds', () => {
    expect(kgToDisplay(100, 'lb')).toBeCloseTo(220.46, 2);
    expect(displayToKg(kgToDisplay(82.5, 'lb'), 'lb')).toBeCloseTo(82.5, 6);
    expect(roundToIncrement(83.7, 2.5)).toBe(82.5);
    expect(roundToIncrement(83.8, 2.5)).toBe(85);
    expect(roundToIncrement(84.9, 2.5, 'down')).toBe(82.5);
    expect(roundToIncrement(82.6, 2.5, 'up')).toBe(85);
    expect(formatWeight(82.5, 'kg')).toBe('82.5 kg');
    expect(formatWeight(100, 'lb')).toBe('220 lb');
    expect(formatWeight(null, 'kg')).toBe('–');
  });

  it('handles dates and ids', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(weekStart('2026-10-22')).toBe('2026-10-19'); // Thursday -> Monday
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

import { parseWeightInput, weightInputValue } from '@/core/units';

describe('weight inputs', () => {
  it('round-trips between kg storage and typed values', () => {
    expect(weightInputValue(82.5, 'kg')).toBe('82.5');
    expect(weightInputValue(null, 'kg')).toBe('');
    expect(parseWeightInput('82,5', 'kg')).toBe(82.5);
    expect(parseWeightInput('', 'kg')).toBeNull();
    expect(parseWeightInput('abc', 'kg')).toBeNull();
    expect(parseWeightInput(weightInputValue(100, 'lb'), 'lb')).toBeCloseTo(100, 1);
  });
});
