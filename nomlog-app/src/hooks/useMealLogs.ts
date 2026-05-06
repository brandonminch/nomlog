import { useQuery } from '@tanstack/react-query';
import { MealLog } from '../types/mealLog';
import { apiClient } from '../lib/api';

export const useMealLogs = () => {
  return useQuery({
    queryKey: ['mealLogs'],
    queryFn: async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now = new Date();
      const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const data = await apiClient.get(
        `/api/v1/logs?timezone=${encodeURIComponent(timezone)}&date=${dateString}`
      );
      return data.logs as MealLog[];
    },
  });
};

export const useTodaysMealLogs = () => {
  return useQuery({
    queryKey: ['mealLogs', 'today'],
    queryFn: async () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now = new Date();
      const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const data = await apiClient.get(
        `/api/v1/logs?timezone=${encodeURIComponent(timezone)}&date=${dateString}`
      );
      return data.logs as MealLog[];
    },
  });
}; 