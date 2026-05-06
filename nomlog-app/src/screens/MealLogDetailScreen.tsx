import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useUserProfile } from '../hooks/useUserProfile';
import { useLogsRange } from '../hooks/useLogsRange';
import { MealLog } from '../types/mealLog';
import { MealLogCard } from '../components/MealLogCard';
import { apiClient, ApiError } from '../lib/api';

type Params = {
  dateString?: string | string[];
  mealType?: string | string[];
};

const getMealBucket = (log: MealLog): 'breakfast' | 'lunch' | 'dinner' | 'snack' => {
  const explicitType = log.meal_type?.toLowerCase();
  if (explicitType === 'breakfast' || explicitType === 'lunch' || explicitType === 'dinner' || explicitType === 'snack') {
    return explicitType;
  }

  const dateToUse = log.status === 'planned'
    ? (log.planned_for || log.created_at)
    : (log.logged_at || log.created_at);
  const hour = new Date(dateToUse).getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 21) return 'dinner';
  return 'snack';
};

const getMealLabel = (mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
  switch (mealType) {
    case 'breakfast':
      return 'Breakfast';
    case 'lunch':
      return 'Lunch';
    case 'dinner':
      return 'Dinner';
    case 'snack':
      return 'Snacks';
    default:
      return 'Meal';
  }
};

