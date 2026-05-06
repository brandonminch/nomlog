import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export type MembershipTier = 'free' | 'premium';

export type LlmUsage = {
  windowSeconds: number;
  limitTokens: number | null;
  usedTokens: number;
  remainingTokens: number | null;
  quotaEnabled: boolean;
  membershipTier: MembershipTier;
};

export const useLlmUsage = () => {
  const { token } = useAuthStore();

  return useQuery({
    queryKey: ['llmUsage', token],
    queryFn: async () => {
      const data = await apiClient.get('/api/v1/users/profile/llm-usage');
      return data as LlmUsage;
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });
};
