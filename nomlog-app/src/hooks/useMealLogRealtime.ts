import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../config/supabase';
import { useAuthStore } from '../store/authStore';

/**
 * Hook to subscribe to meal_logs table changes via Supabase Realtime
 * When a meal log's analysis_status changes (especially to 'completed'),
 * invalidates and refetches React Query cache to trigger a UI update
 */
export const useMealLogRealtime = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    console.log('[useMealLogRealtime] Setting up real-time subscription for user:', user.id);

    // #region agent log
    const dbg = (hypothesisId: string, message: string, data: Record<string, unknown>) => {
      fetch('http://127.0.0.1:7783/ingest/de5e5942-068a-4161-9272-a350434822f1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fd6a7d' },
        body: JSON.stringify({
          sessionId: 'fd6a7d',
          runId: 'pre-fix',
          hypothesisId,
          location: 'useMealLogRealtime.ts:effect',
          message,
          data,
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    };
    dbg('H3', 'effect_start', { hasSessionUser: !!user?.id });
    // #endregion

    const invalidateFavoriteTemplates = (reason: string) => {
      console.log(`[useMealLogRealtime] ${reason}, invalidating favorites queries`);
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({ queryKey: ['favorite'] });
    };

    // Create a channel for meal_logs updates
    const mealLogsChannel = supabase
      .channel(`meal_logs_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'meal_logs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newStatus = payload.new.analysis_status;
          const oldStatus = payload.old?.analysis_status;
          const hadIcon = !!payload.old?.icon;
          const hasIcon = !!payload.new.icon;
          const hasNutrition = !!payload.new.total_nutrition;
          
          console.log('[useMealLogRealtime] Meal log updated via realtime:', {
            id: payload.new.id,
            oldStatus,
            newStatus,
            statusChanged: oldStatus !== newStatus,
            iconAdded: !hadIcon && hasIcon,
            nutritionAdded: !payload.old?.total_nutrition && hasNutrition,
          });
          
          // Trigger update if:
          // 1. Analysis status changed (especially to completed/failed)
          // 2. Icon was just added (indicates analysis completed)
          // 3. Nutrition data was just added (indicates analysis completed)
          const shouldUpdate = 
            newStatus === 'completed' || 
            newStatus === 'failed' || 
            (oldStatus && oldStatus !== newStatus) ||
            (!hadIcon && hasIcon) ||
            (!payload.old?.total_nutrition && hasNutrition);
          
          if (shouldUpdate) {
            console.log('[useMealLogRealtime] Meal log analysis completed or updated, invalidating and refetching logs queries');
            // Invalidate all logsRange queries (this will match ['logsRange', dateStart, dateEnd] queries)
            // This marks them as stale and triggers refetch for active queries
            queryClient.invalidateQueries({ queryKey: ['logsRange'] });
            
            // Force refetch all logsRange queries (including inactive ones that might be in cache)
            const cache = queryClient.getQueryCache();
            const rangeQueries = cache.findAll({ queryKey: ['logsRange'] });
            console.log(`[useMealLogRealtime] Found ${rangeQueries.length} logsRange queries to refetch`);
            
            // Refetch all matching queries
            Promise.all(
              rangeQueries.map(query => queryClient.refetchQueries({ queryKey: query.queryKey }))
            ).then(() => {
              console.log('[useMealLogRealtime] All logsRange queries refetched');
            }).catch(err => {
              console.error('[useMealLogRealtime] Error refetching queries:', err);
            });
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[useMealLogRealtime] meal_logs subscription status:', status);
        // #region agent log
        dbg('H1', 'meal_logs_subscribe_cb', {
          channel: 'meal_logs',
          status,
          errType: err === undefined ? 'undefined' : typeof err,
          errMessage: err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : null,
          errString: err != null ? String(err) : null,
        });
        // #endregion
        if (status === 'SUBSCRIBED') {
          console.log('[useMealLogRealtime] Successfully subscribed to meal_logs changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error(
            '[useMealLogRealtime] meal_logs channel subscription error',
            err?.message ?? err
          );
        }
      });

    const mealsChannel = supabase
      .channel(`meals_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'meals',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newStatus = (payload.new as { analysis_status?: string }).analysis_status;
          const oldStatus = (payload.old as { analysis_status?: string } | undefined)?.analysis_status;
          const hadIcon = !!(payload.old as { icon?: string } | undefined)?.icon;
          const hasIcon = !!(payload.new as { icon?: string }).icon;
          const hasNutrition = !!(payload.new as { total_nutrition?: unknown }).total_nutrition;

          const shouldUpdate =
            newStatus === 'completed' ||
            newStatus === 'failed' ||
            (oldStatus != null && oldStatus !== newStatus) ||
            (!hadIcon && hasIcon) ||
            (!(payload.old as { total_nutrition?: unknown } | undefined)?.total_nutrition && hasNutrition);

          if (shouldUpdate) {
            invalidateFavoriteTemplates('Meal template updated via realtime');
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[useMealLogRealtime] meals subscription status:', status);
        // #region agent log
        dbg('H2', 'meals_subscribe_cb', {
          channel: 'meals',
          status,
          errType: err === undefined ? 'undefined' : typeof err,
          errMessage: err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : null,
          errString: err != null ? String(err) : null,
        });
        // #endregion
        if (status === 'CHANNEL_ERROR') {
          console.error(
            '[useMealLogRealtime] meals channel subscription error',
            err?.message ?? err
          );
        }
      });

    return () => {
      // Cleanup: unsubscribe when component unmounts or user changes
      console.log('[useMealLogRealtime] Cleaning up subscription');
      supabase.removeChannel(mealLogsChannel);
      supabase.removeChannel(mealsChannel);
    };
  }, [user?.id, queryClient]);
};






