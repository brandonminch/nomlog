import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../lib/api';
import { queryClient } from '../lib/queryClient';

const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'profileTimezoneSyncLastMs:';

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function getDeviceIanaTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

let inFlight: Promise<void> | null = null;

/**
 * Keeps `user_profiles.timezone` aligned with the device IANA zone so server-side
 * meal reminders fire at the correct local times (e.g. after travel).
 * Runs at most once per hour per signed-in user (successful read + optional PATCH).
 */
export async function maybeSyncProfileTimeZone(userId: string, token: string): Promise<void> {
  if (inFlight) {
    await inFlight;
    return;
  }

  inFlight = (async () => {
    try {
      const now = Date.now();
      const raw = await AsyncStorage.getItem(storageKey(userId));
      const lastMs = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(lastMs) && now - lastMs < SYNC_INTERVAL_MS) {
        return;
      }

      const deviceTz = getDeviceIanaTimeZone();

      let serverTz: string | undefined;
      try {
        const data = await apiClient.get('/api/v1/users/profile');
        serverTz = data?.profile?.timezone;
      } catch (e) {
        console.warn('Profile timezone sync: could not load profile', e);
        return;
      }

      if (typeof serverTz !== 'string' || serverTz.length === 0) {
        serverTz = 'UTC';
      }

      if (serverTz === deviceTz) {
        await AsyncStorage.setItem(storageKey(userId), String(now));
        return;
      }

      try {
        await apiClient.patch('/api/v1/users/profile', { timezone: deviceTz });
      } catch (e) {
        console.warn('Profile timezone sync: PATCH failed', e);
        return;
      }

      await AsyncStorage.setItem(storageKey(userId), String(now));
      await queryClient.invalidateQueries({ queryKey: ['userProfile', token] });
    } finally {
      inFlight = null;
    }
  })();

  await inFlight;
}
