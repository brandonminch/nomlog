import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
  Pressable,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, X } from 'lucide-react-native';
import { useAuthStore } from '../store/authStore';
import { apiClient, ApiError } from '../lib/api';
import { MealLog } from '../types/mealLog';
import {
  MealDetailTitleBlock,
  MealDetailIngredientsSection,
  MealDetailNutritionSections,
} from '../components/mealDetailShared';
import { MealLogOverflowMenu } from '../components/MealLogOverflowMenu';
import { getSignedMealPhotoUrls } from '../services/mealPhotoUpload';

type Params = {
  mealLogId?: string | string[];
};

const WINDOW = Dimensions.get('window');

export const MealLogItemDetailScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const mealLogId = Array.isArray(params.mealLogId) ? params.mealLogId[0] : params.mealLogId;

  const { data: mealLog, isLoading } = useQuery({
    queryKey: ['mealLog', mealLogId],
    queryFn: async () => {
      if (!mealLogId) return null;
      const data = await apiClient.get(`/api/v1/logs/${mealLogId}`);
      return data.log as MealLog;
    },
    enabled: !!token && !!mealLogId,
  });

  const handleDeleteMealLog = useCallback(
    async (id: string) => {
      try {
        await apiClient.delete(`/api/v1/logs/${id}`);
        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
        queryClient.removeQueries({ queryKey: ['mealLog', id] });
        Alert.alert('Success', 'Meal log deleted successfully');
        router.back();
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

  const handleEditMealInChat = useCallback((log: MealLog) => {
    router.push({ pathname: '/chat', params: { mealLogId: log.id, editMeal: 'true' } });
  }, []);

  const handleEditMealInline = useCallback((log: MealLog) => {
    router.push({ pathname: '/meal-log-edit', params: { mealLogId: log.id } });
  }, []);

  const handleFavorite = useCallback(
    async (id: string) => {
      try {
        await apiClient.post(`/api/v1/logs/${id}/favorite`);
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
        await queryClient.invalidateQueries({ queryKey: ['mealLog', id] });
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
    async (id: string) => {
      try {
        await apiClient.delete(`/api/v1/logs/${id}/favorite`);
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
        await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
        await queryClient.invalidateQueries({ queryKey: ['mealLog', id] });
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

  const renderHeader = (showMenu: boolean) => (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <ChevronLeft size={20} color="#111827" />
      </TouchableOpacity>
      {showMenu && mealLog ? (
        <>
          <View style={styles.headerSpacer} />
          <MealLogOverflowMenu
            mealLogId={mealLog.id}
            isFavorited={!!mealLog.favorite_id}
            onEditInChat={() => handleEditMealInChat(mealLog)}
            onEditInline={() => handleEditMealInline(mealLog)}
            editDisabled={analysisInProgress}
            onFavorite={handleFavorite}
            onUnfavorite={handleUnfavorite}
            onDelete={handleDeleteMealLog}
          />
        </>
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </View>
  );

  if (!mealLogId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {renderHeader(false)}
        <View style={styles.centered}>
          <Text style={styles.errorText}>Missing meal.</Text>
        </View>
      </View>
    );
  }

  if (isLoading && !mealLog) {
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
          <Text style={styles.errorText}>Could not load this meal.</Text>
        </View>
      </View>
    );
  }

  const analysisInProgress =
    mealLog.analysis_status === 'pending' || mealLog.analysis_status === 'analyzing';

  const mealPhotoPaths = useMemo(
    () =>
      (mealLog.photo_storage_paths ?? []).filter(
        (p): p is string => typeof p === 'string' && p.length > 0,
      ),
    [mealLog.photo_storage_paths],
  );

  const { data: mealPhotoUrls = [] } = useQuery({
    queryKey: ['mealLogPhotoUrls', mealLogId, mealPhotoPaths.join('\0')],
    queryFn: () => getSignedMealPhotoUrls(mealPhotoPaths),
    enabled: mealPhotoPaths.length > 0 && !!token,
    staleTime: 45 * 60 * 1000,
  });

  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null);
  const photoViewerScrollRef = useRef<ScrollView>(null);

  useLayoutEffect(() => {
    if (photoViewerIndex === null || mealPhotoUrls.length === 0) return;
    photoViewerScrollRef.current?.scrollTo({
      x: photoViewerIndex * WINDOW.width,
      animated: false,
    });
  }, [photoViewerIndex, mealPhotoUrls.length]);

  useEffect(() => {
    if (photoViewerIndex === null) return;
    StatusBar.setBarStyle('light-content', true);
    return () => {
      StatusBar.setBarStyle('dark-content', true);
    };
  }, [photoViewerIndex]);

  const closePhotoViewer = useCallback(() => setPhotoViewerIndex(null), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renderHeader(true)}

      {mealPhotoUrls.length > 0 ? (
        <View style={styles.headerPhotoStripWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.headerPhotoStripContent}
          >
            {mealPhotoUrls.map((uri, index) => (
              <Pressable
                key={`${uri}-${index}`}
                onPress={() => setPhotoViewerIndex(index)}
                style={({ pressed }) => [pressed && styles.headerPhotoThumbPressed]}
              >
                <Image source={{ uri }} style={styles.headerPhotoThumb} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Modal
        visible={photoViewerIndex !== null}
        animationType="fade"
        transparent
        onRequestClose={closePhotoViewer}
      >
        <View style={styles.photoViewerRoot}>
          <Pressable
            onPress={closePhotoViewer}
            style={[styles.photoViewerCloseButton, { top: insets.top + 8 }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <View style={styles.photoViewerCloseCircle}>
              <X size={22} color="#ffffff" strokeWidth={2} />
            </View>
          </Pressable>
          <ScrollView
            ref={photoViewerScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.photoViewerPager}
          >
            {mealPhotoUrls.map((uri, index) => (
              <View
                key={`viewer-${uri}-${index}`}
                style={[styles.photoViewerPage, { width: WINDOW.width, height: WINDOW.height }]}
              >
                <Image
                  source={{ uri }}
                  style={[styles.photoViewerImage, { height: WINDOW.height }]}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <MealDetailTitleBlock mealLog={mealLog} />
        <MealDetailIngredientsSection mealLog={mealLog} />
        <MealDetailNutritionSections mealLog={mealLog} />
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
  headerPhotoStripWrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  headerPhotoStripContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerPhotoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  headerPhotoThumbPressed: {
    opacity: 0.85,
  },
  photoViewerRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  photoViewerPager: {
    flex: 1,
  },
  photoViewerPage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerImage: {
    width: '100%',
  },
  photoViewerCloseButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  photoViewerCloseCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
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
});
