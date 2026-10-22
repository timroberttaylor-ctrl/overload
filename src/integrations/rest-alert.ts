import { AppState, Platform } from 'react-native';

/**
 * Rest-over alert for when the phone is locked or the app is in the background.
 * iOS suspends JavaScript in the background, so the in-app beep can't fire; a local
 * notification scheduled for the end of rest does. Local only: no push, no server.
 *
 * expo-notifications is loaded lazily: in Expo Go on Android (SDK 53+) importing it throws
 * ("Cannot find native module 'ExpoTopicSubscriptionModule'"), which would take the whole
 * workout screen down. Where it can't load, rest alerts are simply skipped.
 */

type Notifications = typeof import('expo-notifications');

const CHANNEL = 'rest-timer';
let mod: Notifications | null | undefined;
let setUp = false;
let permission: Promise<boolean> | null = null;

function load(): Notifications | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web') return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-notifications') as Notifications;
  } catch {
    mod = null;
  }
  return mod;
}

function setUpOnce(N: Notifications) {
  if (setUp) return;
  setUp = true;
  try {
    // In the foreground the rest bar already beeps and buzzes, so stay quiet there.
    N.setNotificationHandler({
      handleNotification: async () => {
        const active = AppState.currentState === 'active';
        return { shouldShowBanner: !active, shouldShowList: !active, shouldPlaySound: !active, shouldSetBadge: false };
      },
    });
    if (Platform.OS === 'android') {
      N.setNotificationChannelAsync(CHANNEL, {
        name: 'Rest timer',
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 120, 250],
        sound: 'default',
      }).catch(() => {});
    }
  } catch {
    // Alerts are a nicety; the in-app timer still works.
  }
}

/** Asks once per app run, the first time a rest starts; never nags after a "no". */
function ensurePermission(N: Notifications): Promise<boolean> {
  permission ??= (async () => {
    try {
      const current = await N.getPermissionsAsync();
      if (current.granted) return true;
      if (!current.canAskAgain) return false;
      const asked = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
      return asked.granted;
    } catch {
      return false;
    }
  })();
  return permission;
}

/** Schedules the alert; resolves to an id for cancelRestAlert, or null if not possible. */
export async function scheduleRestAlert(endsAt: number, body: string): Promise<string | null> {
  if (endsAt - Date.now() < 2000) return null;
  const N = load();
  if (!N) return null;
  setUpOnce(N);
  if (!(await ensurePermission(N))) return null;
  try {
    return await N.scheduleNotificationAsync({
      content: { title: 'Rest over', body, sound: 'default' },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: endsAt, channelId: CHANNEL },
    });
  } catch {
    return null;
  }
}

export function cancelRestAlert(id: Promise<string | null> | null) {
  const N = mod;
  if (!N) return;
  id?.then((v) => (v ? N.cancelScheduledNotificationAsync(v) : undefined)).catch(() => {});
}
