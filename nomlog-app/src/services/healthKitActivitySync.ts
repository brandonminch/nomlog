import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../config/supabase';
import { apiClient, ApiError } from '../lib/api';
import {
  ensureActivityHealthKit,
  fetchRecentWorkouts,
  isIosHealthKitSupported,
  whenHealthKitModuleMayBeReady,
} from '../lib/healthkit';
import type { ImportedWorkout } from '../lib/healthkit';
import {
  buildLogsRangeQueryParams,
  collectLoggedHealthKitIds,
  HEALTHKIT_RECENT_WINDOW_MS,
  type LogsRangeResponse,
} from '../utils/healthKitLogsRange';
import { workoutToCreatePayload } from '../utils/healthKitWorkoutMapping';

const COOLDOWN_STORAGE_KEY = '@nomlog/health_kit_sync_last_at';
/** Min interval between sync runs (foreground + observer). */
const COOLDOWN_MS = 90_000;
const LOGS_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise
      .then((v) => {
        clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(id);
        reject(e);
      });
  });
}

export type HealthKitSyncResult =
  | {
      status: 'skipped';
      reason:
        | 'platform'
        | 'not_enabled'
        | 'no_session'
        | 'cooldown'
        | 'healthkit_denied'
        | 'no_native_module';
    }
  | { status: 'success'; uploaded: number; skippedAlreadyLogged: number; postErrors: number }
  | { status: 'error'; message: string };

/**
 * Uploads recent HealthKit workouts not already present in Nomlog (same rules as Activity import).
 * Respects a cooldown to avoid duplicate work from foreground + HKObserver firing together.
 */
export async function syncHealthKitActivities(options: {
  autoLogEnabled: boolean;
  queryClient?: QueryClient;
  /** When true, ignores cooldown (e.g. manual test). */
  skipCooldown?: boolean;
}): Promise<HealthKitSyncResult> {
  const { autoLogEnabled, queryClient, skipCooldown } = options;

  if (Platform.OS !== 'ios') {
    return { status: 'skipped', reason: 'platform' };
  }
  if (!autoLogEnabled) {
    return { status: 'skipped', reason: 'not_enabled' };
  }
  if (!isIosHealthKitSupported()) {
    return { status: 'skipped', reason: 'no_native_module' };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { status: 'skipped', reason: 'no_session' };
  }

  if (!skipCooldown) {
    const raw = await AsyncStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (raw) {
      const last = Number.parseInt(raw, 10);
      if (!Number.isNaN(last) && Date.now() - last < COOLDOWN_MS) {
        return { status: 'skipped', reason: 'cooldown' };
      }
    }
  }

  await whenHealthKitModuleMayBeReady();
  const ok = await ensureActivityHealthKit();
  if (!ok) {
    return { status: 'skipped', reason: 'healthkit_denied' };
  }

  let hkList: ImportedWorkout[];
  try {
    hkList = await fetchRecentWorkouts(HEALTHKIT_RECENT_WINDOW_MS);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not read workouts from Health';
    return { status: 'error', message };
  }

  const { dateStart, dateEnd, timezone } = buildLogsRangeQueryParams(HEALTHKIT_RECENT_WINDOW_MS);
  let rangeData: LogsRangeResponse = {};
  try {
    rangeData = (await withTimeout(
      apiClient.get(
        `/api/v1/logs?dateStart=${dateStart}&dateEnd=${dateEnd}&timezone=${encodeURIComponent(timezone)}`
      ),
      LOGS_TIMEOUT_MS,
      'Logs request'
    )) as LogsRangeResponse;
  } catch (e) {
    const message =
      e instanceof ApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Could not load Nomlog history for deduplication';
    console.warn('[healthKitActivitySync] logs range failed:', e);
    Sentry.captureException(e instanceof Error ? e : new Error(String(e)), {
      tags: { healthKitSync: 'logs_range' },
    });
    return { status: 'error', message };
  }

  const logged = collectLoggedHealthKitIds(rangeData);
  const withId = hkList.filter((w) => w.id);
  const candidates = withId.filter((w) => !logged.has(w.id));

  let uploaded = 0;
  let postErrors = 0;

  for (const w of candidates) {
    const payload = workoutToCreatePayload(w);
    try {
      await apiClient.post('/api/v1/activity-logs', payload);
      uploaded += 1;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        continue;
      }
      postErrors += 1;
      console.warn('[healthKitActivitySync] post failed', w.id, e);
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)), {
        tags: { healthKitSync: 'post' },
        extra: { workoutId: w.id },
      });
    }
  }

  await AsyncStorage.setItem(COOLDOWN_STORAGE_KEY, String(Date.now()));

  if (queryClient && uploaded > 0) {
    await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
  }

  const skippedAlreadyLogged = withId.length - candidates.length;

  return {
    status: 'success',
    uploaded,
    skippedAlreadyLogged,
    postErrors,
  };
}
