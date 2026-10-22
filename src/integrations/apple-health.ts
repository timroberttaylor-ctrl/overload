/**
 * Save finished workouts to Apple Health (write only; OVRLD never reads Health data).
 * iOS installed builds only: in Expo Go and on Android the native module is missing,
 * so everything here reports "unavailable" and does nothing.
 */
import { Platform } from 'react-native';

type HK = typeof import('@kingstinct/react-native-healthkit');

/** HKWorkoutActivityType.traditionalStrengthTraining */
const STRENGTH_TRAINING = 50;
/** HKAuthorizationStatus.sharingAuthorized */
const SHARING_AUTHORIZED = 2;
const WORKOUT = 'HKWorkoutTypeIdentifier' as const;

let hk: HK | null | undefined;

function load(): HK | null {
  if (hk !== undefined) return hk;
  if (Platform.OS !== 'ios') return (hk = null);
  try {
    // Lazy so Expo Go and Android (no native module) never load it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@kingstinct/react-native-healthkit') as HK;
    hk = mod.isHealthDataAvailable() ? mod : null;
  } catch {
    hk = null;
  }
  return hk;
}

export function appleHealthAvailable(): boolean {
  return load() != null;
}

/** Ask permission to save workouts. Resolves true only if saving is allowed. */
export async function connectAppleHealth(): Promise<boolean> {
  const m = load();
  if (!m) return false;
  try {
    await m.requestAuthorization({ toShare: [WORKOUT] });
    return Number(m.authorizationStatusFor(WORKOUT)) === SHARING_AUTHORIZED;
  } catch {
    return false;
  }
}

/** Save one strength-training workout. Never throws; resolves false if it couldn't be saved. */
export async function saveWorkoutToHealth(w: { start: Date; end: Date }): Promise<boolean> {
  const m = load();
  if (!m || w.end <= w.start) return false;
  try {
    if (Number(m.authorizationStatusFor(WORKOUT)) !== SHARING_AUTHORIZED) return false;
    await m.saveWorkoutSample(STRENGTH_TRAINING as Parameters<HK['saveWorkoutSample']>[0], [], w.start, w.end);
    return true;
  } catch {
    return false;
  }
}
