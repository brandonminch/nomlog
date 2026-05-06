import { useQuery } from '@tanstack/react-query';
import { apiClient, ApiError } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export type PrimaryGoal =
  | 'lose_weight'
  | 'maintain_weight'
  | 'build_muscle'
  | 'track_intake'
  | 'training_event';

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
  display_name: string | null;
  primary_goal: PrimaryGoal | null;
  /** Computed on the API from date_of_birth when set; not stored in the database. */
  age_years?: number | null;
  /** YYYY-MM-DD; canonical for age. */
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
  has_completed_onboarding: boolean;
  created_at: string;
  updated_at: string;
}

export const useUserProfile = () => {
  const { token } = useAuthStore();

  return useQuery({
    // Include token in the key so a new login/session always refetches
    // a fresh profile instead of reusing a previous user's cached data.
    queryKey: ['userProfile', token],
    queryFn: async () => {
      try {
        const data = await apiClient.get('/api/v1/users/profile');
        return data.profile as UserProfile;
      } catch (error) {
        // If profile doesn't exist (404), treat as no profile yet
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};
