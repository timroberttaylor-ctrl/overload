import type { SeedExercise } from './exercises';
import type { SeedSlot } from './programs';

/** Lengthened-position isolation work, where a pause in the stretch is most useful. */
const STRETCH_FOCUSED = new Set(['incline_db_curl', 'overhead_triceps_ext', 'seated_leg_curl', 'lying_leg_curl', 'cable_fly', 'pec_deck', 'pullover', 'preacher_curl', 'sissy_squat']);

/**
 * Sensible default tempo (E/P/C/T) for a prescription when the program does not set one.
 * Heavy compounds: controlled lowering, drive up explosively. Hypertrophy compounds: slower
 * lowering. Isolation: pause and squeeze. Calves: long pause in the stretch.
 * Tracking-only, core, carries and conditioning get no tempo.
 */
export function defaultTempo(ex: SeedExercise, slot: SeedSlot): string | null {
  if (slot.rule === 'none' || ex.pattern === 'carry' || ex.primary === 'conditioning' || ex.primary === 'mobility') return null;
  if (ex.pattern === 'core') return ex.id === 'cable_crunch' || ex.id === 'hanging_leg_raise' || ex.id === 'ab_wheel' ? '2/0/1/1' : null;
  if (ex.primary === 'calves') return '2/2/1/1';
  if (STRETCH_FOCUSED.has(ex.id)) return '3/1/1/0';
  if (ex.pattern === 'hinge' && (ex.id === 'rdl' || ex.id === 'db_rdl' || ex.id === 'stiff_leg_dl')) return '3/1/1/0';
  if (ex.compound) return slot.repMax <= 6 ? '2/1/X/0' : '3/0/X/0';
  return '2/0/1/1';
}
