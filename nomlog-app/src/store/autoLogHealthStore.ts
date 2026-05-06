import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';

export const AUTO_LOG_HEALTH_WORKOUTS_KEY = '@nomlog/auto_log_health_workouts';

type AutoLogHealthState = {
  autoLogHealthWorkouts: boolean;
  ready: boolean;
  hydrate: () => Promise<void>;
  setAutoLogHealthWorkouts: (value: boolean) => Promise<void>;
};

export const useAutoLogHealthStore = create<AutoLogHealthState>((set, get) => ({
  autoLogHealthWorkouts: false,
  ready: false,
  hydrate: async () => {
    if (get().ready) return;
    try {
      const v = await AsyncStorage.getItem(AUTO_LOG_HEALTH_WORKOUTS_KEY);
      set({ autoLogHealthWorkouts: v === 'true', ready: true });
    } catch {
      set({ ready: true });
    }
  },
  setAutoLogHealthWorkouts: async (value: boolean) => {
    await AsyncStorage.setItem(AUTO_LOG_HEALTH_WORKOUTS_KEY, value ? 'true' : 'false');
    set({ autoLogHealthWorkouts: value });
  },
}));

/** iOS-only effective value for UI and sync (Android always false). */
export function selectAutoLogHealthWorkoutsForPlatform(state: AutoLogHealthState): boolean {
  return Platform.OS === 'ios' ? state.autoLogHealthWorkouts : false;
}
