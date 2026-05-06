import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../store/authStore';

// Helper function to format date as YYYY-MM-DD
const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const useLogsRange = (dateStart: string, dateEnd: string) => {
  const { token } = useAuthStore();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['logsRange', dateStart, dateEnd],
    queryFn: async () => {
      const data = await apiClient.get(
        `/api/v1/logs?dateStart=${dateStart}&dateEnd=${dateEnd}&timezone=${encodeURIComponent(timezone)}`
      );
      return data;
    },
    enabled: !!token && !!dateStart && !!dateEnd,
    staleTime: 30 * 1000, // Cache for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });
  
  return query;
};

// Helper function to fetch logs range without hook (for manual fetching)
export const fetchLogsRange = async (
  dateStart: string,
  dateEnd: string,
  queryClient: any
): Promise<any> => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const data = await queryClient.fetchQuery({
    queryKey: ['logsRange', dateStart, dateEnd],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/v1/logs?dateStart=${dateStart}&dateEnd=${dateEnd}&timezone=${encodeURIComponent(timezone)}`
      );
      return response;
    },
    staleTime: 30 * 1000,
  });
  
  return data;
};
