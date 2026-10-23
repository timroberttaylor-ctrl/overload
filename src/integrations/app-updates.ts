/**
 * Over-the-air updates (EAS Update). Installed builds check for an update on every launch
 * and switch to it on the next launch; this adds a manual "Check for updates" in Settings.
 * In Expo Go and development builds updates are off, so everything here reports that.
 */
import { requireOptionalNativeModule } from 'expo';

type Updates = typeof import('expo-updates');

let mod: Updates | null | undefined;

function load(): Updates | null {
  if (mod !== undefined) return mod;
  if (requireOptionalNativeModule('ExpoUpdates') == null) return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-updates') as Updates | undefined;
    mod = m?.isEnabled ? m : null;
  } catch {
    mod = null;
  }
  return mod;
}

export type UpdateInfo = { enabled: boolean; channel: string | null; label: string };

/** For the About card: "production · update 3f2a9c1 (23 Oct)" or "built-in version". */
export function updateInfo(): UpdateInfo {
  const m = load();
  if (!m) return { enabled: false, channel: null, label: 'updates off in this build' };
  const id = m.isEmbeddedLaunch ? null : m.updateId?.slice(0, 7);
  const when = m.createdAt ? m.createdAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
  return { enabled: true, channel: m.channel, label: id ? `update ${id}${when ? ` (${when})` : ''}` : 'built-in version' };
}

export type CheckResult = 'updated' | 'none' | 'unavailable' | 'error';

/** Check, download and apply. On 'updated' the app restarts into the new version. */
export async function checkAndApplyUpdate(): Promise<CheckResult> {
  const m = load();
  if (!m) return 'unavailable';
  try {
    const check = await m.checkForUpdateAsync();
    if (!check.isAvailable) return 'none';
    await m.fetchUpdateAsync();
    await m.reloadAsync();
    return 'updated';
  } catch {
    return 'error';
  }
}
