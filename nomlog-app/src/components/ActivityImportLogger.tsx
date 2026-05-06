import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '../lib/api';
import type { ImportedWorkout } from '../lib/healthkit';
import {
  ensureActivityHealthKit,
  fetchRecentWorkouts,
  isIosHealthKitSupported,
  whenHealthKitModuleMayBeReady,
} from '../lib/healthkit';
import { workoutToCreatePayload } from '../utils/healthKitWorkoutMapping';
import {
  buildLogsRangeQueryParams,
  collectLoggedHealthKitIds,
  HEALTHKIT_RECENT_WINDOW_MS,
  type LogsRangeResponse,
} from '../utils/healthKitLogsRange';
import { LottieLoadingSpinner } from './LottieLoadingSpinner';

/** Prevents indefinite spinner when fetch hangs (no default timeout in RN fetch). */
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

export const ActivityImportLogger: React.FC = () => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  /** null = bridge not ready yet; avoid false "not available" on first tick. */
  const [hkReady, setHkReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workouts, setWorkouts] = useState<ImportedWorkout[]>([]);
  /** Raw HK count before hiding already-logged (helps debug empty list). */
  const [healthWorkoutCount, setHealthWorkoutCount] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      setLoading(false);
      setWorkouts([]);
      setHealthWorkoutCount(null);
      return;
    }
    await whenHealthKitModuleMayBeReady();
    if (!isIosHealthKitSupported()) {
      setLoading(false);
      setWorkouts([]);
      setHealthWorkoutCount(null);
      return;
    }

    setError(null);
    try {
      const ok = await ensureActivityHealthKit();
      if (!ok) {
        setError('Health data access is required to import workouts. You can enable it in Settings > Privacy > Health.');
        setWorkouts([]);
        setHealthWorkoutCount(null);
        return;
      }

      const hkList = await fetchRecentWorkouts(HEALTHKIT_RECENT_WINDOW_MS);
      setHealthWorkoutCount(hkList.length);

      const { dateStart, dateEnd, timezone } = buildLogsRangeQueryParams(HEALTHKIT_RECENT_WINDOW_MS);

      let rangeData: LogsRangeResponse = {};
      try {
        rangeData = (await withTimeout(
          apiClient.get(
            `/api/v1/logs?dateStart=${dateStart}&dateEnd=${dateEnd}&timezone=${encodeURIComponent(timezone)}`
          ),
          25_000,
          'Logs request'
        )) as LogsRangeResponse;
      } catch (e) {
        console.warn('Activity logger: could not load logs range for dedup', e);
        const msg =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Could not load your Nomlog history';
        setError(`${msg}. Showing Health workouts without hiding already-logged items.`);
      }

      const logged = collectLoggedHealthKitIds(rangeData);
      const withId = hkList.filter((w) => w.id);
      if (__DEV__ && hkList.length > 0 && withId.length < hkList.length) {
        console.warn('[ActivityImportLogger] Some Health rows missing id', {
          total: hkList.length,
          withId: withId.length,
        });
      }
      const filtered = withId.filter((w) => !logged.has(w.id));
      setWorkouts(filtered);
    } catch (e) {
      console.error('Activity logger load', e);
      setError(e instanceof ApiError ? e.message : 'Could not load workouts from Health.');
      setWorkouts([]);
      setHealthWorkoutCount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    let cancelled = false;
    void (async () => {
      // In Release/TestFlight, the Expo modules registry can become available a tick later.
      // Avoid permanently showing "not available" if we check slightly too early.
      const maxAttempts = 10;
      const attemptDelayMs = 250;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await whenHealthKitModuleMayBeReady();
        if (cancelled) {
          return;
        }
        const supported = isIosHealthKitSupported();
        if (supported) {
          setHkReady(true);
          return;
        }
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attemptDelayMs));
        }
      }
      setHkReady(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hkReady !== true) {
      return;
    }
    void load();
  }, [hkReady, load]);

  useEffect(() => {
    if (hkReady === false) {
      setLoading(false);
    }
  }, [hkReady]);

  const logWorkout = useCallback(
    async (w: ImportedWorkout) => {
      const payload = workoutToCreatePayload(w);
      setPendingIds((prev) => new Set(prev).add(w.id));
      try {
        await apiClient.post('/api/v1/activity-logs', payload);
        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
        setWorkouts((prev) => prev.filter((x) => x.id !== w.id));
      } catch (e) {
        console.error('log workout', e);
        const msg = e instanceof ApiError ? e.message : 'Could not log this activity';
        setError(msg);
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(w.id);
          return next;
        });
      }
    },
    [queryClient]
  );

  if (Platform.OS !== 'ios') {
    return (
      <View style={[styles.centered, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.androidMsg}>
          Activity import from Apple Health is available on iOS. Android support will come later.
        </Text>
      </View>
    );
  }

  if (hkReady === null) {
    return (
      <View style={[styles.centered, { paddingBottom: insets.bottom + 24 }]}>
        <LottieLoadingSpinner />
        <Text style={styles.hint}>Checking Apple Health support…</Text>
      </View>
    );
  }

  if (hkReady === false) {
    return (
      <View style={[styles.centered, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.androidMsg}>
          Health data is not available in this build. Use an install that includes the Nomlog native Health module (EAS or
          Xcode build from a repo that contains modules/nomlog-health), turn off Remote JS Debugging, then reload.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { paddingBottom: insets.bottom + 24 }]}>
        <LottieLoadingSpinner />
        <Text style={styles.hint}>Loading workouts…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Recent workouts (last 72 hours)</Text>
      <Text style={styles.sectionSub}>
        Import workouts from Apple Health that you have not logged in Nomlog yet.
      </Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {workouts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No new workouts to import</Text>
          <Text style={styles.emptySub}>
            {healthWorkoutCount != null && healthWorkoutCount > 0
              ? 'Every workout from Health in this window is already logged in Nomlog. Pull to refresh after a new workout.'
              : 'Workouts you already logged are hidden. Pull to refresh after a new workout.'}
          </Text>
          {healthWorkoutCount === 0 ? (
            <Text style={styles.emptyHint}>
              If you added a workout in Health: its start time must fall in the last 72 hours, and Settings → Privacy &
              Security → Health → Nomlog must allow reading Workouts (HealthKit returns no error if read is off—it just
              shows an empty list).
            </Text>
          ) : null}
        </View>
      ) : null}

      {workouts.map((w) => {
        const start = new Date(w.start);
        const durationMin = w.duration > 0 ? Math.round(w.duration / 60) : null;
        const pending = pendingIds.has(w.id);
        return (
          <View key={w.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{w.activityName || 'Workout'}</Text>
              <Text style={styles.cardMeta}>
                {start.toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {durationMin != null ? ` · ${durationMin} min` : ''}
              </Text>
            </View>
            {w.calories > 0 ? (
              <Text style={styles.calories}>{Math.round(w.calories)} kcal burned (est.)</Text>
            ) : (
              <Text style={styles.caloriesMuted}>No energy data for this workout</Text>
            )}
            <TouchableOpacity
              style={[styles.logBtn, pending && styles.logBtnDisabled]}
              onPress={() => void logWorkout(w)}
              disabled={pending}
              activeOpacity={0.85}
            >
              {pending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.logBtnText}>Log activity</Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    alignSelf: 'stretch',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  hint: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  androidMsg: {
    fontSize: 15,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  sectionSub: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  emptyHint: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 17,
    marginTop: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  cardMeta: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  calories: {
    fontSize: 14,
    fontWeight: '500',
    color: '#7c3aed',
    marginBottom: 12,
  },
  caloriesMuted: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 12,
  },
  logBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logBtnDisabled: {
    opacity: 0.7,
  },
  logBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
