import type { ActivityExerciseSegment } from '../types/activityLog';
import type { ActivitySummary, ActivitySummaryItem } from '../types/activitySummary';

export function activitySummaryItemsToExerciseSegments(items: ActivitySummaryItem[]): ActivityExerciseSegment[] {
  const out: ActivityExerciseSegment[] = [];
  for (const item of items) {
    if (item.kind === 'cardio') {
      out.push({
        kind: 'manual_exercise',
        title: item.activityName.trim() || 'Cardio',
        schemaType: item.schemaType,
        effort: item.effort,
        durationSec:
          item.durationMinutes != null && item.durationMinutes > 0
            ? Math.round(item.durationMinutes * 60)
            : undefined,
        distanceMiles: item.distanceMiles,
        distanceKm: item.distanceKm,
      });
    } else {
      const sets = item.sets
        .map((s) => ({
          reps: s.reps,
          weightLbs: s.weightLbs,
        }))
        .filter((s) => s.reps != null || s.weightLbs != null);
      out.push({
        kind: 'manual_exercise',
        title: item.exerciseName.trim() || 'Exercise',
        schemaType: item.schemaType,
        effort: item.effort,
        ...(sets.length > 0 ? { sets } : {}),
      });
    }
  }
  return out;
}
