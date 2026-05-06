/** Mirrors API `exercises` JSONB segments (discriminated by `kind`). */
export type ActivitySchemaType =
  | 'running'
  | 'walking'
  | 'cycling'
  | 'swimming'
  | 'strength'
  | 'hiit'
  | 'custom';

export type ActivityEffort = 'easy' | 'hard' | 'intense';

export type ActivityExerciseSegment =
  | {
      kind: 'healthkit_workout_segment';
      activityType: string;
      start?: string;
      end?: string;
      energyKcal?: number;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: 'healthkit_quantity';
      quantityType: string;
      unit: string;
      value: number;
      start: string;
      end: string;
    }
  | {
      kind: 'manual_exercise';
      title: string;
      schemaType?: ActivitySchemaType;
      effort?: ActivityEffort;
      reps?: number;
      durationSec?: number;
      energyKcal?: number;
      distanceMiles?: number;
      distanceKm?: number;
      sets?: { reps?: number; weightLbs?: number }[];
    };

export type ActivityAnalysisStatus =
  | 'pending'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'failed_max_retries';

export interface ActivityLog {
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
  analysis_status?: ActivityAnalysisStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateActivityLogPayload {
  name: string;
  description?: string | null;
  caloriesBurned?: number | null;
  exercises: ActivityExerciseSegment[];
  loggedAt: string;
  activityId?: string | null;
  externalSource?: string;
  externalId?: string;
}
