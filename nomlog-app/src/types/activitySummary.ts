import type { ActivityEffort, ActivitySchemaType } from './activityLog';

export type ActivitySummaryCardioItem = {
  kind: 'cardio';
  activityName: string;
  schemaType?: ActivitySchemaType;
  effort?: ActivityEffort;
  distanceMiles?: number;
  distanceKm?: number;
  durationMinutes?: number;
};

export type ActivitySummaryStrengthItem = {
  kind: 'strength';
  exerciseName: string;
  schemaType?: ActivitySchemaType;
  effort?: ActivityEffort;
  sets: { reps?: number; weightLbs?: number }[];
};

export type ActivitySummaryItem = ActivitySummaryCardioItem | ActivitySummaryStrengthItem;

export type ActivitySummary = {
  name: string;
  description: string;
  questionSummary?: string;
  items: ActivitySummaryItem[];
  questions?: { id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }[];
  assumptions?: string[];
};
