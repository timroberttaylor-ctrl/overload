import { addDays } from '@/core/dates';
import type { HealthInput } from '@/db/repositories/health';

/** Small deterministic PRNG so sample data is the same every time. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Realistic-looking recovery data for testing without a ring: normal day-to-day
 * noise, an occasional short night, and a tired stretch in the last 4 days so
 * readiness logic has something to react to.
 */
export function generateSampleRecovery(today: string, days = 60, seed = 42): HealthInput[] {
  const rnd = mulberry32(seed);
  const noise = (sd: number) => (rnd() + rnd() + rnd() - 1.5) * sd * 1.4;
  const out: HealthInput[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const shortNight = rnd() < 0.1;
    const tired = i < 4 ? (4 - i) / 4 : 0;
    const sleep = Math.max(4.5, 7.4 + noise(0.45) - (shortNight ? 1.6 : 0) - tired * 1.1);
    const hrv = Math.max(20, 58 + noise(5) - (shortNight ? 9 : 0) - tired * 14);
    const rhr = Math.max(40, 52 + noise(1.6) + (shortNight ? 3 : 0) + tired * 5);
    const sleepScore = Math.round(Math.min(98, Math.max(45, 55 + (sleep - 5) * 11 + noise(3))));
    const readiness = Math.round(Math.min(98, Math.max(35, 78 + (hrv - 58) * 0.9 - (rhr - 52) * 1.5 + (sleep - 7.4) * 5 + noise(3))));
    out.push({ date, hrvMs: Math.round(hrv), rhrBpm: Math.round(rhr), sleepHours: Math.round(sleep * 100) / 100, sleepScore, vendorReadiness: readiness });
  }
  return out;
}
