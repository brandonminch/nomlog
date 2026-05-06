import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { ChevronDown, ChevronLeft, X, ImagePlus } from 'lucide-react-native';
import { useAuthStore } from '../store/authStore';
import { apiClient, ApiError } from '../lib/api';
import { MealLog, Nutrition } from '../types/mealLog';
import { getSignedMealPhotoUrls, uploadMealPhotoToStorage } from '../services/mealPhotoUpload';
import { useInferredMealType } from '../components/mealDetailShared';
import { SummaryOptionPicker } from '../components/SummaryOptionPicker';
import type { MealTypeTag } from '../utils/mealLogContext';
import { favoriteToMealLog, type FavoriteDetailPayload } from '../utils/favoriteMealMapping';

const MAX_MEAL_PHOTOS = 4;

type NutritionDraft = Record<keyof Nutrition, string>;

const NUTRITION_KEYS: (keyof Nutrition)[] = [
  'calories',
  'protein',
  'carbohydrates',
  'fat',
  'saturatedFat',
  'fiber',
  'sugar',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'magnesium',
  'vitaminA',
  'vitaminC',
  'vitaminD',
  'cholesterol',
];

const FIELD_META: Record<
  keyof Nutrition,
  { label: string; unit: string }
> = {
  calories: { label: 'Calories', unit: 'kcal' },
  protein: { label: 'Protein', unit: 'g' },
  carbohydrates: { label: 'Carbohydrates', unit: 'g' },
  fat: { label: 'Fat', unit: 'g' },
  saturatedFat: { label: 'Saturated fat', unit: 'g' },
  fiber: { label: 'Fiber', unit: 'g' },
  sugar: { label: 'Sugar', unit: 'g' },
  sodium: { label: 'Sodium', unit: 'mg' },
  potassium: { label: 'Potassium', unit: 'mg' },
  calcium: { label: 'Calcium', unit: 'mg' },
  iron: { label: 'Iron', unit: 'mg' },
  magnesium: { label: 'Magnesium', unit: 'mg' },
  vitaminA: { label: 'Vitamin A', unit: 'mcg' },
  vitaminC: { label: 'Vitamin C', unit: 'mg' },
  vitaminD: { label: 'Vitamin D', unit: 'mcg' },
  cholesterol: { label: 'Cholesterol', unit: 'mg' },
};

function emptyNutritionDraft(): NutritionDraft {
  const d = {} as NutritionDraft;
  for (const k of NUTRITION_KEYS) {
    d[k] = '';
  }
  return d;
}

function nutritionFromMeal(n: Nutrition | null | undefined): NutritionDraft {
  const d = emptyNutritionDraft();
  if (!n) return d;
  for (const k of NUTRITION_KEYS) {
    const v = n[k];
    d[k] = v !== undefined && v !== null && Number.isFinite(v) ? String(v) : '';
  }
  return d;
}

