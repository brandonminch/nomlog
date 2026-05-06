/**
 * Platform-agnostic workout row from Apple Health (HealthKit).
 * Populated by the local `nomlog-health` Expo module on iOS.
 */
export type ImportedWorkoutEvent = {
  startDate: string;
  endDate: string;
  eventTypeInt: number;
};

export type ImportedWorkout = {
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
  workoutEvents: ImportedWorkoutEvent[];
};
