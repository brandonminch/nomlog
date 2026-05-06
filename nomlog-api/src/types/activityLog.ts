import { z } from 'zod';

export const activitySchemaTypeValues = [
  'running',
  'walking',
  'cycling',
  'swimming',
  'strength',
  'hiit',
  'custom',
] as const;

export const activityEffortValues = ['easy', 'hard', 'intense'] as const;

export type ActivitySchemaType = (typeof activitySchemaTypeValues)[number];
export type ActivityEffort = (typeof activityEffortValues)[number];

export const activitySchemaTypeSchema = z.enum(activitySchemaTypeValues);
export const activityEffortSchema = z.enum(activityEffortValues);

export const manualExerciseSetSchema = z.object({
  reps: z.number().optional(),
  weightLbs: z.number().optional(),
});

/** One segment in the flexible `exercises` JSONB array. */
export const activityExerciseSegmentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('healthkit_workout_segment'),
    activityType: z.string(),
    start: z.string().optional(),
    end: z.string().optional(),
    energyKcal: z.number().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal('healthkit_quantity'),
    quantityType: z.string(),
    unit: z.string(),
    value: z.number(),
    start: z.string(),
    end: z.string(),
  }),
  z.object({
    kind: z.literal('manual_exercise'),
    title: z.string(),
    schemaType: activitySchemaTypeSchema.optional(),
    effort: activityEffortSchema.optional(),
    /** Legacy single-set rep count; prefer `sets` when present. */
    reps: z.number().optional(),
    durationSec: z.number().optional(),
    energyKcal: z.number().optional(),
    distanceMiles: z.number().optional(),
    distanceKm: z.number().optional(),
    sets: z.array(manualExerciseSetSchema).optional(),
  }),
]);

export type ActivityExerciseSegment = z.infer<typeof activityExerciseSegmentSchema>;

function isPositive(n: number | undefined): boolean {
  return n != null && Number.isFinite(n) && n > 0;
}

function getManualSchemaType(seg: Extract<ActivityExerciseSegment, { kind: 'manual_exercise' }>): ActivitySchemaType {
  return seg.schemaType ?? inferSchemaTypeFromTitle(seg.title);
}

export function inferSchemaTypeFromTitle(title: string): ActivitySchemaType {
  const t = title.toLowerCase();
  if (/\b(run|jog|sprint|treadmill)\b/.test(t)) return 'running';
  if (/\bwalk|hike\b/.test(t)) return 'walking';
  if (/\b(cycle|cycling|bike|biking|peloton|spin)\b/.test(t)) return 'cycling';
  if (/\b(swim|swimming|lap)\b/.test(t)) return 'swimming';
  if (/\b(strength|lift|lifting|bench|squat|deadlift|press|row)\b/.test(t)) return 'strength';
  if (/\b(hiit|interval|circuit|emom|amrap|tabata)\b/.test(t)) return 'hiit';
  return 'custom';
}

export function validateManualExerciseSegmentMinimums(seg: Extract<ActivityExerciseSegment, { kind: 'manual_exercise' }>): string | null {
  const schemaType = getManualSchemaType(seg);
  const hasDuration = isPositive(seg.durationSec);
  const hasDistance = isPositive(seg.distanceMiles) || isPositive(seg.distanceKm);
  const setSignal = (seg.sets ?? []).some((s) => isPositive(s.reps) || isPositive(s.weightLbs));
  const hasStrengthSignal = setSignal || isPositive(seg.reps);

  if (schemaType === 'running' || schemaType === 'walking' || schemaType === 'cycling' || schemaType === 'swimming' || schemaType === 'hiit') {
    if (hasDuration || hasDistance) return null;
    return `${schemaType} activities require at least distance or duration`;
  }

  if (schemaType === 'strength') {
    if (hasStrengthSignal || hasDuration) return null;
    return 'strength activities require sets/reps/weight or duration';
  }

  if (hasDuration || hasDistance || hasStrengthSignal) return null;
  return 'custom activities require at least one measurable field (distance, duration, reps, or weight)';
}

export function validateManualExerciseSegments(exercises: ActivityExerciseSegment[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    if (ex.kind !== 'manual_exercise') continue;
    const err = validateManualExerciseSegmentMinimums(ex);
    if (err) {
      errors.push(`Exercise ${i + 1} (${ex.title || 'manual exercise'}): ${err}`);
    }
  }
  return errors;
}

export const createActivityLogBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  caloriesBurned: z.number().optional().nullable(),
  exercises: z.array(activityExerciseSegmentSchema).optional().default([]),
  loggedAt: z.string().datetime({ offset: true }),
  activityId: z.string().uuid().optional().nullable(),
  externalSource: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
});

export type CreateActivityLogBody = z.infer<typeof createActivityLogBodySchema>;

export const patchActivityLogBodySchema = z
  .object({
    loggedAt: z.string().datetime({ offset: true }).optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    caloriesBurned: z.number().optional().nullable(),
    exercises: z.array(activityExerciseSegmentSchema).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export type PatchActivityLogBody = z.infer<typeof patchActivityLogBodySchema>;

export type ActivityAnalysisStatus =
  | 'pending'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'failed_max_retries';

export interface ActivityLogRow {
  id: string;
  user_id: string;
  activity_id: string | null;
  name: string;
  description: string | null;
  calories_burned: number | null;
  exercises: ActivityExerciseSegment[];
  logged_at: string;
  external_source: string | null;
  external_id: string | null;
  analysis_status: ActivityAnalysisStatus;
  created_at: string;
  updated_at: string;
}
