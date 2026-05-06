import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { usePostHog } from 'posthog-react-native';
import { useAuthStore } from '../store/authStore';
import { apiClient, ApiError } from '../lib/api';
import { MealLog } from '../types/mealLog';
import { MealLogCard } from '../components/MealLogCard';

type FavoriteListRow = {
  id: string;
  name: string | null;
  description: string | null;
  logged_at: string | null;
  total_nutrition: MealLog['total_nutrition'];
  ingredients: MealLog['ingredients'];
  icon?: string;
  analysis_status?: MealLog['analysis_status'];
  photo_storage_paths?: string[] | null;
  updated_at?: string | null;
};

function rowToSyntheticMealLog(row: FavoriteListRow): MealLog {
  const stamp = row.updated_at ?? new Date().toISOString();
  const paths = (row.photo_storage_paths ?? []).filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    total_nutrition: row.total_nutrition ?? null,
    ingredients: row.ingredients ?? null,
    created_at: stamp,
    updated_at: stamp,
    logged_at: row.logged_at ?? undefined,
    photo_storage_paths: paths.length > 0 ? paths : undefined,
    icon: row.icon,
    analysis_status: row.analysis_status,
  };
}

export const FavoriteMealsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();
  const posthog = usePostHog();

  const { data: rows, isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const data = await apiClient.get('/api/v1/logs/favorites');
      return (data.meals ?? []) as FavoriteListRow[];
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });

  const meals = useMemo(() => (rows ?? []).map(rowToSyntheticMealLog), [rows]);

  const handleUnfavorite = useCallback(
    async (favoriteId: string) => {
      try {
        await apiClient.delete(`/api/v1/logs/favorites/${favoriteId}`);
        posthog.capture('favorite_meal_removed', { favorite_id: favoriteId });
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
      } catch (error) {
        console.error('Error removing favorite:', error);
        Alert.alert(
          'Error',
          error instanceof ApiError ? error.message : 'Failed to remove from favorites'
        );
      }
    },
    [queryClient, posthog]
  );

  const handleDetailPress = useCallback((mealLog: MealLog) => {
    router.push({
      pathname: '/favorite-meal-detail',
      params: { favoriteId: mealLog.id },
    });
  }, []);

  const handleEditMeal = useCallback((mealLog: MealLog) => {
    router.push({ pathname: '/chat', params: { favoriteId: mealLog.id, editFavorite: 'true' } });
  }, []);

  const handleEditMealInline = useCallback((mealLog: MealLog) => {
    router.push({ pathname: '/meal-log-edit', params: { favoriteId: mealLog.id } });
  }, []);

  const handleCreateFavorite = useCallback(() => {
    router.push({ pathname: '/chat', params: { createFavorite: 'true' } });
  }, []);

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
          <Text style={styles.headerTitle}>Favorite meals</Text>
        </View>
        <TouchableOpacity
          onPress={handleCreateFavorite}
          style={styles.headerAddButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Create new favorite meal"
        >
          <Plus size={22} color="#111827" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {isLoading && !rows ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 32,
          }}
          showsVerticalScrollIndicator={false}
        >
          {!meals.length ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No favorite meals yet</Text>
              <Text style={styles.emptySubtitle}>
                Use “Favorite this meal” from a meal card&apos;s menu to add some—and open them here anytime from
                Profile.
              </Text>
            </View>
          ) : (
            meals.map((mealLog) => (
              <MealLogCard
                key={mealLog.id}
                mealLog={mealLog}
                isFavorited
                hideLogTime
                onDetailPress={handleDetailPress}
                onEditMealInChat={handleEditMeal}
                onEditMealInline={handleEditMealInline}
                onUnfavorite={handleUnfavorite}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    backgroundColor: '#F3F4F6',
  },
  headerTextContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#101828',
  },
  headerAddButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    paddingTop: 8,
  },
  emptyContainer: {
    paddingVertical: 48,
    paddingHorizontal: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101828',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
});