function parseNutritionDraft(draft: NutritionDraft): Nutrition {
  const out = {} as Nutrition;
  for (const k of NUTRITION_KEYS) {
    const raw = draft[k].trim();
    const n = parseFloat(raw);
    out[k] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

type FormBaseline = {
  name: string;
  description: string;
  photoPaths: string[];
  nutrition: Nutrition;
  /** Present only when editing a real meal log (not a favorite template). */
  mealType?: MealTypeTag;
};

const MEAL_TYPE_OPTIONS: { id: MealTypeTag; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
];

function mealTypeTagFromLog(mealLog: MealLog, inferred: string): MealTypeTag {
  const t = mealLog.meal_type?.toLowerCase();
  if (t === 'breakfast' || t === 'lunch' || t === 'dinner' || t === 'snack') return t;
  return inferred as MealTypeTag;
}

type Params = { mealLogId?: string | string[]; favoriteId?: string | string[] };

export const MealLogEditScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const params = useLocalSearchParams<Params>();
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const rawMealLogId = Array.isArray(params.mealLogId) ? params.mealLogId[0] : params.mealLogId;
  const rawFavoriteId = Array.isArray(params.favoriteId) ? params.favoriteId[0] : params.favoriteId;
  /** If both are passed, meal log wins (avoid ambiguous dual-edit). */
  const editMealLogId = rawMealLogId || undefined;
  const editFavoriteId = editMealLogId ? undefined : rawFavoriteId || undefined;

  /** When set, a successful save dispatches this action instead of `router.back()` (leave-after-save flow). */
  const pendingNavigationRef = useRef<unknown>(null);

  const { data: mealLog, isLoading: loadingMealLog } = useQuery({
    queryKey: ['mealLog', editMealLogId],
    queryFn: async () => {
      if (!editMealLogId) return null;
      const data = await apiClient.get(`/api/v1/logs/${editMealLogId}`);
      return data.log as MealLog;
    },
    enabled: !!token && !!editMealLogId,
  });

  const { data: favoritePayload, isLoading: loadingFavorite } = useQuery({
    queryKey: ['favorite', editFavoriteId],
    queryFn: async () => {
      if (!editFavoriteId) return null;
      const data = await apiClient.get(`/api/v1/logs/favorites/${editFavoriteId}`);
      return data.favorite as FavoriteDetailPayload;
    },
    enabled: !!token && !!editFavoriteId,
  });

  const hydratingMeal: MealLog | null = useMemo(() => {
    if (editMealLogId) return mealLog ?? null;
    if (editFavoriteId && favoritePayload) return favoriteToMealLog(favoritePayload);
    return null;
  }, [editMealLogId, editFavoriteId, mealLog, favoritePayload]);

  const inferredType = useInferredMealType(editMealLogId ? hydratingMeal : null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [nutritionDraft, setNutritionDraft] = useState<NutritionDraft>(() => emptyNutritionDraft());
  const [mealType, setMealType] = useState<MealTypeTag>('snack');
  const [mealTypePickerOpen, setMealTypePickerOpen] = useState(false);
  const [baseline, setBaseline] = useState<FormBaseline | null>(null);

  const hydrateKeyRef = useRef<string>('');
  useEffect(() => {
    if (!hydratingMeal) return;
    const k = editFavoriteId
      ? `fav:${favoritePayload?.id ?? ''}:${favoritePayload?.updated_at ?? ''}`
      : `log:${hydratingMeal.id}:${hydratingMeal.updated_at ?? ''}`;
    if (hydrateKeyRef.current === k) return;
    hydrateKeyRef.current = k;
    const paths = (hydratingMeal.photo_storage_paths ?? []).filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    const draft = nutritionFromMeal(hydratingMeal.total_nutrition);
    const resolvedMealType = mealTypeTagFromLog(hydratingMeal, inferredType);
    setName(hydratingMeal.name ?? '');
    setDescription(hydratingMeal.description ?? '');
    setPhotoPaths(paths);
    setNutritionDraft(draft);
    setMealType(resolvedMealType);
    setBaseline({
      name: (hydratingMeal.name ?? '').trim(),
      description: (hydratingMeal.description ?? '').trim(),
      photoPaths: [...paths],
      nutrition: parseNutritionDraft(draft),
      ...(editMealLogId ? { mealType: resolvedMealType } : {}),
    });
  }, [hydratingMeal, inferredType, editMealLogId, editFavoriteId, favoritePayload?.id, favoritePayload?.updated_at]);

  const photoUrlQueryId = editMealLogId ?? editFavoriteId ?? '';
  const { data: photoUrlByPath = {} } = useQuery({
    queryKey: ['mealLogEditPhotoUrls', photoUrlQueryId, photoPaths.join('\0')],
    queryFn: async () => {
      const entries = await Promise.all(
        photoPaths.map(async (path) => {
          const [url] = await getSignedMealPhotoUrls([path]);
          return [path, url ?? null] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, string | null>;
    },
    enabled: photoPaths.length > 0 && !!token,
    staleTime: 45 * 60 * 1000,
  });

  const setNutField = useCallback((key: keyof Nutrition, value: string) => {
    setNutritionDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const removePhotoAt = useCallback((index: number) => {
    setPhotoPaths((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addPhoto = useCallback(async () => {
    if (photoPaths.length >= MAX_MEAL_PHOTOS) {
      Alert.alert('Photo limit', `You can attach up to ${MAX_MEAL_PHOTOS} photos per meal.`);
      return;
    }
    const before = await ImagePicker.getMediaLibraryPermissionsAsync();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      const actions =
        permission.canAskAgain === false
          ? [
              { text: 'Cancel', style: 'cancel' as const },
              {
                text: 'Open Settings',
                onPress: () => {
                  void Linking.openSettings();
                },
              },
            ]
          : [{ text: 'OK', style: 'default' as const }];
      Alert.alert(
        'Photos access needed',
        `Photos permission is "${permission.status}" (was "${before.status}"). Enable library access to attach a photo.`,
        actions,
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
      exif: false,
      selectionLimit: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    try {
      const { path } = await uploadMealPhotoToStorage({
        localUri: asset.uri,
        mimeType: asset.mimeType ?? null,
        fileName: asset.fileName ?? null,
      });
      setPhotoPaths((prev) => [...prev, path].slice(0, MAX_MEAL_PHOTOS));
    } catch (e) {
      console.error('[MealLogEdit] photo upload', e);
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload photo.');
    }
  }, [photoPaths.length]);

  const { mutate: saveFavoriteTemplate, isPending: isSavingFavorite } = useMutation({
    mutationFn: async () => {
      if (!editFavoriteId) throw new Error('Missing favorite');
      const totalNutrition = parseNutritionDraft(nutritionDraft);
      await apiClient.patch(`/api/v1/logs/favorites/${editFavoriteId}`, {
        name: name.trim() || 'Meal',
        description: description.trim(),
        totalNutrition,
        photoStoragePaths: photoPaths.length > 0 ? photoPaths : [],
        skipAnalysis: true,
        skipIconSelection: true,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['favorites'] });
      await queryClient.invalidateQueries({ queryKey: ['favorite', editFavoriteId] });
      const pending = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      if (pending != null) {
        navigation.dispatch(pending as never);
      } else {
        router.back();
      }
    },
    onError: (error: unknown) => {
      pendingNavigationRef.current = null;
      console.error('[MealLogEdit] save favorite', error);
      Alert.alert(
        'Error',
        error instanceof ApiError ? error.message : 'Failed to save favorite',
      );
    },
  });

  const { mutate: saveMeal, isPending: isSavingMeal } = useMutation({
    mutationFn: async (opts: { unlinkFavorite?: boolean; syncFavoriteTemplate?: boolean }) => {
      if (!mealLog || !editMealLogId) throw new Error('Missing meal');
      const totalNutrition = parseNutritionDraft(nutritionDraft);
      const body: Record<string, unknown> = {
        name: name.trim() || 'Meal',
        description: description.trim(),
        totalNutrition,
        photoStoragePaths: photoPaths.length > 0 ? photoPaths : [],
        mealType,
        skipAnalysis: true,
        skipIconSelection: true,
      };
      if (opts.unlinkFavorite) body.unlinkFavorite = true;

      await apiClient.patch(`/api/v1/logs/${editMealLogId}`, body);

      if (opts.syncFavoriteTemplate && mealLog.favorite_id) {
        await apiClient.patch(`/api/v1/logs/favorites/${mealLog.favorite_id}`, {
          name: body.name,
          description: body.description,
          totalNutrition,
          ingredients: mealLog.ingredients,
          photoStoragePaths: photoPaths.length > 0 ? photoPaths : [],
          skipAnalysis: true,
          skipIconSelection: true,
        });
      }
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      await queryClient.invalidateQueries({ queryKey: ['mealLog', editMealLogId] });
      if (variables?.syncFavoriteTemplate && mealLog?.favorite_id) {
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
        await queryClient.invalidateQueries({ queryKey: ['favorite', mealLog.favorite_id] });
      }
      const pending = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      if (pending != null) {
        navigation.dispatch(pending as never);
      } else {
        router.back();
      }
    },
    onError: (error: unknown) => {
      pendingNavigationRef.current = null;
      console.error('[MealLogEdit] save', error);
      Alert.alert(
        'Error',
        error instanceof ApiError ? error.message : 'Failed to save meal',
      );
    },
  });

  const isSaving = isSavingFavorite || isSavingMeal;

  const saveMealInternal = useCallback(() => {
    if (editFavoriteId) {
      saveFavoriteTemplate();
      return;
    }
    if (!mealLog) return;
    if (mealLog.favorite_id) {
      Alert.alert(
        'Favorite meal',
        'This meal log is linked to a favorite. Update the favorite template as well, or update only this log?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              pendingNavigationRef.current = null;
            },
          },
          {
            text: 'Update favorite and this log',
            onPress: () => saveMeal({ syncFavoriteTemplate: true }),
          },
          {
            text: 'Update this log only',
            onPress: () => saveMeal({ unlinkFavorite: true }),
          },
        ],
      );
      return;
    }
    saveMeal({});
  }, [editFavoriteId, mealLog, saveMeal, saveFavoriteTemplate]);

  const onPressSaveHeader = useCallback(() => {
    pendingNavigationRef.current = null;
    saveMealInternal();
  }, [saveMealInternal]);

  const analysisInProgress =
    hydratingMeal?.analysis_status === 'pending' || hydratingMeal?.analysis_status === 'analyzing';

  const isDirty = useMemo(() => {
    if (!baseline || analysisInProgress) return false;
    if (name.trim() !== baseline.name) return true;
    if (description.trim() !== baseline.description) return true;
    if (baseline.mealType !== undefined && mealType !== baseline.mealType) return true;
    if (photoPaths.length !== baseline.photoPaths.length) return true;
    for (let i = 0; i < photoPaths.length; i++) {
      if (photoPaths[i] !== baseline.photoPaths[i]) return true;
    }
    const n = parseNutritionDraft(nutritionDraft);
    for (const key of NUTRITION_KEYS) {
      if (n[key] !== baseline.nutrition[key]) return true;
    }
    return false;
  }, [baseline, name, description, photoPaths, nutritionDraft, mealType, analysisInProgress]);

  usePreventRemove(isDirty && !isSaving, ({ data }) => {
    Alert.alert(
      'Unsaved changes',
      'Save your changes before leaving?',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: "Don't save",
          style: 'destructive',
          onPress: () => {
            Keyboard.dismiss();
            pendingNavigationRef.current = null;
            navigation.dispatch(data.action);
          },
        },
        {
          text: 'Save',
          onPress: () => {
            Keyboard.dismiss();
            pendingNavigationRef.current = data.action;
            saveMealInternal();
          },
        },
      ],
    );
  });

  if (!editMealLogId && !editFavoriteId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Missing meal or favorite.</Text>
      </View>
    );
  }

  const isLoading =
    (editMealLogId && loadingMealLog && !mealLog) ||
    (editFavoriteId && loadingFavorite && !favoritePayload);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!hydratingMeal) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Could not load this meal.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={20} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit manually</Text>
          <TouchableOpacity
            onPress={onPressSaveHeader}
            style={[styles.saveButton, (isSaving || analysisInProgress) && styles.saveButtonDisabled]}
            disabled={isSaving || analysisInProgress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#9810fa" />
            ) : (
              <Text
                style={[
                  styles.saveButtonText,
                  analysisInProgress && styles.saveButtonTextDisabled,
                ]}
              >
                Save
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {analysisInProgress ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              Nutrition analysis is still in progress. Try again in a moment.
            </Text>
          </View>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 32,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Meal name"
            placeholderTextColor="#9ca3af"
            editable={!analysisInProgress}
          />

          <Text style={[styles.label, styles.labelSpacing]}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What did you eat?"
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
            editable={!analysisInProgress}
          />

          {editMealLogId ? (
            <>
              <Text style={[styles.label, styles.labelSpacing]}>Meal type</Text>
              <TouchableOpacity
                style={styles.selectRow}
                onPress={() => setMealTypePickerOpen(true)}
                disabled={analysisInProgress}
                activeOpacity={0.7}
              >
                <Text style={styles.selectRowValue}>
                  {MEAL_TYPE_OPTIONS.find((o) => o.id === mealType)?.label ?? mealType}
                </Text>
                <ChevronDown size={20} color="#6b7280" strokeWidth={2} />
              </TouchableOpacity>

              <SummaryOptionPicker
                visible={mealTypePickerOpen}
                title="Meal type"
                options={MEAL_TYPE_OPTIONS}
                selectedId={mealType}
                onSelect={setMealType}
                onClose={() => setMealTypePickerOpen(false)}
              />
            </>
          ) : null}

          <Text style={[styles.label, styles.labelSpacing]}>Photos</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            {photoPaths.map((path, i) => {
              const uri = photoUrlByPath[path];
              return (
                <View key={`${path}-${i}`} style={styles.photoTile}>
                  {uri ? (
                    <Image source={{ uri }} style={styles.photoImage} />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <ActivityIndicator size="small" color="#6b7280" />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => removePhotoAt(i)}
                    hitSlop={8}
                    disabled={analysisInProgress}
                  >
                    <X size={14} color="#fff" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              );
            })}
            {photoPaths.length < MAX_MEAL_PHOTOS ? (
              <TouchableOpacity
                style={styles.addPhotoTile}
                onPress={() => void addPhoto()}
                disabled={analysisInProgress}
              >
                <ImagePlus size={28} color="#6b7280" strokeWidth={1.75} />
                <Text style={styles.addPhotoLabel}>Add</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          <Text style={[styles.sectionHeader, styles.labelSpacing]}>Nutrition</Text>
          {NUTRITION_KEYS.map((key) => {
            const meta = FIELD_META[key];
            return (
              <View key={key} style={styles.nutRow}>
                <Text style={styles.nutLabel} numberOfLines={1}>
                  {meta.label}
                  <Text style={styles.nutUnit}> ({meta.unit})</Text>
                </Text>
                <TextInput
                  style={styles.nutInput}
                  value={nutritionDraft[key]}
                  onChangeText={(t) => setNutField(key, t)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  editable={!analysisInProgress}
                />
              </View>
            );
          })}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#ffffff' },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  saveButton: {
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9810fa',
  },
  saveButtonTextDisabled: {
    color: '#9ca3af',
  },
  banner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  bannerText: {
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
  },
  scroll: { flex: 1 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  labelSpacing: {
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  inputMultiline: {
    minHeight: 100,
    paddingTop: 12,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  selectRowValue: {
    fontSize: 16,
    color: '#111827',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  photoTile: {
    position: 'relative',
  },
  photoImage: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  photoPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoTile: {
    width: 88,
    height: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
    gap: 4,
  },
  addPhotoLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6a7282',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  nutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  nutLabel: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    marginRight: 12,
  },
  nutUnit: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '400',
  },
  nutInput: {
    width: 100,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    color: '#111827',
    textAlign: 'right',
    backgroundColor: '#fff',
  },
  errorText: {
    fontSize: 15,
    color: '#dc2626',
    textAlign: 'center',
    padding: 24,
  },
});
