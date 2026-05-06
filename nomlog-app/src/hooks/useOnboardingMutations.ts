import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '../lib/api';
import { useAuthStore } from '../store/authStore';

type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active';

export type OnboardingProfileUpdates = Partial<{
  display_name: string | null;
  primary_goal: import('./useUserProfile').PrimaryGoal | null;
  biological_sex: 'male' | 'female' | 'prefer_not_to_say' | null;
  activity_level: ActivityLevel | null;
  has_completed_onboarding: boolean;
  recalculate_nutrition_targets: boolean;
}>;

export type OnboardingStatsPayload = {
  /** ISO YYYY-MM-DD; preferred over legacy age_input */
  date_of_birth?: string | null;
  /** @deprecated API maps to approximate DOB; prefer date_of_birth */
  age_input?: string;
  height_input?: string;
  weight_input?: string;
  recalculate_nutrition_targets?: boolean;
};

export type DailyGoalsPayload = {
  daily_calorie_goal: number | null;
  daily_protein_goal: number | null;
  daily_carb_goal: number | null;
  daily_fat_goal: number | null;
};

/** Single PATCH combining profile fields and conversational stats (e.g. onboarding summary submit). */
export type FullProfilePatch = OnboardingProfileUpdates & OnboardingStatsPayload;

export const useOnboardingMutations = () => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const profileMutation = useMutation({
    mutationFn: async (updates: OnboardingProfileUpdates | FullProfilePatch) => {
      const response = await apiClient.patch('/api/v1/users/profile', updates);
      return response.profile;
    },
    onSuccess: (updatedProfile) => {
      if (!token) return;
      queryClient.setQueryData(['userProfile', token], updatedProfile);
    },
  });

  const statsMutation = useMutation({
    mutationFn: async (payload: OnboardingStatsPayload) => {
      const response = await apiClient.patch('/api/v1/users/profile', payload);
      return response.profile;
    },
    onSuccess: (updatedProfile) => {
      if (!token) return;
      queryClient.setQueryData(['userProfile', token], updatedProfile);
    },
  });

  const dailyGoalsMutation = useMutation({
    mutationFn: async (goals: DailyGoalsPayload) => {
      const response = await apiClient.patch('/api/v1/users/profile', {
        ...goals,
        recalculate_nutrition_targets: false,
      });
      return response.profile;
    },
    onSuccess: (updatedProfile) => {
      if (!token) return;
      queryClient.setQueryData(['userProfile', token], updatedProfile);
    },
  });

  return {
    patchProfile: profileMutation.mutate,
    patchProfileAsync: profileMutation.mutateAsync,
    isSavingProfile: profileMutation.isPending,

    patchStats: statsMutation.mutateAsync,
    isSavingStats: statsMutation.isPending,

    patchDailyGoalsAsync: dailyGoalsMutation.mutateAsync,
    isSavingDailyGoals: dailyGoalsMutation.isPending,

    ApiError,
  };
};
