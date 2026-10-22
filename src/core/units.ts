export type WeightUnit = 'kg' | 'lb';

export const LB_PER_KG = 2.2046226218;

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG;
}

export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG;
}

/** Round a load to the nearest achievable increment (e.g. 2.5 kg plates pairs, 5 lb). */
export function roundToIncrement(value: number, increment: number, mode: 'nearest' | 'down' | 'up' = 'nearest'): number {
  if (increment <= 0) return value;
  const n = value / increment;
  const r = mode === 'down' ? Math.floor(n + 1e-9) : mode === 'up' ? Math.ceil(n - 1e-9) : Math.round(n);
  return Number((r * increment).toFixed(4));
}

/** Format a stored kg weight in the user's unit, e.g. "82.5 kg" / "182 lb". */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null) return '–';
  const v = kgToDisplay(kg, unit);
  const rounded = unit === 'kg' ? Math.round(v * 4) / 4 : Math.round(v);
  return `${Number(rounded.toFixed(2))} ${unit}`;
}

/** Value for an editable weight field in the user's unit ("" when unknown). */
export function weightInputValue(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null) return '';
  const v = kgToDisplay(kg, unit);
  return String(unit === 'kg' ? Number(v.toFixed(2)) : Math.round(v * 10) / 10);
}

/** Parse a user-typed weight ("82,5" or "82.5") into kg; null if empty or invalid. */
export function parseWeightInput(text: string, unit: WeightUnit): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  if (!Number.isFinite(v) || v < 0) return null;
  return Number(displayToKg(v, unit).toFixed(3));
}
