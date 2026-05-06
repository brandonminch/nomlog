import { z } from 'zod';

// Primary goal codes stored in the user_profiles table.
export const PrimaryGoalEnum = z.enum([
  'lose_weight',
  'maintain_weight',
  'build_muscle',
  'track_intake',
  'training_event',
]);

export type PrimaryGoal = z.infer<typeof PrimaryGoalEnum>;

// Zod schema for user profile updates (all fields optional for partial updates)
export const UserProfileUpdateSchema = z.object({
  timezone: z.string().optional(),
  breakfast_time: z.string().optional(),
  lunch_time: z.string().optional(),
  dinner_time: z.string().optional(),
  push_enabled: z.boolean().optional(),
  daily_calorie_goal: z.number().positive().optional().nullable(),
  daily_protein_goal: z.number().nonnegative().optional().nullable(),
  daily_carb_goal: z.number().nonnegative().optional().nullable(),
  daily_fat_goal: z.number().nonnegative().optional().nullable(),
  weight: z.number().positive().optional().nullable(),
  // Conversational onboarding fields
  display_name: z.string().min(1).max(120).optional().nullable(),
  primary_goal: PrimaryGoalEnum.optional().nullable(),
  // Conversational physical stats inputs (free text from chat)
  /** Prefer `date_of_birth`. If set without DOB, API maps to a Jan 1 placeholder year. */
  age_input: z.string().min(1).optional().nullable(),
  /** ISO calendar date YYYY-MM-DD; canonical source for age (with profile timezone). */
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  height_input: z.string().min(1).optional().nullable(),
  weight_input: z.string().min(1).optional().nullable(),
  biological_sex: z.enum(['male', 'female', 'prefer_not_to_say']).optional().nullable(),
  activity_level: z
    .enum(['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'])
    .optional()
    .nullable(),
  has_completed_onboarding: z.boolean().optional(),
  /** When true, recompute TDEE and daily macro goals from profile inputs. Omitted/false preserves goals unless calorie goal was never set. */
  recalculate_nutrition_targets: z.boolean().optional(),
});

// Full user profile: DB row plus `age_years` injected on read when `date_of_birth` is set.
export interface UserProfile {
  user_id: string;
  timezone: string;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  push_enabled: boolean;
  daily_calorie_goal: number | null;
  daily_protein_goal: number | null;
  daily_carb_goal: number | null;
  daily_fat_goal: number | null;
  weight: number | null;
  // Conversational onboarding fields
  display_name: string | null;
  primary_goal: PrimaryGoal | null;
  // Normalized physical stats
  /** Present on GET/PATCH responses when `date_of_birth` is set (computed; not stored). */
  age_years?: number | null;
  /** Date of birth (YYYY-MM-DD). Age is computed using `timezone`. */
  date_of_birth?: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  preferred_height_unit: 'cm' | 'ft_in' | null;
  preferred_weight_unit: 'kg' | 'lbs' | null;
  biological_sex: 'male' | 'female' | 'prefer_not_to_say' | null;
  activity_level:
    | 'sedentary'
    | 'lightly_active'
    | 'moderately_active'
    | 'very_active'
    | 'extremely_active'
    | null;
  tdee_kcal: number | null;
  // Future adaptive TDEE support
  initial_tdee_estimate: number | null;
  adaptive_tdee_estimate: number | null;
  tdee_source: 'static' | 'adaptive' | null;
  last_adaptive_tdee_updated_at: string | null;
  has_completed_onboarding: boolean;
  created_at: string;
  updated_at: string;
}

export type UserProfileUpdate = z.infer<typeof UserProfileUpdateSchema>;
