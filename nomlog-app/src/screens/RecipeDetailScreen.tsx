import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ExternalLink, Clock } from 'lucide-react-native';
import { apiClient } from '../lib/api';

type RecipeDetail = {
  id: string;
  title: string;
  summary?: string | null;
  sourceName: string;
  sourceKey: string;
  canonicalUrl: string;
  yieldText?: string | null;
  totalTimeMinutes?: number | null;
  nutrition?: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fat?: number;
  } | null;
  ingredients: Array<{
    text: string;
    name?: string;
    amount?: number;
    unit?: string;
  }>;
  instructions: Array<{
    title?: string;
    text: string;
    position?: number;
  }>;
};

export const RecipeDetailScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ recipeId?: string | string[] }>();
  const recipeId = Array.isArray(params.recipeId) ? params.recipeId[0] : params.recipeId;

  const { data: recipe, isLoading, isError, error } = useQuery({
    queryKey: ['recipeDetail', recipeId],
    queryFn: async () => {
      if (!recipeId) return null;
      const data = await apiClient.get(`/api/v1/recipes/${recipeId}`);
      return (data.recipe || null) as RecipeDetail | null;
    },
    enabled: !!recipeId,
    retry: false,
  });

  if (!recipeId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Recipe not found.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7c3aed" />
        </View>
      </View>
    );
  }

  if (isError || !recipe) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Unable to load recipe</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Please try again.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={20} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Recipe
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{recipe.title}</Text>
        <Text style={styles.source}>From {recipe.sourceName}</Text>

        {recipe.summary ? <Text style={styles.summary}>{recipe.summary}</Text> : null}

        <View style={styles.metaRow}>
          {recipe.yieldText ? <Text style={styles.metaChip}>{recipe.yieldText}</Text> : null}
          {recipe.totalTimeMinutes ? (
            <View style={styles.metaChipRow}>
              <Clock size={13} color="#6b7280" strokeWidth={2} />
              <Text style={styles.metaChip}>{recipe.totalTimeMinutes} min</Text>
            </View>
          ) : null}
        </View>

        {recipe.nutrition ? (
          <View style={styles.nutritionRow}>
            {recipe.nutrition.calories != null ? <Text style={styles.nutritionChip}>{Math.round(recipe.nutrition.calories)} cal</Text> : null}
            {recipe.nutrition.protein != null ? <Text style={styles.nutritionChip}>{Math.round(recipe.nutrition.protein)}g protein</Text> : null}
            {recipe.nutrition.carbohydrates != null ? <Text style={styles.nutritionChip}>{Math.round(recipe.nutrition.carbohydrates)}g carbs</Text> : null}
            {recipe.nutrition.fat != null ? <Text style={styles.nutritionChip}>{Math.round(recipe.nutrition.fat)}g fat</Text> : null}
          </View>
        ) : null}

        {recipe.ingredients?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            {recipe.ingredients.map((ingredient, idx) => (
              <Text key={`${ingredient.text}-${idx}`} style={styles.listItem}>
                {`\u2022 ${ingredient.text}`}
              </Text>
            ))}
          </View>
        ) : null}

        {recipe.instructions?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {recipe.instructions.map((step, idx) => (
              <View key={`${step.position || idx}-${step.text.slice(0, 16)}`} style={styles.stepRow}>
                <Text style={styles.stepIndex}>{idx + 1}.</Text>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {recipe.sourceKey !== 'internal' ? (
          <TouchableOpacity
            style={styles.openSourceButton}
            onPress={async () => {
              try {
                const canOpen = await Linking.canOpenURL(recipe.canonicalUrl);
                if (!canOpen) {
                  Alert.alert('Unable to open link', 'Your device cannot open this recipe URL.');
                  return;
                }
                await Linking.openURL(recipe.canonicalUrl);
              } catch {
                Alert.alert('Unable to open link', 'Please try again.');
              }
            }}
            activeOpacity={0.8}
          >
            <ExternalLink size={16} color="#7c3aed" strokeWidth={2} />
            <Text style={styles.openSourceButtonText}>Open source website</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSpacer: { width: 34 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  source: { fontSize: 13, color: '#6b7280' },
  summary: { fontSize: 15, color: '#374151', lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#f3f4f6',
  },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#f3f4f6',
    color: '#374151',
    fontSize: 13,
  },
  nutritionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nutritionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#f5f3ff',
    color: '#6d28d9',
    fontSize: 13,
    fontWeight: '500',
  },
  section: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  listItem: { fontSize: 14, color: '#374151', lineHeight: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stepIndex: { fontSize: 14, fontWeight: '600', color: '#6b7280', marginTop: 1 },
  stepText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  openSourceButton: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    borderRadius: 12,
    backgroundColor: '#faf5ff',
    paddingVertical: 12,
  },
  openSourceButtonText: { fontSize: 14, color: '#7c3aed', fontWeight: '500' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 6 },
  errorText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
});