export const MealLogDetailScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const queryClient = useQueryClient();
  const { data: profile } = useUserProfile();

  const dateStringParam = Array.isArray(params.dateString) ? params.dateString[0] : params.dateString;
  const mealTypeParam = (Array.isArray(params.mealType) ? params.mealType[0] : params.mealType)?.toLowerCase() as
    | 'breakfast'
    | 'lunch'
    | 'dinner'
    | 'snack'
    | undefined;

  const dateString = dateStringParam || '';
  const mealType = mealTypeParam || 'breakfast';

  // Use hook data only — avoid reading query cache during render (would update DayContent)
  const { data: rangeData, isLoading } = useLogsRange(dateString, dateString);
  const dayDataForDate = rangeData?.[dateString];
  const allLogsForDay = (dayDataForDate?.meals || []) as MealLog[];

  const logsForMeal = useMemo(
    () => allLogsForDay.filter((log) => getMealBucket(log) === mealType),
    [allLogsForDay, mealType]
  );

  const dailyTotals = useMemo(() => {
    return logsForMeal.reduce(
      (totals, log) => {
        if (log?.status === 'planned') return totals;
        const nutrition = log.total_nutrition;
        return {
          calories: totals.calories + (nutrition?.calories || 0),
          protein: totals.protein + (nutrition?.protein || 0),
          carbohydrates: totals.carbohydrates + (nutrition?.carbohydrates || 0),
          fat: totals.fat + (nutrition?.fat || 0),
        };
      },
      { calories: 0, protein: 0, carbohydrates: 0, fat: 0 }
    );
  }, [logsForMeal]);

  const handleDeleteMealLog = useCallback(
    async (mealLogId: string) => {
      try {
        await apiClient.delete(`/api/v1/logs/${mealLogId}`);
        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
        Alert.alert('Success', 'Meal log deleted successfully');
      } catch (error) {
        console.error('Error deleting meal log:', error);
        Alert.alert(
          'Error',
          error instanceof ApiError ? error.message : 'Failed to delete meal log'
        );
      }
    },
    [queryClient]
  );

  const handleEditMealInChat = useCallback((mealLog: MealLog) => {
    router.push({ pathname: '/chat', params: { mealLogId: mealLog.id, editMeal: 'true' } });
  }, []);

  const handleEditMealInline = useCallback((mealLog: MealLog) => {
    router.push({ pathname: '/meal-log-edit', params: { mealLogId: mealLog.id } });
  }, []);

  const handleLogPlanned = useCallback(
    async (mealLog: MealLog) => {
      try {
        await apiClient.post(`/api/v1/logs/${mealLog.id}/log`);
        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      } catch (error) {
        console.error('Error logging planned meal:', error);
        Alert.alert(
          'Error',
          error instanceof ApiError ? error.message : 'Failed to log planned meal'
        );
      }
    },
    [queryClient]
  );

  const handleDetailPress = useCallback(
    (mealLog: MealLog) => {
      queryClient.setQueryData(['mealLog', mealLog.id], mealLog);
      router.push({
        pathname: '/meal-log-item-detail',
        params: { mealLogId: mealLog.id },
      });
    },
    [queryClient]
  );

  const handleViewRecipe = useCallback((mealLog: MealLog) => {
    if (!mealLog.recipe_id) {
      Alert.alert('Recipe unavailable', 'This planned meal does not have a linked recipe yet.');
      return;
    }

    router.push({
      pathname: '/recipe-detail',
      params: { recipeId: mealLog.recipe_id },
    });
  }, []);

  const handleFavorite = useCallback(
    async (mealLogId: string) => {
      try {
        await apiClient.post(`/api/v1/logs/${mealLogId}/favorite`);
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      } catch (error) {
        console.error('Error adding favorite:', error);
        Alert.alert(
          'Error',
          error instanceof ApiError ? error.message : 'Failed to add to favorites'
        );
      }
    },
    [queryClient]
  );

  const handleUnfavorite = useCallback(
    async (mealLogId: string) => {
      try {
        await apiClient.delete(`/api/v1/logs/${mealLogId}/favorite`);
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      } catch (error) {
        console.error('Error removing favorite:', error);
        Alert.alert(
          'Error',
          error instanceof ApiError ? error.message : 'Failed to remove from favorites'
        );
      }
    },
    [queryClient]
  );

  const formatDate = (dateStringValue: string) => {
    if (!dateStringValue) return '';
    const [year, month, day] = dateStringValue.split('-').map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isLoading && !dayDataForDate) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  const mealLabel = getMealLabel(mealType);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={20} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>{mealLabel}</Text>
          <Text style={styles.headerSubtitle}>{formatDate(dateString)}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => {
              router.push({ pathname: '/chat', params: { dateString, mealType } });
            }}
            style={styles.headerPlusButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Plus size={22} color="#111827" strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerCaloriesBlock}>
            <Text style={styles.headerCalories}>{Math.round(dailyTotals.calories)}</Text>
            <Text style={styles.headerCaloriesLabel}>calories</Text>
          </View>
        </View>
      </View>

      <View style={styles.summaryPillsRow}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryPillLabel}>Protein</Text>
          <Text style={styles.summaryPillValue}>
            {Math.round(dailyTotals.protein)}
            <Text style={styles.summaryPillUnit}>g</Text>
          </Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryPillLabel}>Carbs</Text>
          <Text style={styles.summaryPillValue}>
            {Math.round(dailyTotals.carbohydrates)}
            <Text style={styles.summaryPillUnit}>g</Text>
          </Text>
        </View>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryPillLabel}>Fat</Text>
          <Text style={styles.summaryPillValue}>
            {Math.round(dailyTotals.fat)}
            <Text style={styles.summaryPillUnit}>g</Text>
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {logsForMeal.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No meals logged</Text>
            <Text style={styles.emptySubtitle}>
              Tap the plus button above to log a meal.
            </Text>
          </View>
        ) : (
          logsForMeal.map((log) => (
            <MealLogCard
              key={log.id}
              mealLog={log}
              isFavorited={!!log.favorite_id}
              onDelete={handleDeleteMealLog}
              onEditMealInChat={handleEditMealInChat}
              onEditMealInline={handleEditMealInline}
              onDetailPress={handleDetailPress}
              onFavorite={handleFavorite}
              onUnfavorite={handleUnfavorite}
              onLogPlanned={handleLogPlanned}
              onViewRecipe={handleViewRecipe}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#F3F4F6',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#6B7280',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerPlusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  headerCaloriesBlock: {
    alignItems: 'flex-end',
  },
  headerCalories: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerCaloriesLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  summaryPillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  summaryPill: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  summaryPillLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  summaryPillValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  summaryPillUnit: {
    fontSize: 12,
    color: '#6B7280',
  },
  summaryPillGoal: {
    marginTop: 2,
    fontSize: 11,
    color: '#9CA3AF',
  },
  scrollView: {
    flex: 1,
    marginTop: 4,
  },
  emptyContainer: {
    marginTop: 32,
    paddingHorizontal: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
});

