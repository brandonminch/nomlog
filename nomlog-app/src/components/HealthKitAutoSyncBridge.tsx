import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { usePostHog } from 'posthog-react-native';
import { syncHealthKitActivities } from '../services/healthKitActivitySync';
import { activateWorkoutObserver } from '../services/healthKitObserverController';
import { notifyBackgroundActivitiesLogged } from '../services/localNotifications';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/authStore';
import { selectAutoLogHealthWorkoutsForPlatform, useAutoLogHealthStore } from '../store/autoLogHealthStore';

const FOREGROUND_DEBOUNCE_MS = 400;

/**
 * When auto–log is enabled (iOS): sync on foreground, and register HKObserverQuery for Health updates.
 */
export function HealthKitAutoSyncBridge(): null {
  const posthog = usePostHog();
  const user = useAuthStore((s) => s.user);
  const ready = useAutoLogHealthStore((s) => s.ready);
  const autoLog = useAutoLogHealthStore(selectAutoLogHealthWorkoutsForPlatform);
  const hydrate = useAutoLogHealthStore((s) => s.hydrate);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerCleanupRef = useRef<(() => Promise<void>) | null>(null);
  const observerGenerationRef = useRef(0);
  const lastTriggerRef = useRef<'foreground' | 'observer' | 'unknown'>('unknown');

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const runSync = useCallback(async () => {
    if (Platform.OS !== 'ios' || !autoLog || !user) {
      return;
    }
    const result = await syncHealthKitActivities({
      autoLogEnabled: autoLog,
      queryClient,
    });
    if (result.status === 'success') {
      posthog.capture('health_kit_sync_completed', {
        uploaded: result.uploaded,
        skipped_already_logged: result.skippedAlreadyLogged,
        post_errors: result.postErrors,
      });

      // Only notify when a background HealthKit observer wake actually logged something.
      if (
        lastTriggerRef.current === 'observer' &&
        result.uploaded > 0 &&
        AppState.currentState !== 'active'
      ) {
        await notifyBackgroundActivitiesLogged(result.uploaded);
      }
    }
    lastTriggerRef.current = 'unknown';
  }, [autoLog, posthog, user]);

  // Foreground: debounced sync
  useEffect(() => {
    if (Platform.OS !== 'ios' || !ready) {
      return;
    }

    const handleAppState = (next: AppStateStatus) => {
      if (next !== 'active' || !autoLog || !user) {
        return;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        lastTriggerRef.current = 'foreground';
        void runSync();
      }, FOREGROUND_DEBOUNCE_MS);
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => {
      sub.remove();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [autoLog, ready, runSync, user]);

  // Initial sync when gate opens (cooldown may defer)
  useEffect(() => {
    if (Platform.OS !== 'ios' || !ready || !autoLog || !user) {
      return;
    }
    void runSync();
  }, [autoLog, ready, runSync, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- gate uses user above; avoid identity churn

  // HKObserverQuery + listener
  useEffect(() => {
    if (Platform.OS !== 'ios' || !ready || !autoLog || !user) {
      const prev = observerCleanupRef.current;
      observerCleanupRef.current = null;
      void prev?.();
      return;
    }

    const gen = ++observerGenerationRef.current;
    void (async () => {
      const cleanup = await activateWorkoutObserver(() => {
        lastTriggerRef.current = 'observer';
        void runSync();
      });
      if (gen !== observerGenerationRef.current) {
        await cleanup();
        return;
      }
      observerCleanupRef.current = cleanup;
    })();

    return () => {
      observerGenerationRef.current += 1;
      const prev = observerCleanupRef.current;
      observerCleanupRef.current = null;
      void prev?.();
    };
  }, [autoLog, ready, runSync, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- gate uses user above; avoid identity churn

  return null;
}
