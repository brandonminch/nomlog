import { NativeEventEmitter, Platform } from 'react-native';
import { getNomlogHealthNative } from 'nomlog-health';
import { ensureActivityHealthKit } from '../lib/healthkit';

/**
 * Registers HKObserverQuery + background delivery and subscribes to `onWorkoutsUpdated`.
 * Returns a cleanup that removes the listener and stops the native observer.
 */
export async function activateWorkoutObserver(
  onWorkoutsUpdated: () => void
): Promise<() => Promise<void>> {
  const mod = getNomlogHealthNative();
  if (Platform.OS !== 'ios' || !mod) {
    return async () => {};
  }

  const { startWorkoutObserverAsync, stopWorkoutObserverAsync } = mod;
  if (!startWorkoutObserverAsync || !stopWorkoutObserverAsync) {
    return async () => {};
  }

  const ok = await ensureActivityHealthKit();
  if (!ok) {
    return async () => {};
  }

  try {
    await stopWorkoutObserverAsync().catch(() => {});
    await startWorkoutObserverAsync();
  } catch (e) {
    console.warn('[healthKitObserverController] startWorkoutObserverAsync:', e);
    return async () => {};
  }

  const emitter = new NativeEventEmitter(mod as any);
  const sub = emitter.addListener('onWorkoutsUpdated', onWorkoutsUpdated);

  return async () => {
    sub.remove();
    await stopWorkoutObserverAsync().catch(() => {});
  };
}
