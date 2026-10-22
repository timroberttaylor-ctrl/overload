/**
 * Rest timer on the lock screen and Dynamic Island. iOS installed builds only: in Expo Go and
 * on Android the native module is missing, so everything here quietly does nothing.
 */
import { Platform } from 'react-native';

import type { RestActivityProps } from '@/widgets/rest-activity';

type Instance = { update: (props: RestActivityProps) => Promise<void> | void; end: (policy?: 'default' | 'immediate', props?: RestActivityProps, at?: Date) => Promise<void> };
type Factory = { start: (props: RestActivityProps) => Instance; getInstances: () => Instance[] };

let factory: Factory | null | undefined;

function load(): Factory | null {
  if (factory !== undefined) return factory;
  if (Platform.OS !== 'ios') return (factory = null);
  try {
    // Lazy: requiring it creates the activity type, which needs the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    factory = (require('@/widgets/rest-activity') as { default: Factory }).default;
  } catch {
    factory = null;
  }
  return factory;
}

export function liveActivitiesSupported(): boolean {
  return load() != null;
}

/** Start (or restart) the rest activity. Returns a handle, or null when unavailable or turned off. */
export function startRestActivity(props: RestActivityProps): Instance | null {
  const f = load();
  if (!f) return null;
  try {
    // Only ever one rest timer: clear any left over from a previous rest or an app restart.
    for (const old of f.getInstances()) old.end('immediate').catch(() => {});
    return f.start(props);
  } catch {
    // Live Activities switched off in Settings, or the system refused: the in-app timer still works.
    return null;
  }
}

export function updateRestActivity(instance: Instance | null, props: RestActivityProps): void {
  if (!instance) return;
  try {
    Promise.resolve(instance.update(props)).catch(() => {});
  } catch {
    // ignore
  }
}

export function endRestActivity(instance: Instance | null): void {
  if (!instance) return;
  try {
    instance.end('immediate').catch(() => {});
  } catch {
    // ignore
  }
}
