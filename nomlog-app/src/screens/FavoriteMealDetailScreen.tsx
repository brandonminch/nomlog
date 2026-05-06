import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';
import { useAuthStore } from '../store/authStore';
import { apiClient, ApiError } from '../lib/api';
import { favoriteToMealLog, type FavoriteDetailPayload } from '../utils/favoriteMealMapping';
import {
  MealDetailTitleBlock,
  MealDetailIngredientsSection,
  MealDetailNutritionSections,
} from '../components/mealDetailShared';
import { MealLogOverflowMenu } from '../components/MealLogOverflowMenu';

type Params = {
  favoriteId?: string | string[];
};

export const FavoriteMealDetailScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const favoriteId = Array.isArray(params.favoriteId) ? params.favoriteId[0] : params.favoriteId;

  const { data: favorite, isLoading } = useQuery({
    queryKey: ['favorite', favoriteId],
    queryFn: async () => {
      if (!favoriteId) return null;
      const data = await apiClient.get(`/api/v1/logs/favorites/${favoriteId}`);
      return data.favorite as FavoriteDetailPayload;
    },
    enabled: !!token && !!favoriteId,
  });

  const mealLog = useMemo(() => (favorite ? favoriteToMealLog(favorite) : null), [favorite]);

  const favoriteAnalyzing = useMemo(
    () =>
      mealLog?.analysis_status === 'pending' || mealLog?.analysis_status === 'analyzing',
    [mealLog],
  );

  const handleUnfavorite = useCallback(
    async (id: string) => {
      try {
        await apiClient.delete(`/api/v1/logs/favorites/${id}`);
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
        queryClient.removeQueries({ queryKey: ['favorite', id] });
        router.back();
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

  const handleEdit = useCallback(() => {
    if (!favoriteId) return;
    router.push({ pathname: '/chat', params: { favoriteId, editFavorite: 'true' } });
  }, [favoriteId]);

  const handleEditInline = useCallback(() => {
    if (!favoriteId) return;
    router.push({ pathname: '/meal-log-edit', params: { favoriteId } });
  }, [favoriteId]);

  const handleLogThisMeal = useCallback(() => {
    if (!favoriteId) return;
    router.push({ pathname: '/chat', params: { favoriteId } });
  }, [favoriteId]);

  const renderHeader = (showMenu: boolean) => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronLeft size={20} color="#111827" />
      </TouchableOpacity>
      {showMenu && favoriteId ? (
        <>
          <View style={styles.headerSpacer} />
          <MealLogOverflowMenu
            mealLogId={favoriteId}
            isFavorited
            onEditInChat={handleEdit}
            onEditInline={handleEditInline}
            editDisabled={!!favoriteAnalyzing}
            onUnfavorite={handleUnfavorite}
          />
        </>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );

  if (!favoriteId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderHeader(false)}
        <View style={styles.centered}>
          <Text style={styles.errorText}>Missing favorite.</Text>
        </View>
      </View>
    );
  }

  if (isLoading && !favorite) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderHeader(false)}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (!mealLog) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderHeader(false)}
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load this favorite.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renderHeader(true)}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <MealDetailTitleBlock mealLog={mealLog} variant="favoriteTemplate" />
        <MealDetailIngredientsSection mealLog={mealLog} />
        <MealDetailNutritionSections mealLog={mealLog} />
        <TouchableOpacity
          onPress={handleLogThisMeal}
          style={[styles.logThisMealButton, favoriteAnalyzing && styles.logThisMealButtonDisabled]}
          activeOpacity={0.85}
          disabled={favoriteAnalyzing}
          accessibilityRole="button"
          accessibilityLabel="Log this meal to your diary"
        >
          <Text style={styles.logThisMealButtonText}>Log this meal</Text>
        </TouchableOpacity>
      </ScrollView>
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
    backgroundColor: '#ffffff',
    zIndex: 20,
    elevation: 6,
  },
  headerSpacer: {
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  scroll: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  logThisMealButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  logThisMealButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  logThisMealButtonDisabled: {
    opacity: 0.5,
  },
});
