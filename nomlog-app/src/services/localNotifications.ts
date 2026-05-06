import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Requests permission for local notifications (iOS prompts once).
 * Safe to call multiple times.
 */
export async function ensureLocalNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  } catch (e) {
    console.warn('[localNotifications] permission error', e);
    return false;
  }
}

export async function notifyBackgroundActivitiesLogged(count: number): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (count <= 0) return;

  const ok = await ensureLocalNotificationPermission();
  if (!ok) return;

  const title = 'Activity logged';
  const body = count === 1 ? 'Added 1 workout from Apple Health.' : `Added ${count} workouts from Apple Health.`;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('[localNotifications] schedule error', e);
  }
}

