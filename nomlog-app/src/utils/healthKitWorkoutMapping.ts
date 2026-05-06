import type { ImportedWorkout } from '../types/health/importedWorkout';
import type { ActivityExerciseSegment, CreateActivityLogPayload } from '../types/activityLog';

export function workoutToExerciseSegments(w: ImportedWorkout): ActivityExerciseSegment[] {
  return [
    {
      kind: 'healthkit_workout_segment',
      activityType: w.activityName,
      start: w.start,
      end: w.end,
      energyKcal: w.calories > 0 ? w.calories : undefined,
      metadata:
        (w.workoutEvents?.length ?? 0) > 0 || w.metadata != null
          ? {
              workoutEvents: w.workoutEvents,
              hkMetadata: w.metadata,
            }
          : undefined,
    },
  ];
}

export function workoutToCreatePayload(w: ImportedWorkout): CreateActivityLogPayload {
  return {
    name: w.activityName?.trim() ? w.activityName : 'Workout',
    description: null,
    caloriesBurned: w.calories > 0 ? w.calories : null,
    exercises: workoutToExerciseSegments(w),
    loggedAt: w.start,
    externalSource: 'healthkit',
    externalId: w.id,
  };
}
