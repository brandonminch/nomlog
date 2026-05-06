import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/** Native boundary shape (mirrors Swift `serializeWorkout`). */
export type NomlogHealthWorkoutRow = {
  activityId: number;
  activityName: string;
  calories: number;
  device: string;
  id: string;
  tracked: boolean;
  metadata: Record<string, unknown>;
  sourceName: string;
  sourceId: string;
  distance: number;
  start: string;
  end: string;
  duration: number;
  workoutEvents: { startDate: string; endDate: string; eventTypeInt: number }[];
};

type NomlogHealthNative = {
  isHealthDataAvailable: () => boolean;
  requestActivityAuthorizationAsync: () => Promise<boolean>;
  getWorkoutsInRangeAsync: (startMs: number, endMs: number) => Promise<NomlogHealthWorkoutRow[]>;
  /** Registers HKObserverQuery + background delivery; emits `onWorkoutsUpdated`. */
  startWorkoutObserverAsync: () => Promise<boolean>;
  stopWorkoutObserverAsync: () => Promise<boolean>;
};

/** Only cache a successful lookup — never cache "missing" or the first tick can stick forever. */
let cachedSuccess: NomlogHealthNative | undefined;

export function getNomlogHealthNative(): NomlogHealthNative | null {
  if (Platform.OS !== 'ios') {
    return null;
  }
  if (cachedSuccess !== undefined) {
    return cachedSuccess;
  }
  const mod = requireOptionalNativeModule<NomlogHealthNative>('NomlogHealth');
  if (mod) {
    cachedSuccess = mod;
    return mod;
  }
  return null;
}

export function clearNomlogHealthNativeCache(): void {
  cachedSuccess = undefined;
}
