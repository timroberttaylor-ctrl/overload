import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { AppState, Platform } from 'react-native';

/**
 * Rest-over alert for when the phone is locked or the app is in the background.
 * iOS suspends JavaScript in the background, so the in-app beep can't fire; a local
 * notification scheduled for the end of rest does. Local only: no push, no server.
 */

const CHANNEL = 'rest-timer';
let setUp = false;
let permission: Promise<boolean> | null = null;

function setUpOnce() {
  if (setUp) return;
  setUp = true;
  // In the foreground the rest bar already beeps and buzzes, so stay quiet there.
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const active = AppState.currentState === 'active';
      return { shouldShowBanner: !active, shouldShowList: !active, shouldPlaySound: !active, shouldSetBadge: false };
    },
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Rest timer',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 120, 250],
      sound: 'default',
    }).catch(() => {});
  }
}

/** Asks once per app run, the first time a rest starts; never nags after a "no". */
function ensurePermission(): Promise<boolean> {
  permission ??= (async () => {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) return true;
      if (!current.canAskAgain) return false;
      const asked = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
      return asked.granted;
    } catch {
      return false;
    }
  })();
  return permission;
}

/** Schedules the alert; resolves to an id for cancelRestAlert, or null if not possible. */
export async function scheduleRestAlert(endsAt: number, body: string): Promise<string | null> {
  if (Platform.OS === 'web' || endsAt - Date.now() < 2000) return null;
  setUpOnce();
  if (!(await ensurePermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'Rest over', body, sound: 'default' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAt, channelId: CHANNEL },
    });
  } catch {
    return null;
  }
}

export function cancelRestAlert(id: Promise<string | null> | null) {
  id?.then((v) => (v ? Notifications.cancelScheduledNotificationAsync(v) : undefined)).catch(() => {});
}
