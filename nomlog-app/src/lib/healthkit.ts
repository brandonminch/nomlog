import { InteractionManager } from 'react-native';
import { clearNomlogHealthNativeCache, getNomlogHealthNative } from 'nomlog-health';
import type { ImportedWorkout } from '../types/health/importedWorkout';
import { HEALTHKIT_RECENT_WINDOW_MS } from '../utils/healthKitLogsRange';

export type { ImportedWorkout } from '../types/health/importedWorkout';

export function clearHealthKitModuleCache(): void {
  clearNomlogHealthNativeCache();
  initPromise = null;
}

export function isIosHealthKitSupported(): boolean {
  return getNomlogHealthNative() != null;
}

let initPromise: Promise<boolean> | null = null;

/**
 * Requests read access for workouts and related quantities (matches previous react-native-health set).
 */
export function ensureActivityHealthKit(): Promise<boolean> {
  const native = getNomlogHealthNative();
  if (!native) {
    return Promise.resolve(false);
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    try {
      const ok = await native.requestActivityAuthorizationAsync();
      if (!ok) {
        initPromise = null;
      }
      return ok;
    } catch (e) {
      console.warn('[HealthKit] requestActivityAuthorizationAsync:', e);
      initPromise = null;
      return false;
    }
  })();
  return initPromise;
}

export function resetHealthKitInitCache(): void {
  initPromise = null;
}

export { HEALTHKIT_RECENT_WINDOW_MS };

/**
 * Returns Health workouts from the last `maxAgeMs` (default 72h), most recent first.
 */
export async function fetchRecentWorkouts(maxAgeMs: number = HEALTHKIT_RECENT_WINDOW_MS): Promise<ImportedWorkout[]> {
  const native = getNomlogHealthNative();
  if (!native) {
    return [];
  }
  const ok = await ensureActivityHealthKit();
  if (!ok) {
    return [];
  }
  if (!native.isHealthDataAvailable()) {
    return [];
  }

  const end = Date.now();
  const start = end - maxAgeMs;

  try {
    const rows = await native.getWorkoutsInRangeAsync(start, end);
    if (__DEV__) {
      console.log('[HealthKit] getWorkoutsInRangeAsync', {
        count: rows.length,
        rangeStartIso: new Date(start).toISOString(),
        rangeEndIso: new Date(end).toISOString(),
      });
    }
    const sorted = [...rows].sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
    );
    return sorted as ImportedWorkout[];
  } catch (e) {
    console.warn('[HealthKit] getWorkoutsInRangeAsync:', e);
    return [];
  }
}

export function whenHealthKitModuleMayBeReady(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
