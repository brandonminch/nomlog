import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export interface WaterLog {
  id: string;
  date: string;
  glasses: number;
  created_at: string;
  updated_at: string;
}

// Helper function to get water data from logsRange cache
const getWaterFromRangeCache = (date: string, queryClient: any): { glasses: number } | null => {
  const cache = queryClient.getQueryCache();
  const rangeQueries = cache.findAll({ queryKey: ['logsRange'] });
  
  for (const query of rangeQueries) {
    const rangeData = query.state.data as Record<string, { meals: any[]; water: { glasses: number } }> | undefined;
    if (rangeData && rangeData[date]) {
      return rangeData[date].water;
    }
  }
  return null;
};

export const useWaterLog = (date: string) => {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['waterLog', date],
    queryFn: async () => {
      // Check logsRange cache first
      const cachedWater = getWaterFromRangeCache(date, queryClient);
      if (cachedWater !== null) {
        // Return as WaterLog format
        return {
          id: `water-${date}`,
          date,
          glasses: cachedWater.glasses,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as WaterLog;
      }
      // Fallback to API call if not in cache
      const data = await apiClient.get(`/api/v1/water?date=${date}`);
      return data.waterLog as WaterLog | null;
    },
    enabled: !!token && !!date,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  const mutation = useMutation({
    mutationFn: async (glasses: number) => {
      const data = await apiClient.put('/api/v1/water', { date, glasses });
      return data.waterLog as WaterLog;
    },
    onMutate: async (newGlasses: number) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['waterLog', date] });

      // Snapshot the previous value
      const previousWaterLog = query.data;

      // Optimistically update the logsRange cache
      const cache = queryClient.getQueryCache();
      const rangeQueries = cache.findAll({ queryKey: ['logsRange'] });
      
      for (const rangeQuery of rangeQueries) {
        const rangeData = rangeQuery.state.data as Record<string, { meals: any[]; water: { glasses: number } }> | undefined;
        if (rangeData && rangeData[date]) {
          // Update the water value in the range cache
          queryClient.setQueryData(rangeQuery.queryKey, {
            ...rangeData,
            [date]: {
              ...rangeData[date],
              water: { glasses: newGlasses }
            }
          });
          break;
        }
      }

      // Also update the waterLog cache for this query
      queryClient.setQueryData(['waterLog', date], {
        id: `water-${date}`,
        date,
        glasses: newGlasses,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as WaterLog);

      // Return context with the previous value
      return { previousWaterLog };
    },
    onError: (_err, _newGlasses, context) => {
      // Roll back to previous value on error
      if (context?.previousWaterLog) {
        queryClient.setQueryData(['waterLog', date], context.previousWaterLog);
        // Also rollback logsRange cache if possible
        const cache = queryClient.getQueryCache();
        const rangeQueries = cache.findAll({ queryKey: ['logsRange'] });
        for (const rangeQuery of rangeQueries) {
          const rangeData = rangeQuery.state.data as Record<string, { meals: any[]; water: { glasses: number } }> | undefined;
          if (rangeData && rangeData[date]) {
            queryClient.setQueryData(rangeQuery.queryKey, {
              ...rangeData,
              [date]: {
                ...rangeData[date],
                water: { glasses: context.previousWaterLog.glasses }
              }
            });
            break;
          }
        }
      }
    },
    onSettled: () => {
      // Invalidate logsRange to refetch the range that contains this date
      queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      // Also invalidate waterLog query
      queryClient.invalidateQueries({ queryKey: ['waterLog', date] });
    },
  });

  // query.data is WaterLog | null (returned from queryFn)
  const waterLog = query.data;

  return {
    waterLog,
    isLoading: query.isLoading,
    error: query.error,
    glasses: waterLog?.glasses ?? 0,
    updateGlasses: mutation.mutate,
    isUpdating: mutation.isPending,
  };
};
