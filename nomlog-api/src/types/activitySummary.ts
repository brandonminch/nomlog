import { z } from 'zod';
import { ClarifyingQuestionSchema } from './conversation';
import {
  activityEffortSchema,
  activitySchemaTypeSchema,
  type ActivityExerciseSegment,
} from './activityLog';

export const activitySummaryCardioItemSchema = z.object({
  kind: z.literal('cardio'),
  activityName: z.string(),
  schemaType: activitySchemaTypeSchema.optional(),
  effort: activityEffortSchema.optional(),
  distanceMiles: z.number().optional(),
  distanceKm: z.number().optional(),
  durationMinutes: z.number().optional(),
});

export const activitySummaryStrengthSetSchema = z.object({
  reps: z.number().optional(),
  weightLbs: z.number().optional(),
});

export const activitySummaryStrengthItemSchema = z.object({
  kind: z.literal('strength'),
  exerciseName: z.string(),
  schemaType: activitySchemaTypeSchema.optional(),
  effort: activityEffortSchema.optional(),
  sets: z.array(activitySummaryStrengthSetSchema).optional().default([]),
});

export const activitySummaryItemSchema = z.discriminatedUnion('kind', [
  activitySummaryCardioItemSchema,
  activitySummaryStrengthItemSchema,
]);

export const ActivitySummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  questionSummary: z.string().default(''),
  items: z.array(activitySummaryItemSchema).default([]),
  questions: z.array(ClarifyingQuestionSchema).default([]),
  assumptions: z.array(z.string()).default([]),
});

export type ActivitySummary = z.infer<typeof ActivitySummarySchema>;
export type ActivitySummaryItem = z.infer<typeof activitySummaryItemSchema>;

/** Map LLM summary items to persisted exercise segments (manual_exercise). */
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
