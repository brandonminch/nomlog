import React, { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Text,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  AppState,
  AppStateStatus,
  Dimensions,
  Linking,
  Image,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient as MealLogGradient } from 'expo-linear-gradient';
import { Coffee, Sun, Moon, Apple, Clock, Star, CirclePlus, ChevronDown, ChevronUp, Zap, Dumbbell, Utensils, Wheat, Droplet, Trash2, MessageCircle, RefreshCcw, BookOpen, Check, CheckSquare, Square } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useNavigation, usePreventRemove, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { formatMealDate } from '../utils/dateFormat';
import { mealDescriptionFromIngredients } from '../utils/mealDescriptionFromIngredients';
import { sharedStyles } from '../components/mealDetailShared';
import { parseChatLoggerParam, parseChatModeParam, type ChatMode, type LoggerKind } from '../utils/chatRouteParams';
import { ServingAmountPicker } from '../components/ServingAmountPicker';
import { ChatComposer, type ComposerPhotoAttachment } from '../components/ChatComposer';
import {
  ChatAnswersCarousel,
  type ChatAnswersCarouselQuestion,
  type ChatAnswersCarouselAnswer,
} from '@/components/ChatAnswersCarousel';
import { ActivityImportLogger } from '../components/ActivityImportLogger';
import { ActivityChatSummaryCard } from '../components/ActivityChatSummaryCard';
import { ensureActivityHealthKit } from '../lib/healthkit';
import type { ActivitySummary } from '../types/activitySummary';
import { activitySummaryItemsToExerciseSegments } from '../utils/activitySummaryMapping';
import { validateManualExerciseSegments } from '../utils/activityValidation';
// MealSuggestionCard import removed - search/recommendations disabled
import { usePostHog } from 'posthog-react-native';
import { useAuthStore } from '../store/authStore';
import { useChatAsyncStore } from '../store/chatAsyncStore';
import { useUserProfile } from '../hooks/useUserProfile';
import { apiClient, ApiError, AbortedRequestError } from '../lib/api';
import { LoadingDots } from '../components/LoadingDots';
import { uploadMealPhotoToStorage } from '../services/mealPhotoUpload';

type MealTextEdit = { name: string; description: string };

type ConversationSummary = {
  name: string;
  description: string;
  questionSummary?: string;
  ingredients: {
    name: string;
    servingAmount: number;
    servingUnit: string;
    servingSizeGrams: number;
    provenance?: { source: 'brand_api' | 'usda' | 'recipe' | 'llm_estimate'; id?: string; confidence?: 'low' | 'medium' | 'high' };
  }[];
  questions?: { id: string; text: string; kind: 'portion' | 'brand' | 'prep' | 'misc'; options?: string[] }[];
  assumptions?: string[];
};

function getQuestionSummaryText(
  summaryText: string | undefined,
  questions: Array<{ text: string }>
): string {
  const fromApi = (summaryText || '').trim();
  if (fromApi.length > 0) return fromApi;
  if (questions.length === 1) return questions[0]?.text || 'Clarification';
  if (questions.length > 1) return 'A few quick clarifications before I continue:';
  return 'Clarification';
}

function isLlmQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 429) return false;

  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('llm token budget exceeded') ||
    msg.includes('token budget exceeded') ||
    msg.includes('quota exceeded')
  );
}

function showLlmQuotaExceededAlert(): void {
  Alert.alert(
    'Daily limit reached',
    "You've hit your daily token limit for chat. Upgrade your membership or try again tomorrow."
  );
}

function sanitizeClarificationSuggestions(options?: string[] | null): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim())
    .filter((s) => {
      const normalized = s.toLowerCase().replace(/[\s_\-()/:.]+/g, '');
      return (
        normalized !== 'other' &&
        normalized !== 'others' &&
        !normalized.startsWith('otherspecify') &&
        normalized !== 'somethingelse' &&
        normalized !== 'anythingelse' &&
        normalized !== 'custom'
      );
    })
    .slice(0, 5);
}

function shouldUseClarificationsCarousel(questions: ChatAnswersCarouselQuestion[]): boolean {
  if (!Array.isArray(questions) || questions.length === 0) return false;
  if (questions.length > 1) return true;
  return sanitizeClarificationSuggestions(questions[0]?.suggestions).length > 0;
}

/** Stable comparison for deduping analysis results (edit mode appends new bubbles; skip true no-ops). */
function conversationSummaryFingerprint(summary: ConversationSummary): string {
  return `${summary.name}\0${summary.description}\0${JSON.stringify(summary.ingredients ?? [])}`;
}

const MIN_SERVING_EPSILON = 1e-6;

function scaleServingSizeGrams(
  originalAmount: number,
  originalGrams: number,
  newAmount: number
): number {
  if (newAmount <= MIN_SERVING_EPSILON) return 0;
  if (originalAmount <= MIN_SERVING_EPSILON) return Math.round(originalGrams);
  return Math.round(originalGrams * (newAmount / originalAmount));
}

function dropZeroServingIngredients<T extends { servingAmount: number }>(ingredients: T[]): T[] {
  return ingredients.filter((ing) => ing.servingAmount > MIN_SERVING_EPSILON);
}

type Message = {
  id: string;
  text?: string;
  isUser: boolean;
  timestamp: Date;
  type?: 'text' | 'question' | 'analysis' | 'plannerSuggestions' | 'plannerWeek';
  photo?: {
    localUri: string;
    storagePath?: string | null;
  };
  analysis?: ConversationSummary;
  /** Workout summary card (activity logger); mutually exclusive with `analysis` for meal. */
  activitySummary?: ActivitySummary;
  suggestions?: string[];
  plannerSuggestions?: PlannerSuggestionOption[];
  plannerWeek?: PlannerWeekDay[];
  plannerPersonalizationNote?: string;
  plannerCanPersonalize?: boolean;
  plannerPrompt?: string;
};

type PendingMealPhoto = {
  id: string;
  localUri: string;
  mimeType?: string | null;
  fileName?: string | null;
  storagePath: string | null;
  status: 'uploading' | 'uploaded' | 'failed';
  error: string | null;
};

/** Composer limit per send; backend still accepts multiple paths for forward compatibility. */
const MAX_MEAL_PHOTOS_PER_CHAT_MESSAGE = 1;

/**
 * When edit-meal follow-up analysis returns from the LLM, keep the user's typed name/description
 * from the prior analysis card unless they never opened those fields (no mealTextEdits entry).
 */
function mergeEditModePreservedMealText(
  incoming: ConversationSummary,
  isEditMealMode: boolean,
  priorMessages: Message[],
  mealTextEdits: Map<string, MealTextEdit>
): {
  merged: ConversationSummary;
  migrateFromId: string | null;
  migratePayload: MealTextEdit | null;
} {
  if (!isEditMealMode) {
    return { merged: incoming, migrateFromId: null, migratePayload: null };
  }
  const lastAnalysis = [...priorMessages].reverse().find((m) => m.type === 'analysis' && m.analysis);
  if (!lastAnalysis?.id) {
    return { merged: incoming, migrateFromId: null, migratePayload: null };
  }
  const preserved = mealTextEdits.get(lastAnalysis.id);
  if (!preserved) {
    return { merged: incoming, migrateFromId: null, migratePayload: null };
  }
  return {
    merged: {
      ...incoming,
      name: preserved.name,
      description: preserved.description,
    },
    migrateFromId: lastAnalysis.id,
    migratePayload: preserved,
  };
}

/** Log flow (non-edit): preserve only customized meal name across LLM refinements; description stays model-driven. */
function mergeNonEditPreservedMealName(
  incoming: ConversationSummary,
  priorMessages: Message[],
  mealTextEdits: Map<string, MealTextEdit>
): {
  merged: ConversationSummary;
  migrateFromId: string | null;
  migratePayload: MealTextEdit | null;
} {
  const lastAnalysis = [...priorMessages].reverse().find((m) => m.type === 'analysis' && m.analysis);
  if (!lastAnalysis?.id || !lastAnalysis.analysis) {
    return { merged: incoming, migrateFromId: null, migratePayload: null };
  }
  const preserved = mealTextEdits.get(lastAnalysis.id);
  if (!preserved) {
    return { merged: incoming, migrateFromId: null, migratePayload: null };
  }
  const baseName = (lastAnalysis.analysis.name ?? '').trim();
  const customName = preserved.name.trim();
  if (!customName || customName === baseName) {
    return { merged: incoming, migrateFromId: null, migratePayload: null };
  }
  const migratePayload: MealTextEdit = {
    name: preserved.name,
    description: incoming.description ?? '',
  };
  return {
    merged: {
      ...incoming,
      name: customName,
    },
    migrateFromId: lastAnalysis.id,
    migratePayload,
  };
}

function mergeAnalysisWithPreservedUserText(
  incoming: ConversationSummary,
  isEditMealMode: boolean,
  priorMessages: Message[],
  mealTextEdits: Map<string, MealTextEdit>
): {
  merged: ConversationSummary;
  migrateFromId: string | null;
  migratePayload: MealTextEdit | null;
} {
  if (isEditMealMode) {
    return mergeEditModePreservedMealText(incoming, true, priorMessages, mealTextEdits);
  }
  return mergeNonEditPreservedMealName(incoming, priorMessages, mealTextEdits);
}

const INITIAL_MESSAGE: Message = {
  id: '1',
  text: "Hey there! — Just tell me about your meal and I'll spit some nutrition facts. Keep it casual, I got you!",
  isUser: false,
  timestamp: new Date(),
};

const ACTIVITY_INITIAL_MESSAGE =
  "Tell me what you did — for example a run with distance/time, swim laps, bike ride, HIIT, or lifts with sets and weight. I'll build a summary you can tweak before logging.";

function activitySummaryFingerprint(summary: ActivitySummary): string {
  return `${summary.name}\0${summary.description}\0${JSON.stringify(summary.items ?? [])}`;
}

function buildActivitySummaryApiDescription(
  baseDescription: string,
  qaPairs: Array<{ question: string; answer: string }>
): string {
  if (qaPairs.length === 0) return baseDescription;
  const lines = qaPairs.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n');
  return `${baseDescription}\n\nConversation:\n${lines}`;
}

const EDIT_MEAL_INITIAL_MESSAGE = "Hey there! — Just tell me what you'd like to change!";
const PLANNER_INITIAL_MESSAGE =
  "Tell me what you're planning for, like 'What should I have for dinner tonight?' or 'Help me plan my meals for the week.'";
const PLANNER_PROMPT_EXAMPLES = [
  'What should I have for dinner tonight?',
  'Help me plan my meals for the week.',
  "What can I have for lunch that's high in protein and easy to prepare?",
];

type MealSuggestion = {
  id: string;
  name: string;
  description: string;
  logged_at: string;
  total_nutrition: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
  } | null;
  similarity?: number;
  ingredients?: {
    name: string;
    servingAmount: number;
    servingUnit: string;
    servingSizeGrams: number;
  }[] | null;
};

type HeaderSegment = 'chat' | 'favorites' | 'recent';

type PlannerSuggestionOption = {
  name: string;
  description: string;
  whyItFits: string;
  mealType?: MealTypeTag;
  prepTimeMinutes?: number;
  nutrition: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
  };
  recipe?: PlannerRecipeMeta;
};

type PlannerRecipeMeta = {
  recipeId: string;
  sourceKey: 'internal' | 'allrecipes' | 'foodnetwork' | 'seriouseats' | 'simplyrecipes' | 'spoonacular';
  sourceName: string;
  canonicalUrl: string;
  imageUrl?: string | null;
  yieldText?: string | null;
  totalTimeMinutes?: number | null;
};

type PlannerWeekMeal = PlannerSuggestionOption & {
  slot: MealTypeTag;
  plannedMealId?: string;
  plannedFor?: string;
};

type PlannerWeekDay = {
  date: string;
  label: string;
  meals: PlannerWeekMeal[];
};

type PlannerReplaceResponse = {
  note: string;
  targetDate: string;
  targetSlot: MealTypeTag;
  replacement: PlannerWeekMeal;
};

type PlannerSwapSelection = {
  messageId: string;
  mealKey: string;
  date: string;
  meal: PlannerWeekMeal;
};

function getPlannerMealKey(date: string, slot: MealTypeTag, idx: number): string {
  return `${date}_${slot}_${idx}`;
}

function parseLocalPlannerDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function getPlannerSlotHour(slot?: MealTypeTag): number {
  switch (slot) {
    case 'breakfast':
      return 8;
    case 'lunch':
      return 12;
    case 'dinner':
      return 18;
    case 'snack':
      return 15;
    default:
      return 12;
  }
}

function buildPlannerPlannedForISO(dateString: string, slot?: MealTypeTag): string {
  const localDate = parseLocalPlannerDate(dateString);
  localDate.setHours(getPlannerSlotHour(slot), 0, 0, 0);
  return localDate.toISOString();
}

function buildPlannerTotalNutrition(meal: PlannerSuggestionOption) {
  return {
    calories: meal.nutrition.calories,
    fat: meal.nutrition.fat,
    protein: meal.nutrition.protein,
    carbohydrates: meal.nutrition.carbohydrates,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    saturatedFat: 0,
    potassium: 0,
    cholesterol: 0,
    calcium: 0,
    iron: 0,
    vitaminA: 0,
    vitaminC: 0,
    vitaminD: 0,
    magnesium: 0,
  };
}

function createAssistantMessage(text: string, id: string = Date.now().toString()): Message {
  return {
    id,
    text,
    isUser: false,
    timestamp: new Date(),
    type: 'text',
  };
}

function createInitialAssistantMessage(chatMode: ChatMode): Message {
  return createAssistantMessage(
    chatMode === 'plan' ? PLANNER_INITIAL_MESSAGE : INITIAL_MESSAGE.text || '',
    `initial-${chatMode}`
  );
}

function createActivityInitialAssistantMessage(): Message {
  return createAssistantMessage(ACTIVITY_INITIAL_MESSAGE, 'initial-activity');
}

function buildPlannerPlaceholderResponse(prompt: string): string {
  const normalized = prompt.trim().toLowerCase();

  if (/week|weekly|meal plan|plan my meals/.test(normalized)) {
    return 'Meal planning hit a temporary issue while building your weekly plan. Try again in a moment.';
  }

  if (/recipe|cook|make/.test(normalized)) {
    return 'Meal planning hit a temporary issue while loading source-backed recipe details. Try a different prompt or retry in a moment.';
  }

  return 'Meal planning hit a temporary issue while generating suggestions. Please try again.';
}

function isWeeklyPlanningPrompt(prompt: string): boolean {
  return /week|weekly|meal plan|plan my meals/.test(prompt.trim().toLowerCase());
}

function extractExplicitPlannerMealType(prompt: string): MealTypeTag | null {
  const normalized = prompt.trim().toLowerCase();
  if (/\bbreakfasts?\b|\bbrunch(?:es)?\b/.test(normalized)) return 'breakfast';
  if (/\blunch(?:es)?\b/.test(normalized)) return 'lunch';
  if (/\bdinners?\b|\bsuppers?\b/.test(normalized)) return 'dinner';
  if (/\bsnacks?\b/.test(normalized)) return 'snack';
  return null;
}

type MealLog = {
  id: string;
  name: string | null;
  description: string;
  total_nutrition: {
    calories: number;
    fat: number;
    protein: number;
    carbohydrates: number;
    fiber: number;
    sugar: number;
    sodium: number;
    saturatedFat: number;
    potassium: number;
    cholesterol: number;
    calcium: number;
    iron: number;
    vitaminA: number;
    vitaminC: number;
    vitaminD: number;
    magnesium: number;
  } | null;
  ingredients: {
    name: string;
    servingAmount: number;
    servingUnit: string;
    servingSizeGrams: number;
    nutrition: {
      calories: number;
      fat: number;
      protein: number;
      carbohydrates: number;
      fiber: number;
      sugar: number;
      sodium: number;
      saturatedFat: number;
      potassium: number;
      cholesterol: number;
      calcium: number;
      iron: number;
      vitaminA: number;
      vitaminC: number;
      vitaminD: number;
      magnesium: number;
    };
    provenance?: { source: 'brand_api' | 'usda' | 'recipe' | 'llm_estimate'; id?: string; confidence?: 'low' | 'medium' | 'high' };
  }[] | null;
  created_at: string;
  updated_at: string;
  logged_at?: string;
  analysis_status?: 'pending' | 'analyzing' | 'completed' | 'failed';
  original_description?: string;
  icon?: string;
  favorite_id?: string | null;
};

// Helper function to convert MealLog to ConversationSummary
const mealLogToConversationSummary = (mealLog: MealLog): ConversationSummary => {
  return {
    name: mealLog.name || '',
    description: mealLog.description || '',
    ingredients: (mealLog.ingredients || []).map(ing => ({
      name: ing.name,
      servingAmount: ing.servingAmount,
      servingUnit: ing.servingUnit,
      servingSizeGrams: ing.servingSizeGrams,
      provenance: ing.provenance,
    })),
    questions: [],
    assumptions: [],
  };
};

const EDIT_LOG_TIME_EPSILON_MS = 45_000;

function buildFullSummaryIngredientsForMessage(
  analysis: ConversationSummary,
  messageId: string,
  editedAmounts: Map<string, Map<number, number>>
) {
  const editedAmountMap = editedAmounts.get(messageId);
  return analysis.ingredients.map((ing, idx) => {
    const editedAmount = editedAmountMap?.get(idx);
    const amount = editedAmount !== undefined ? editedAmount : ing.servingAmount;
    const newGrams = scaleServingSizeGrams(ing.servingAmount, ing.servingSizeGrams, amount);
    return { ...ing, servingAmount: amount, servingSizeGrams: newGrams };
  });
}

type BuildUpdatedSummaryOptions = {
  descriptionMode?: 'fromIngredients' | 'preserveMealText';
  mealTextEdits?: Map<string, MealTextEdit>;
};

function buildUpdatedSummaryFromAnalysisMessage(
  analysis: ConversationSummary,
  messageId: string,
  editedAmounts: Map<string, Map<number, number>>,
  options?: BuildUpdatedSummaryOptions
): ConversationSummary | null {
  const fullSummaryIngredients = buildFullSummaryIngredientsForMessage(analysis, messageId, editedAmounts);
  const ingredientsForLog = dropZeroServingIngredients(fullSummaryIngredients);
  if (ingredientsForLog.length === 0) return null;
  const mode = options?.descriptionMode ?? 'fromIngredients';
  const edits = options?.mealTextEdits?.get(messageId);
  if (mode === 'preserveMealText') {
    const name = (edits?.name ?? analysis.name ?? '').trim();
    const description = (edits?.description ?? analysis.description ?? '').trim();
    return {
      ...analysis,
      name,
      ingredients: ingredientsForLog,
      description,
    };
  }
  const baseTitle = (analysis.name ?? '').trim();
  const name =
    edits && (edits.name ?? '').trim().length > 0
      ? (edits.name ?? '').trim()
      : baseTitle;
  return {
    ...analysis,
    name,
    ingredients: ingredientsForLog,
    description: mealDescriptionFromIngredients(ingredientsForLog),
  };
}

/** Per-ingredient zeros until PATCH triggers async nutrition analysis. */
const PLACEHOLDER_INGREDIENT_NUTRITION: NonNullable<MealLog['ingredients']>[number]['nutrition'] = {
  calories: 0,
  fat: 0,
  protein: 0,
  carbohydrates: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
  saturatedFat: 0,
  potassium: 0,
  cholesterol: 0,
  calcium: 0,
  iron: 0,
  vitaminA: 0,
  vitaminC: 0,
  vitaminD: 0,
  magnesium: 0,
};

function buildPatchedMealLogForEditUpdate(
  originalMealLog: MealLog,
  updatedSummary: ConversationSummary,
  fullSummaryIngredients: ReturnType<typeof buildFullSummaryIngredientsForMessage>
): MealLog {
  const orig = originalMealLog.ingredients || [];
  const merged = fullSummaryIngredients.map((fi, idx) => {
    if (idx < orig.length) {
      const o = orig[idx];
      return {
        ...o,
        name: fi.name,
        servingAmount: fi.servingAmount,
        servingUnit: fi.servingUnit,
        servingSizeGrams: fi.servingSizeGrams,
      };
    }
    return {
      name: fi.name,
      servingAmount: fi.servingAmount,
      servingUnit: fi.servingUnit,
      servingSizeGrams: fi.servingSizeGrams,
      nutrition: { ...PLACEHOLDER_INGREDIENT_NUTRITION },
    };
  });

  return {
    ...originalMealLog,
    name: updatedSummary.name,
    description: updatedSummary.description,
    ingredients: dropZeroServingIngredients(merged),
  };
}

/** Baseline for edit mode: persisted name, description, and normalized non-zero ingredients. */
function normalizedBaselineSummaryFromMealLog(mealLog: MealLog): ConversationSummary {
  const raw = mealLogToConversationSummary(mealLog);
  const ing = dropZeroServingIngredients(raw.ingredients.map((x) => ({ ...x })));
  return {
    ...raw,
    ingredients: ing,
    description: (raw.description || '').trim(),
  };
}

function conversationSummaryEqualsForEditBaseline(a: ConversationSummary, b: ConversationSummary): boolean {
  if ((a.name || '').trim() !== (b.name || '').trim()) return false;
  if ((a.description || '').trim() !== (b.description || '').trim()) return false;
  const ai = a.ingredients || [];
  const bi = b.ingredients || [];
  if (ai.length !== bi.length) return false;
  for (let i = 0; i < ai.length; i++) {
    if (ai[i].name !== bi[i].name) return false;
    if (ai[i].servingUnit !== bi[i].servingUnit) return false;
    if (Math.abs(ai[i].servingAmount - bi[i].servingAmount) > 0.01) return false;
  }
  return true;
}

function editLoggedAtMatchesSelected(originalMealLog: MealLog, selectedDate: Date): boolean {
  const raw = originalMealLog.logged_at || originalMealLog.created_at;
  return Math.abs(new Date(raw).getTime() - selectedDate.getTime()) <= EDIT_LOG_TIME_EPSILON_MS;
}

/** Same ingredient rows (non-zero) as baseline — safe to PATCH without async nutrition re-analysis. */
function patchedIngredientsNutritionallyMatchOriginal(originalMealLog: MealLog, patched: MealLog): boolean {
  const ai = dropZeroServingIngredients((originalMealLog.ingredients || []).map((x) => ({ ...x })));
  const bi = dropZeroServingIngredients((patched.ingredients || []).map((x) => ({ ...x })));
  if (ai.length !== bi.length) return false;
  for (let i = 0; i < ai.length; i++) {
    if (ai[i].name !== bi[i].name) return false;
    if (ai[i].servingUnit !== bi[i].servingUnit) return false;
    if (Math.abs(ai[i].servingAmount - bi[i].servingAmount) > 0.01) return false;
  }
  return true;
}

/** True when the analysis card represents a real change from the saved meal (content or logged time). */
function editModeUpdateIsEnabled(
  originalMealLog: MealLog,
  analysis: ConversationSummary,
  messageId: string,
  editedAmounts: Map<string, Map<number, number>>,
  selectedDate: Date,
  mealTextEdits: Map<string, MealTextEdit>
): boolean {
  const updated = buildUpdatedSummaryFromAnalysisMessage(analysis, messageId, editedAmounts, {
    descriptionMode: 'preserveMealText',
    mealTextEdits,
  });
  if (!updated) return false;
  const baselineNorm = normalizedBaselineSummaryFromMealLog(originalMealLog);
  if (!conversationSummaryEqualsForEditBaseline(baselineNorm, updated)) return true;
  return !editLoggedAtMatchesSelected(originalMealLog, selectedDate);
}

/** Favorite template edit: content-only (no logged time). */
function editFavoriteTemplateUpdateIsEnabled(
  originalMealLog: MealLog,
  analysis: ConversationSummary,
  messageId: string,
  editedAmounts: Map<string, Map<number, number>>,
  mealTextEdits: Map<string, MealTextEdit>
): boolean {
  const updated = buildUpdatedSummaryFromAnalysisMessage(analysis, messageId, editedAmounts, {
    descriptionMode: 'preserveMealText',
    mealTextEdits,
  });
  if (!updated) return false;
  const baselineNorm = normalizedBaselineSummaryFromMealLog(originalMealLog);
  return !conversationSummaryEqualsForEditBaseline(baselineNorm, updated);
}

/** Prefer the newest analysis bubble the user tweaked; otherwise the latest analysis in the thread. */
function resolveAnalysisBaselineForApi(
  messages: Message[],
  editedAmounts: Map<string, Map<number, number>>
): { analysis: ConversationSummary; messageId: string } | null {
  const analysisMsgs = messages.filter(
    (m): m is Message & { analysis: ConversationSummary } =>
      m.type === 'analysis' && m.analysis != null
  );
  if (analysisMsgs.length === 0) return null;
  for (let i = analysisMsgs.length - 1; i >= 0; i--) {
    const m = analysisMsgs[i];
    const edits = editedAmounts.get(m.id);
    if (edits && edits.size > 0) {
      return { analysis: m.analysis, messageId: m.id };
    }
  }
  const last = analysisMsgs[analysisMsgs.length - 1];
  return { analysis: last.analysis, messageId: last.id };
}

function buildRefinedDescriptionForApi(
  base: string,
  qaPairs: Array<{ questionId: string; question: string; answer: string }>
): string {
  if (!qaPairs.length) return base;
  const qaStrings = qaPairs.map((qa) => `Q: ${qa.question} A: ${qa.answer}`);
  return `${base}. ${qaStrings.join('. ')}`;
}

/**
 * Payload for POST /logs/summary. When we have an analysis card (+ optional picker edits), the snapshot is
 * authoritative — do not also append original free-text `baseDescription` or the model may duplicate rows
 * (e.g. "1 egg" from first message vs "2 eggs" from picker).
 */
function buildMealSummaryApiMealDescription(
  messages: Message[],
  editedAmounts: Map<string, Map<number, number>>,
  baseDescription: string,
  qaPairs: Array<{ questionId: string; question: string; answer: string }>
): string {
  const baseline = resolveAnalysisBaselineForApi(messages, editedAmounts);
  if (!baseline) {
    return buildRefinedDescriptionForApi(baseDescription, qaPairs);
  }
  const effective = buildUpdatedSummaryFromAnalysisMessage(
    baseline.analysis,
    baseline.messageId,
    editedAmounts
  );
  if (!effective?.ingredients?.length) {
    return buildRefinedDescriptionForApi(baseDescription, qaPairs);
  }
  const lines = effective.ingredients
    .map((i) => `- ${i.servingAmount} ${i.servingUnit} ${i.name}`)
    .join('\n');
  const snapshot =
    'CURRENT MEAL — authoritative ingredient list (one row per distinct food; user-adjusted amounts are already applied). ' +
    'The list below replaces any earlier wording; do not duplicate the same food with a different quantity:\n' +
    `${lines}`;

  if (qaPairs.length === 0) {
    return snapshot;
  }
  const requestLines = qaPairs.map((qa) => `- ${qa.answer}`).join('\n');
  return (
    `${snapshot}\n\n` +
    'USER REQUESTS (merge into CURRENT MEAL only; add new foods or change amounts as stated—never list the same food twice):\n' +
    requestLines
  );
}

// SuggestionCard component for displaying meal suggestions (expandable, log via plus button)
type SuggestionCardProps = {
  suggestion: MealSuggestion;
  onLogPress?: () => void;
  isFavorite?: boolean;
  onRemoveFavorite?: (favoriteId: string) => void;
};

const SuggestionCard = ({ suggestion, onLogPress, isFavorite, onRemoveFavorite }: SuggestionCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const hasIngredients = (suggestion.ingredients?.length ?? 0) > 0;

  const formatSuggestionDate = (dateString: string) => {
    const date = new Date(dateString);
    return formatMealDate(date);
  };

  const SWIPE_ACTION_WIDTH = 72;

  const renderRightActions = (
    _progress: unknown,
    _translation: unknown,
    methods: { close: () => void }
  ) => (
    <View style={[styles.suggestionSwipeAction, styles.suggestionSwipeActionRight]}>
      <GHTouchableOpacity
        style={styles.suggestionSwipeActionButton}
        onPress={() => {
          onLogPress?.();
          methods.close();
        }}
        activeOpacity={0.8}
      >
        <CirclePlus size={24} color="#7c3aed" strokeWidth={2} />
      </GHTouchableOpacity>
    </View>
  );

  const renderLeftActions = (
    _progress: unknown,
    _translation: unknown,
    methods: { close: () => void }
  ) => {
    if (!isFavorite) return null;
    return (
      <View style={[styles.suggestionSwipeAction, styles.suggestionSwipeActionLeft]}>
        <GHTouchableOpacity
          style={styles.suggestionSwipeActionButton}
          onPress={() => {
            Alert.alert(
              'Remove from favorites',
              'Remove this meal from your favorites? You can add it again anytime from the meal card menu.',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => methods.close() },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => {
                    onRemoveFavorite?.(suggestion.id);
                    methods.close();
                  },
                },
              ]
            );
          }}
          activeOpacity={0.8}
        >
          <Trash2 size={22} color="#dc2626" strokeWidth={2} />
        </GHTouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.suggestionCard}>
      <Swipeable
        renderRightActions={renderRightActions}
        renderLeftActions={isFavorite ? renderLeftActions : undefined}
        friction={2}
        leftThreshold={SWIPE_ACTION_WIDTH / 2}
        rightThreshold={SWIPE_ACTION_WIDTH / 2}
        containerStyle={styles.suggestionSwipeableContainer}
      >
        <View style={styles.suggestionSwipeableContent}>
        <View style={styles.suggestionCardContent}>
          <TouchableOpacity
            style={styles.suggestionCardTapArea}
            onPress={() => setExpanded((e) => !e)}
            activeOpacity={0.7}
          >
            <View style={styles.suggestionCardLeft}>
              <Text style={styles.suggestionMealName} numberOfLines={2}>
                {suggestion.name}
              </Text>
              {suggestion.logged_at && (
                <Text style={styles.suggestionDate} numberOfLines={1}>
                  {formatSuggestionDate(suggestion.logged_at)}
                </Text>
              )}
              <Text style={styles.suggestionDescription} numberOfLines={expanded ? undefined : 2}>
                {suggestion.description}
              </Text>
            </View>
            {hasIngredients && (
              <View style={styles.suggestionExpandChevron}>
                {expanded ? (
                  <ChevronUp size={18} color="#6a7282" strokeWidth={2} />
                ) : (
                  <ChevronDown size={18} color="#6a7282" strokeWidth={2} />
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>
      {expanded && hasIngredients && (
        <View style={styles.suggestionIngredientsSection}>
          {(suggestion.ingredients ?? []).map((ing, idx) => (
            <View key={idx} style={styles.suggestionIngredientRow}>
              <Text style={styles.suggestionIngredientBullet}>•</Text>
              <View style={styles.suggestionIngredientContent}>
                <View style={styles.suggestionIngredientNameWrap}>
                  <Text style={styles.suggestionIngredientName}>{ing.name}</Text>
                </View>
                <Text style={styles.suggestionIngredientServing}>
                  {ing.servingAmount} {ing.servingUnit}
                </Text>
              </View>
            </View>
          ))}
          {suggestion.total_nutrition && (
            <View style={styles.suggestionNutritionRow}>
              <View style={styles.suggestionNutritionItem}>
                <Zap size={12} color="#6a7282" strokeWidth={2} />
                <Text style={styles.suggestionNutritionText}>
                  {Math.round(suggestion.total_nutrition.calories)} cal
                </Text>
              </View>
              <View style={styles.suggestionNutritionItem}>
                <Dumbbell size={12} color="#6a7282" strokeWidth={2} />
                <Text style={styles.suggestionNutritionText}>
                  {Math.round(suggestion.total_nutrition.protein)}g P
                </Text>
              </View>
              <View style={styles.suggestionNutritionItem}>
                <Wheat size={12} color="#6a7282" strokeWidth={2} />
                <Text style={styles.suggestionNutritionText}>
                  {Math.round(suggestion.total_nutrition.carbohydrates)}g C
                </Text>
              </View>
              <View style={styles.suggestionNutritionItem}>
                <Droplet size={12} color="#6a7282" strokeWidth={2} />
                <Text style={styles.suggestionNutritionText}>
                  {Math.round(suggestion.total_nutrition.fat)}g F
                </Text>
              </View>
            </View>
          )}
          <TouchableOpacity
            style={styles.suggestionLogMealButton}
            onPress={onLogPress}
            activeOpacity={0.7}
          >
            <CirclePlus size={16} color="#7c3aed" strokeWidth={2} />
            <Text style={styles.suggestionLogMealButtonText}>Log this meal</Text>
          </TouchableOpacity>
        </View>
      )}
        </View>
      </Swipeable>
    </View>
  );
};

type MealTypeTag = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const PlannerSuggestionCard = ({
  suggestion,
  onSavePress,
  onRecipePress,
  isSaving,
}: {
  suggestion: PlannerSuggestionOption;
  onSavePress: () => void;
  onRecipePress: () => void;
  isSaving: boolean;
}) => {
  const mealTypeLabel = suggestion.mealType ? getMealLabel(suggestion.mealType) : null;

  return (
    <View style={styles.plannerSuggestionCard}>
      <View style={styles.plannerSuggestionHeader}>
        <Text style={styles.plannerSuggestionName}>{suggestion.name}</Text>
        {mealTypeLabel ? (
          <View style={styles.plannerSuggestionBadge}>
            <Text style={styles.plannerSuggestionBadgeText}>{mealTypeLabel}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.plannerSuggestionDescription}>{suggestion.description}</Text>
      <Text style={styles.plannerSuggestionWhyItFits}>{suggestion.whyItFits}</Text>

      <View style={styles.plannerSuggestionMetaRow}>
        {typeof suggestion.prepTimeMinutes === 'number' ? (
          <View style={styles.plannerSuggestionMetaItem}>
            <Clock size={12} color="#6a7282" strokeWidth={2} />
            <Text style={styles.plannerSuggestionMetaText}>{suggestion.prepTimeMinutes} min</Text>
          </View>
        ) : null}
        <View style={styles.plannerSuggestionMetaItem}>
          <Zap size={12} color="#6a7282" strokeWidth={2} />
          <Text style={styles.plannerSuggestionMetaText}>{Math.round(suggestion.nutrition.calories)} cal</Text>
        </View>
        <View style={styles.plannerSuggestionMetaItem}>
          <Dumbbell size={12} color="#6a7282" strokeWidth={2} />
          <Text style={styles.plannerSuggestionMetaText}>{Math.round(suggestion.nutrition.protein)}g P</Text>
        </View>
        <View style={styles.plannerSuggestionMetaItem}>
          <Wheat size={12} color="#6a7282" strokeWidth={2} />
          <Text style={styles.plannerSuggestionMetaText}>{Math.round(suggestion.nutrition.carbohydrates)}g C</Text>
        </View>
        <View style={styles.plannerSuggestionMetaItem}>
          <Droplet size={12} color="#6a7282" strokeWidth={2} />
          <Text style={styles.plannerSuggestionMetaText}>{Math.round(suggestion.nutrition.fat)}g F</Text>
        </View>
      </View>

      {suggestion.recipe ? (
        <View style={styles.plannerRecipeSourceRow}>
          <Text style={styles.plannerRecipeSourceText}>
            From {suggestion.recipe.sourceName}
          </Text>
          <TouchableOpacity
            style={styles.plannerRecipeButton}
            onPress={onRecipePress}
            activeOpacity={0.8}
          >
            <BookOpen size={14} color="#7c3aed" strokeWidth={2} />
            <Text style={styles.plannerRecipeButtonText}>View recipe</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.plannerSuggestionActionRow}>
        <TouchableOpacity
          style={[styles.plannerSuggestionSaveButton, isSaving && styles.logItButtonDisabled]}
          onPress={onSavePress}
          activeOpacity={0.8}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <CirclePlus size={16} color="#ffffff" strokeWidth={2} />
          )}
          <Text style={styles.plannerSuggestionSaveButtonText}>
            {isSaving ? 'Saving...' : 'Save to plan'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const PlannerWeekDayCard = ({
  day,
  onSavePress,
  onRecipePress,
  onReplacePress,
  onSwapPress,
  savingMealKey,
  replacingMealKey,
  swapSelection,
}: {
  day: PlannerWeekDay;
  onSavePress: (meal: PlannerWeekMeal, date: string, mealKey: string) => void;
  onRecipePress: (meal: PlannerWeekMeal) => void;
  onReplacePress: (meal: PlannerWeekMeal, date: string, mealKey: string) => void;
  onSwapPress: (meal: PlannerWeekMeal, date: string, mealKey: string) => void;
  savingMealKey?: string | null;
  replacingMealKey?: string | null;
  swapSelection?: PlannerSwapSelection | null;
}) => {
  return (
    <View style={styles.plannerWeekDayCard}>
      <View style={styles.plannerWeekDayHeader}>
        <Text style={styles.plannerWeekDayLabel}>{day.label}</Text>
        <Text style={styles.plannerWeekDayDate}>{formatMealDate(parseLocalPlannerDate(day.date))}</Text>
      </View>

      <View style={styles.plannerWeekMealsList}>
        {day.meals.map((meal, idx) => {
          const mealKey = getPlannerMealKey(day.date, meal.slot, idx);
          const isSaving = savingMealKey === mealKey;
          const isSwapSource = swapSelection?.mealKey === mealKey;
          const isSwapTarget = !!swapSelection && swapSelection.mealKey !== mealKey;
          const swapButtonLabel = isSwapSource ? 'Cancel swap' : isSwapTarget ? 'Swap here' : 'Swap';

          return (
            <View
              key={mealKey}
              style={[
                styles.plannerWeekMealCard,
                isSwapSource && styles.plannerWeekMealCardSwapSelected,
              ]}
            >
              <View style={styles.plannerWeekMealHeader}>
                <View style={styles.plannerSuggestionBadge}>
                  <Text style={styles.plannerSuggestionBadgeText}>{getMealLabel(meal.slot)}</Text>
                </View>
                <Text style={styles.plannerWeekMealName}>{meal.name}</Text>
              </View>

              <Text style={styles.plannerSuggestionDescription}>{meal.description}</Text>
              <Text style={styles.plannerSuggestionWhyItFits}>{meal.whyItFits}</Text>
              <View style={styles.plannerSuggestionMetaRow}>
                <View style={styles.plannerSuggestionMetaItem}>
                  <Zap size={12} color="#6a7282" strokeWidth={2} />
                  <Text style={styles.plannerSuggestionMetaText}>{Math.round(meal.nutrition.calories)} cal</Text>
                </View>
                <View style={styles.plannerSuggestionMetaItem}>
                  <Dumbbell size={12} color="#6a7282" strokeWidth={2} />
                  <Text style={styles.plannerSuggestionMetaText}>{Math.round(meal.nutrition.protein)}g P</Text>
                </View>
              </View>

              {meal.recipe ? (
                <View style={styles.plannerRecipeSourceRow}>
                  <Text style={styles.plannerRecipeSourceText}>From {meal.recipe.sourceName}</Text>
                  <TouchableOpacity
                    style={styles.plannerRecipeButton}
                    onPress={() => onRecipePress(meal)}
                    activeOpacity={0.8}
                  >
                    <BookOpen size={14} color="#7c3aed" strokeWidth={2} />
                    <Text style={styles.plannerRecipeButtonText}>View recipe</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={styles.plannerWeekMealActions}>
                <TouchableOpacity
                  style={[styles.plannerSuggestionSaveButton, styles.plannerWeekActionButton, isSaving && styles.logItButtonDisabled]}
                  onPress={() => onSavePress(meal, day.date, mealKey)}
                  activeOpacity={0.8}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <CirclePlus size={16} color="#ffffff" strokeWidth={2} />
                  )}
                  <Text style={styles.plannerSuggestionSaveButtonText}>
                    {isSaving ? 'Saving...' : meal.plannedMealId ? 'Update plan' : 'Save to plan'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.plannerWeekReplaceButton,
                    styles.plannerWeekActionButton,
                    replacingMealKey === mealKey && styles.logItButtonDisabled,
                  ]}
                  onPress={() => onReplacePress(meal, day.date, mealKey)}
                  activeOpacity={0.8}
                  disabled={replacingMealKey === mealKey || !!swapSelection}
                >
                  {replacingMealKey === mealKey ? (
                    <ActivityIndicator size="small" color="#7c3aed" />
                  ) : (
                    <RefreshCcw size={15} color="#7c3aed" strokeWidth={2} />
                  )}
                  <Text style={styles.plannerWeekReplaceButtonText}>
                    {replacingMealKey === mealKey ? 'Replacing...' : 'Replace'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.plannerWeekReplaceButton,
                    styles.plannerWeekActionButton,
                    isSwapSource && styles.plannerWeekSwapButtonSelected,
                  ]}
                  onPress={() => onSwapPress(meal, day.date, mealKey)}
                  activeOpacity={0.8}
                  disabled={replacingMealKey != null}
                >
                  <Text
                    style={[
                      styles.plannerWeekReplaceButtonText,
                      isSwapSource && styles.plannerWeekSwapButtonSelectedText,
                    ]}
                  >
                    {swapButtonLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

type ChatScreenProps = {
  initialMessage?: string;
  onClose?: () => void;
  isOverlay?: boolean;
  mealLogId?: string;
  isEditMealMode?: boolean;
  submitNonce?: number;
  submittedText?: string;
  initialLoggedAt?: Date;
  initialMealType?: MealTypeTag;
  /** When set, opens Meal vs Activity logger. Ignored when editing a meal (meal logger only). Route: `?logger=meal` | `?logger=activity`. */
  initialLoggerKind?: LoggerKind;
  /** When set, opens meal chat in logging or planning mode. Ignored when editing a meal. Route: `?mode=log` | `?mode=plan`. */
  initialChatMode?: ChatMode;
};

// Infer meal period from current time using profile meal times (breakfast/lunch/dinner only; snack is never inferred).
function getMealPeriodFromProfile(profile: { breakfast_time?: string; lunch_time?: string; dinner_time?: string } | null | undefined): MealTypeTag | null {
  if (!profile) return null;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const parse = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const b = parse(profile.breakfast_time || '08:00');
  const l = parse(profile.lunch_time || '12:00');
  const d = parse(profile.dinner_time || '18:00');
  if (currentMinutes < b) return 'breakfast';
  if (currentMinutes < l) return 'breakfast';
  if (currentMinutes < d) return 'lunch';
  return 'dinner';
}

function getMealLabel(mealType: MealTypeTag): string {
  switch (mealType) {
    case 'breakfast': return 'Breakfast';
    case 'lunch': return 'Lunch';
    case 'dinner': return 'Dinner';
    case 'snack': return 'Snacks';
    default: return 'Meal';
  }
}

const LOGGING_FOR_ICON_COLOR = '#4a5565';

function getLoggingForIcon(mealType: MealTypeTag) {
  switch (mealType) {
    case 'breakfast':
      return <Coffee size={16} color={LOGGING_FOR_ICON_COLOR} strokeWidth={2} />;
    case 'lunch':
      return <Sun size={16} color={LOGGING_FOR_ICON_COLOR} strokeWidth={2} />;
    case 'dinner':
      return <Moon size={16} color={LOGGING_FOR_ICON_COLOR} strokeWidth={2} />;
    case 'snack':
      return <Apple size={16} color={LOGGING_FOR_ICON_COLOR} strokeWidth={2} />;
    default:
      return <Coffee size={16} color={LOGGING_FOR_ICON_COLOR} strokeWidth={2} />;
  }
}

// Figma: "today at 6:30 PM" / "yesterday at 8:00 AM" (lowercase); other dates unchanged.
function formatLoggingForDate(date: Date): string {
  const s = formatMealDate(date);
  if (s.startsWith('Today ')) return 'today ' + s.slice(6);
  if (s.startsWith('Yesterday ')) return 'yesterday ' + s.slice(10);
  return s;
}

/**
 * Opening a meal slot uses the profile meal time (e.g. lunch at 12:00). If that timestamp is
 * still in the future, we should create a planned meal — not a logged one with a future
 * `logged_at`. A short lead avoids flaky "same instant" comparisons; a large lead (e.g. 15m)
 * wrongly logged near-noon lunch as immediate.
 */
const PLANNED_MEAL_MIN_LEAD_MS = 60_000;

function selectedTimeQualifiesAsPlannedMeal(selectedDate: Date): boolean {
  return selectedDate.getTime() - Date.now() > PLANNED_MEAL_MIN_LEAD_MS;
}

export const ChatScreen = ({
  initialMessage: propInitialMessage,
  onClose: propOnClose,
  isOverlay = false,
  mealLogId: propMealLogId,
  isEditMealMode: propIsEditMealMode,
  submitNonce,
  submittedText: propSubmittedText,
  initialLoggedAt: propInitialLoggedAt,
  initialMealType: propInitialMealType,
  initialLoggerKind: propInitialLoggerKind,
  initialChatMode: propInitialChatMode,
}: ChatScreenProps = {}) => {
  const params = useLocalSearchParams<{
    initialMessage?: string;
    mealLogId?: string;
    editMeal?: string;
    favoriteId?: string | string[];
    editFavorite?: string;
    createFavorite?: string;
    logger?: string | string[];
    mode?: string | string[];
  }>();
  const { data: profile } = useUserProfile();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // Use props if provided (overlay mode), otherwise use params (full screen mode)
  const initialMessage = propInitialMessage || params.initialMessage;
  const mealLogId = propMealLogId || params.mealLogId;
  const isEditMealMode = propIsEditMealMode ?? params.editMeal === 'true';
  const [isEditFavoriteMode] = useState(() => params.editFavorite === 'true');
  const [isCreateFavoriteMode] = useState(() => params.createFavorite === 'true');
  const preserveMergeEditMode = isEditMealMode || isEditFavoriteMode;
  const showMealHeaderFullEdit = isEditMealMode || isEditFavoriteMode;
  const templateOnlyFlow = isEditFavoriteMode || isCreateFavoriteMode;
  const rawFavoriteIdParam = params.favoriteId;
  const favoriteIdFromParams =
    typeof rawFavoriteIdParam === 'string' && rawFavoriteIdParam.length > 0
      ? rawFavoriteIdParam
      : Array.isArray(rawFavoriteIdParam) && rawFavoriteIdParam[0]
        ? rawFavoriteIdParam[0]
        : undefined;
  const lockMealChatOnlyBase =
    isEditMealMode ||
    !!mealLogId ||
    !!favoriteIdFromParams ||
    isCreateFavoriteMode ||
    isEditFavoriteMode;
  const initialLoggerFromRoute = parseChatLoggerParam(params.logger);
  const initialChatModeFromRoute = parseChatModeParam(params.mode);
  const resolvedInitialLoggerKind: LoggerKind = lockMealChatOnlyBase
    ? 'meal'
    : (propInitialLoggerKind ?? initialLoggerFromRoute ?? 'meal');
  const resolvedInitialChatMode: ChatMode = lockMealChatOnlyBase
    ? 'log'
    : (propInitialChatMode ?? initialChatModeFromRoute ?? 'log');
  const [messages, setMessages] = useState<Message[]>(() =>
    resolvedInitialLoggerKind === 'activity'
      ? [createActivityInitialAssistantMessage()]
      : [createInitialAssistantMessage(resolvedInitialChatMode)]
  );
  const [inputText, setInputText] = useState('');
  const [loggerKind, setLoggerKind] = useState<LoggerKind>(resolvedInitialLoggerKind);
  const [chatMode, setChatMode] = useState<ChatMode>(resolvedInitialChatMode);
  const [headerSegment, setHeaderSegment] = useState<HeaderSegment>('chat');
  const [loggerMenuVisible, setLoggerMenuVisible] = useState(false);
  const [loggerMenuLayout, setLoggerMenuLayout] = useState<{ top: number; left: number } | null>(null);
  const loggerTitleAnchorRef = useRef<View>(null);
  const [baseDescription, setBaseDescription] = useState<string | null>(null);
  const [clarifications, setClarifications] = useState<string[]>([]);
  const [, setCurrentQuestion] = useState<{ id: string; text: string; options?: string[] } | null>(null);
  const [preview, setPreview] = useState<ConversationSummary | null>(null);
  const [activitySummaryPreview, setActivitySummaryPreview] = useState<ActivitySummary | null>(null);
  const [activityDraftsByMessageId, setActivityDraftsByMessageId] = useState<Map<string, ActivitySummary>>(
    () => new Map()
  );
  const [askedQuestions, setAskedQuestions] = useState<Set<string>>(new Set());
  const [questionAnswers, setQuestionAnswers] = useState<Array<{questionId: string, question: string, answer: string}>>([]);
  const [pendingClarificationQuestions, setPendingClarificationQuestions] = useState<ChatAnswersCarouselQuestion[]>([]);
  const [isAnswersWidgetOpen, setIsAnswersWidgetOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [savingPlannerCardKey, setSavingPlannerCardKey] = useState<string | null>(null);
  const [replacingPlannerMealKey, setReplacingPlannerMealKey] = useState<string | null>(null);
  const [plannerSwapSelection, setPlannerSwapSelection] = useState<PlannerSwapSelection | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => propInitialLoggedAt ?? new Date());
  const [mealTypeForLog, setMealTypeForLog] = useState<MealTypeTag | null>(() => propInitialMealType ?? null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [assumptionsExpandedByMessageId, setAssumptionsExpandedByMessageId] = useState<Record<string, boolean>>({});
  // Allow selecting up to 6 months in the future
  const maxSelectableDate = useMemo(() => {
    const now = new Date();
    const max = new Date(now);
    max.setMonth(max.getMonth() + 6);
    return max;
  }, []);

  // Sync from props when overlay opens with context (e.g. user tapped empty meal slot).
  useEffect(() => {
    if (propInitialLoggedAt != null) setSelectedDate(propInitialLoggedAt);
    setMealTypeForLog(propInitialMealType ?? null);
  }, [propInitialLoggedAt, propInitialMealType]);

  const [editedAmounts, setEditedAmounts] = useState<Map<string, Map<number, number>>>(new Map());
  const [mealTextEdits, setMealTextEdits] = useState<Map<string, MealTextEdit>>(new Map());
  const [originalMealLog, setOriginalMealLog] = useState<MealLog | null>(null);
  const [selectedRecentMealId, setSelectedRecentMealId] = useState<string | null>(null);
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(null);
  /** Mirrors `loggingFromFavoriteIdRef` for UI that must re-render (e.g. hide “save as favorite” while logging from a template). */
  const [favoriteTemplateForLoggingId, setFavoriteTemplateForLoggingId] = useState<string | null>(null);
  const [saveSummaryAsFavorite, setSaveSummaryAsFavorite] = useState(false);
  const messagesRef = useRef<Message[]>(messages);
  const mealTextEditsRef = useRef<Map<string, MealTextEdit>>(mealTextEdits);
  messagesRef.current = messages;
  mealTextEditsRef.current = mealTextEdits;
  const lastMealAnalysisMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const last = [...messages]
      .reverse()
      .find((m) => m.type === 'analysis' && m.analysis != null && !m.activitySummary);
    const id = last?.id ?? null;
    if (id !== lastMealAnalysisMessageIdRef.current) {
      lastMealAnalysisMessageIdRef.current = id;
      if (id != null) {
        setSaveSummaryAsFavorite(false);
      }
    }
  }, [messages]);

  const showSaveFavoriteCheckbox = useMemo(
    () =>
      !templateOnlyFlow &&
      !isEditMealMode &&
      !selectedFavoriteId &&
      !favoriteTemplateForLoggingId,
    [templateOnlyFlow, isEditMealMode, selectedFavoriteId, favoriteTemplateForLoggingId]
  );

  const [pickerState, setPickerState] = useState<{
    visible: boolean;
    messageId: string;
    ingredientIndex: number;
    currentAmount: number;
    unit: string;
  } | null>(null);
  const lockMealChatOnly = lockMealChatOnlyBase || !!selectedFavoriteId;

  useEffect(() => {
    if (lockMealChatOnly && chatMode !== 'log') {
      setChatMode('log');
    }
  }, [chatMode, lockMealChatOnly]);

  useEffect(() => {
    if (!favoriteIdFromParams) return;
    setSelectedFavoriteId(favoriteIdFromParams);
    router.setParams({ favoriteId: '' });
  }, [favoriteIdFromParams]);

  const [mealChatComposerHeight, setMealChatComposerHeight] = useState(88);
  const [pendingMealPhotos, setPendingMealPhotos] = useState<PendingMealPhoto[]>([]);
  const lastUploadedMealPhotoPathsRef = useRef<string[] | null>(null);
  /** Hide floating composer while user edits meal title/description on summary card. */
  const [mealSummaryTextInputFocused, setMealSummaryTextInputFocused] = useState(false);
  const mealSummaryTextBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOutboundAbortRef = useRef<AbortController | null>(null);
  const photoUploadRequestIdRef = useRef(0);
  /** When set, the composer send was optimistic; cancel restores chat + clarification state and input. */
  const pendingComposerSendRef = useRef<{
    userMessageId: string;
    inputRestore: string | null;
    questionAnswersRestore: { questionId: string; question: string; answer: string }[];
    baseDescriptionRestore: string | null;
    photoRestore: PendingMealPhoto[] | null;
  } | null>(null);
  const loggingFromFavoriteIdRef = useRef<string | null>(null); // When set, pass to create/simple as favoriteId
  const isCreateFavoriteModeRef = useRef(false);
  isCreateFavoriteModeRef.current = isCreateFavoriteMode;
  const processedMutationDataRef = useRef<string | null>(null); // Track processed mutation results to avoid duplicates
  const processedGuardrailRef = useRef<string | null>(null); // Prevent duplicate guardrail renders
  const processedActivityGuardrailRef = useRef<string | null>(null);
  const hasConsumedInitialMessageRef = useRef(false);
  const fetchMealLists = loggerKind === 'meal' && !lockMealChatOnly;
  const datePickerBackdropAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      if (loggerKind === 'activity' && Platform.OS === 'ios') {
        void ensureActivityHealthKit();
      }
    }, [loggerKind])
  );
  const datePickerContentAnim = useRef(new Animated.Value(300)).current;

  const handleRemoveFavorite = async (favoriteId: string) => {
    try {
      await apiClient.delete(`/api/v1/logs/favorites/${favoriteId}`);
      await queryClient.invalidateQueries({ queryKey: ['favorites'] });
    } catch (error) {
      console.error('Error removing favorite:', error);
      Alert.alert(
        'Error',
        error instanceof ApiError ? error.message : 'Failed to remove from favorites'
      );
    }
  };

  // ChatComposer is a floating absolute-positioned element.
  // Give the ScrollView enough bottom padding so the last items can scroll above it.
  const COMPOSER_SCROLL_EXTRA_GAP = 16;
  const floatingNavBottom =
    isKeyboardVisible && keyboardHeight > 0 ? keyboardHeight + 8 : insets.bottom + 16;
  const scrollContentPaddingBottom = isOverlay
    ? undefined
    : floatingNavBottom +
      (mealSummaryTextInputFocused
        ? COMPOSER_SCROLL_EXTRA_GAP
        : mealChatComposerHeight + COMPOSER_SCROLL_EXTRA_GAP);

  // Same white bottom fade as the main tab bar — sits behind the chat input bar.
  const chatBottomFadeHeight = 110 + (insets.bottom || 0);
  const screenWidth = Dimensions.get('window').width;

  const handleAnalysisResult = (analysis: ConversationSummary) => {
    // Meal-chat guardrail short-circuit:
    // Backend returns a sentinel `name` so we can render a single canned message.
    if (analysis?.name === '__MEAL_CHAT_GUARDRAIL__') {
      const guardrailKey = `${analysis.name}:${analysis.description}`;
      if (processedGuardrailRef.current === guardrailKey) return;
      processedGuardrailRef.current = guardrailKey;

      // Reset log-flow state so the next user message starts a fresh summary.
      setBaseDescription(null);
      setClarifications([]);
      setCurrentQuestion(null);
      setPreview(null);
      setAskedQuestions(new Set());
      setQuestionAnswers([]);
      setPendingClarificationQuestions([]);
      setIsAnswersWidgetOpen(false);
      setEditedAmounts(new Map());
      setMealTextEdits(new Map());
      if (mealSummaryTextBlurTimeoutRef.current) {
        clearTimeout(mealSummaryTextBlurTimeoutRef.current);
        mealSummaryTextBlurTimeoutRef.current = null;
      }
      setMealSummaryTextInputFocused(false);
      setPickerState(null);
      setShowDatePicker(false);
      setOriginalMealLog(null);
      loggingFromFavoriteIdRef.current = null;
      setFavoriteTemplateForLoggingId(null);
      setActivitySummaryPreview(null);
      setActivityDraftsByMessageId(new Map());
      processedActivityGuardrailRef.current = null;

      setMessages(prev => [...prev, createAssistantMessage(analysis.description)]);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    // Check if we've already processed this exact analysis result by checking messages
    const analysisKey = `${analysis.name}-${analysis.description}`;
    const existingAnalysisMessage = messages.find(
      m => m.type === 'analysis' && 
      m.analysis && 
      `${m.analysis.name}-${m.analysis.description}` === analysisKey
    );
    if (existingAnalysisMessage && !preserveMergeEditMode) {
      console.log('Analysis result already processed, skipping');
      return;
    }
    // Edit mode: keep chat history — only skip a true duplicate (same full summary), otherwise fall through and append
    if (existingAnalysisMessage && preserveMergeEditMode) {
      const prior = existingAnalysisMessage.analysis;
      if (prior && conversationSummaryFingerprint(prior) === conversationSummaryFingerprint(analysis)) {
        return;
      }
    }

    const questions = Array.isArray(analysis.questions) ? analysis.questions : [];
    if (questions.length > 0) {
      // Keep summary hidden while clarifications are still unresolved.
      setPreview(null);
      const newQuestions = questions.filter((q) => !askedQuestions.has(q.id));
      if (newQuestions.length === 0) {
        // Duplicate/in-flight response with unresolved questions: do not reveal a summary yet.
        return;
      }

      setAskedQuestions(prev => new Set([...prev, ...newQuestions.map((q) => q.id)]));
      setCurrentQuestion({ id: newQuestions[0].id, text: newQuestions[0].text, options: newQuestions[0].options });
      const clarifyingQuestions = newQuestions.map((q) => ({
        id: q.id,
        text: q.text,
        suggestions: sanitizeClarificationSuggestions(q.options),
      }));
      setPendingClarificationQuestions(clarifyingQuestions);
      setIsAnswersWidgetOpen(shouldUseClarificationsCarousel(clarifyingQuestions));
      const summaryQuestionText = getQuestionSummaryText(
        analysis.questionSummary,
        newQuestions.map((q) => ({ text: q.text })),
      );
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        const dup = last?.type === 'question' && last.text === summaryQuestionText;
        if (!dup) {
          next.push({
            id: `q_summary_${Date.now()}`,
            text: summaryQuestionText,
            isUser: false,
            timestamp: new Date(),
            type: 'question',
          });
        }
        return next;
      });
    } else {
      // No more questions - show the analysis
      const { merged, migrateFromId, migratePayload } = mergeAnalysisWithPreservedUserText(
        analysis,
        preserveMergeEditMode,
        messagesRef.current,
        mealTextEditsRef.current
      );
      setCurrentQuestion(null);
      setPreview(merged);
      const newAnalysisId = `a_${Date.now()}`;
      const analysisMessage: Message = {
        id: newAnalysisId,
        isUser: false,
        timestamp: new Date(),
        type: 'analysis',
        analysis: merged,
        text: "Here's a summary of your meal:"
      };
      setMessages(prev => {
        if (preserveMergeEditMode) {
          const last = prev[prev.length - 1];
          if (
            last?.type === 'analysis' &&
            last.analysis &&
            conversationSummaryFingerprint(last.analysis) === conversationSummaryFingerprint(merged)
          ) {
            return prev;
          }
          if (migrateFromId && migratePayload) {
            const from = migrateFromId;
            const payload = migratePayload;
            const to = newAnalysisId;
            queueMicrotask(() => {
              setMealTextEdits((em) => {
                const next = new Map(em);
                next.delete(from);
                next.set(to, payload);
                return next;
              });
            });
          }
          return [...prev, analysisMessage];
        }
        // Only check for duplicate if we have a very recent analysis (within last 2 messages)
        // This prevents immediate duplicates but allows showing analysis after questions
        const recentAnalyses = prev.slice(-2).filter(m => m.type === 'analysis');
        if (recentAnalyses.length > 0 && recentAnalyses[0].analysis?.name === analysis.name) {
          // Very recent duplicate, skip
          return prev;
        }
        return [...prev, analysisMessage];
      });
    }
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleActivityAnalysisResult = (summary: ActivitySummary) => {
    if (summary?.name === '__ACTIVITY_CHAT_GUARDRAIL__') {
      const guardrailKey = `${summary.name}:${summary.description}`;
      if (processedActivityGuardrailRef.current === guardrailKey) return;
      processedActivityGuardrailRef.current = guardrailKey;

      setBaseDescription(null);
      setCurrentQuestion(null);
      setActivitySummaryPreview(null);
      setActivityDraftsByMessageId(new Map());
      setAskedQuestions(new Set());
      setQuestionAnswers([]);
      setPendingClarificationQuestions([]);
      setIsAnswersWidgetOpen(false);
      if (mealSummaryTextBlurTimeoutRef.current) {
        clearTimeout(mealSummaryTextBlurTimeoutRef.current);
        mealSummaryTextBlurTimeoutRef.current = null;
      }
      setMealSummaryTextInputFocused(false);

      setMessages((prev) => [...prev, createAssistantMessage(summary.description)]);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    const analysisKey = activitySummaryFingerprint(summary);
    const existingAnalysisMessage = messages.find(
      (m) => m.type === 'analysis' && m.activitySummary && activitySummaryFingerprint(m.activitySummary) === analysisKey
    );
    if (existingAnalysisMessage) {
      return;
    }

    const questions = Array.isArray(summary.questions) ? summary.questions : [];
    if (questions.length > 0) {
      // Keep summary hidden while clarifications are still unresolved.
      setActivitySummaryPreview(null);
      const newQuestions = questions.filter((q) => !askedQuestions.has(q.id));
      if (newQuestions.length === 0) {
        // Duplicate/in-flight response with unresolved questions: do not reveal a summary yet.
        return;
      }

      setAskedQuestions((prev) => new Set([...prev, ...newQuestions.map((q) => q.id)]));
      setCurrentQuestion({ id: newQuestions[0].id, text: newQuestions[0].text, options: newQuestions[0].options });
      const clarifyingQuestions = newQuestions.map((q) => ({
        id: q.id,
        text: q.text,
        suggestions: sanitizeClarificationSuggestions(q.options),
      }));
      setPendingClarificationQuestions(clarifyingQuestions);
      setIsAnswersWidgetOpen(shouldUseClarificationsCarousel(clarifyingQuestions));
      const summaryQuestionText = getQuestionSummaryText(
        summary.questionSummary,
        newQuestions.map((q) => ({ text: q.text })),
      );
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        const dup = last?.type === 'question' && last.text === summaryQuestionText;
        if (!dup) {
          next.push({
            id: `q_summary_${Date.now()}`,
            text: summaryQuestionText,
            isUser: false,
            timestamp: new Date(),
            type: 'question',
          });
        }
        return next;
      });
    } else {
      setCurrentQuestion(null);
      setActivitySummaryPreview(summary);
      const newAnalysisId = `a_${Date.now()}`;
      const analysisMessage: Message = {
        id: newAnalysisId,
        isUser: false,
        timestamp: new Date(),
        type: 'analysis',
        activitySummary: summary,
        text: "Here's a summary of your workout:",
      };
      setMessages((prev) => {
        const recent = prev.slice(-2).filter((m) => m.type === 'analysis' && m.activitySummary);
        if (
          recent.length > 0 &&
          recent[0].activitySummary &&
          recent[0].activitySummary.name === summary.name
        ) {
          return prev;
        }
        return [...prev, analysisMessage];
      });
      queueMicrotask(() => {
        setActivityDraftsByMessageId((prev) => new Map(prev).set(newAnalysisId, summary));
      });
    }
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const { token } = useAuthStore();
  const posthog = usePostHog();
  const pendingAsyncRequestIds = useChatAsyncStore((s) => s.pendingRequestIds);
  const removePendingAsyncRequestId = useChatAsyncStore((s) => s.removePendingRequestId);

  const cancelPendingOutboundRequest = useCallback(() => {
    pendingOutboundAbortRef.current?.abort();
  }, []);

  const clearPendingComposerSendTracking = useCallback(() => {
    pendingComposerSendRef.current = null;
  }, []);

  const revertPendingComposerSend = useCallback(() => {
    const p = pendingComposerSendRef.current;
    if (!p) return;
    setMessages((prev) => prev.filter((m) => m.id !== p.userMessageId));
    if (p.inputRestore !== null) {
      setInputText(p.inputRestore);
    }
    setQuestionAnswers(p.questionAnswersRestore);
    setBaseDescription(p.baseDescriptionRestore);
    setPendingMealPhotos(p.photoRestore ?? []);
    pendingComposerSendRef.current = null;
  }, []);

  const runOutboundWithAbort = useCallback(async <T,>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    pendingOutboundAbortRef.current?.abort();
    const ac = new AbortController();
    pendingOutboundAbortRef.current = ac;
    try {
      return await fn(ac.signal);
    } finally {
      if (pendingOutboundAbortRef.current === ac) {
        pendingOutboundAbortRef.current = null;
      }
    }
  }, []);

  const sleepWithAbort = useCallback((ms: number, signal: AbortSignal) => {
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(id);
        signal.removeEventListener('abort', onAbort);
        reject(new AbortedRequestError('Request was cancelled'));
      };
      const onDone = () => {
        clearTimeout(id);
        signal.removeEventListener('abort', onAbort);
        resolve();
      };
      const id = setTimeout(onDone, ms);
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    });
  }, []);

  const waitForMealSummaryAsync = useCallback(
    async (
      requestId: string,
      signal: AbortSignal,
    ): Promise<ConversationSummary> => {
      // Lightweight poll fallback while app is active.
      // If the app backgrounds, JS/timers may pause; once resumed, polling continues.
      while (true) {
        const data = await apiClient.get(`/api/v1/logs/summary-async/${requestId}`, { signal });
        const status = data?.status as 'pending' | 'complete' | 'error' | undefined;
        if (status === 'complete' && data?.summary) {
          return data.summary as ConversationSummary;
        }
        if (status === 'error') {
          throw new Error(typeof data?.message === 'string' ? data.message : 'Failed to generate meal summary.');
        }
        await sleepWithAbort(1200, signal);
      }
    },
    [sleepWithAbort],
  );

  const analyzeMutation = useMutation({
    mutationFn: async ({
      description,
      conversationHistory,
      signal,
    }: {
      description: string;
      conversationHistory?: { question: string; answer: string }[];
      signal?: AbortSignal;
    }) => {
      const effectiveSignal = signal ?? new AbortController().signal;
      const payload: any = { mealDescription: description };
      if (conversationHistory && conversationHistory.length > 0) payload.conversationHistory = conversationHistory;

      const asyncData = await apiClient.post('/api/v1/logs/summary-async', payload, { signal: effectiveSignal });

      // Guardrail responses can return immediately with a summary and no requestId.
      if (asyncData?.summary) {
        return asyncData.summary as ConversationSummary;
      }

      const requestId = asyncData?.requestId as string | null | undefined;
      if (!requestId) {
        throw new Error('Failed to start async meal summary.');
      }

      return await waitForMealSummaryAsync(requestId, effectiveSignal);
    },
    onSuccess: (analysis) => {
      // Always process the result, even if app was backgrounded
      console.log('Meal summary received:', analysis);
      // Create a stable key for this result to track if we've processed it
      // Use a combination that uniquely identifies this analysis result
      const resultKey = `${analysis.name}-${analysis.description}-${JSON.stringify(analysis.ingredients || [])}`;
      processedMutationDataRef.current = resultKey;
      posthog.capture('meal_analysis_received', {
        meal_name: analysis.name,
        ingredient_count: analysis.ingredients?.length ?? 0,
        has_questions: (analysis.questions?.length ?? 0) > 0,
      });
      handleAnalysisResult(analysis);
    },
    onError: (error: Error) => {
      // Don't show error for aborted requests (e.g., when app goes to background)
      if (error instanceof AbortedRequestError) {
        console.log('Meal summary request was cancelled');
        revertPendingComposerSend();
        return;
      }
      // For other errors, log them but don't show alert (the UI will handle loading state)
      console.error('Error analyzing meal:', error);
    },
    // Ensure mutation state persists even when app is backgrounded
    retry: false,
  });

  // If a push click (or foreground notification) queued a completed async summary, fetch + render it here.
  useEffect(() => {
    if (pendingAsyncRequestIds.length === 0) return;
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      for (const requestId of pendingAsyncRequestIds) {
        if (cancelled) return;
        try {
          const summary = await waitForMealSummaryAsync(requestId, ac.signal);
          if (cancelled) return;
          processedMutationDataRef.current = conversationSummaryFingerprint(summary);
          handleAnalysisResult(summary);
        } catch (e) {
          console.warn('Failed to process async chat summary:', e);
        } finally {
          removePendingAsyncRequestId(requestId);
        }
      }
    })().catch((e) => console.warn('Async chat summary processing loop failed:', e));

    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsyncRequestIds, removePendingAsyncRequestId, waitForMealSummaryAsync]);

  const analyzePhotoMutation = useMutation({
    mutationFn: async ({
      photoPaths,
      userContext,
      conversationHistory,
      signal,
    }: {
      photoPaths: string[];
      userContext?: string;
      conversationHistory?: { question: string; answer: string }[];
      signal?: AbortSignal;
    }) => {
      const payload: Record<string, unknown> = {
        photoPaths,
      };
      if (userContext && userContext.trim().length > 0) {
        payload.userContext = userContext.trim();
      }
      if (conversationHistory && conversationHistory.length > 0) {
        payload.conversationHistory = conversationHistory;
      }
      const data = await apiClient.post('/api/v1/logs/photo-summary', payload, { signal });
      return {
        summary: data.summary as ConversationSummary,
        sourceDescription:
          typeof data.sourceDescription === 'string' ? data.sourceDescription : userContext ?? '',
      };
    },
    onError: (error: Error) => {
      if (error instanceof AbortedRequestError) {
        console.log('Meal photo summary request was cancelled');
        revertPendingComposerSend();
        return;
      }
      console.error('Error analyzing meal photo:', error);
    },
    retry: false,
  });

  const activityAnalyzeMutation = useMutation({
    mutationFn: async ({
      description,
      conversationHistory,
      signal,
    }: {
      description: string;
      conversationHistory?: Array<{ question: string; answer: string }>;
      signal?: AbortSignal;
    }) => {
      const payload: Record<string, unknown> = { activityDescription: description };
      if (conversationHistory && conversationHistory.length > 0) {
        payload.conversationHistory = conversationHistory;
      }
      const data = await apiClient.post('/api/v1/activity-logs/summary', payload, { signal });
      return data.summary as ActivitySummary;
    },
    onError: (error: Error) => {
      if (error instanceof AbortedRequestError) {
        console.log('Activity summary request was cancelled');
        revertPendingComposerSend();
        return;
      }
      console.error('Error analyzing activity:', error);
    },
    retry: false,
  });

  const logActivityFromChatMutation = useMutation({
    mutationFn: async ({
      summary,
      loggedAt,
      signal,
    }: {
      summary: ActivitySummary;
      loggedAt: string;
      signal?: AbortSignal;
    }) => {
      const exercises = activitySummaryItemsToExerciseSegments(summary.items || []);
      return apiClient.post(
        '/api/v1/activity-logs/create',
        {
          name: summary.name,
          description: summary.description?.trim() ? summary.description : null,
          exercises,
          loggedAt,
        },
        { signal }
      );
    },
    onSuccess: async (_data, variables) => {
      posthog.capture('activity_logged', {
        activity_name: variables.summary.name,
        exercise_count: variables.summary.items?.length ?? 0,
      });
      await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      setBaseDescription(null);
      setActivitySummaryPreview(null);
      setActivityDraftsByMessageId(new Map());
      setAskedQuestions(new Set());
      setQuestionAnswers([]);
      setCurrentQuestion(null);
      setMessages([createActivityInitialAssistantMessage()]);
      setHeaderSegment('chat');
      performClose();
    },
    onError: (error: Error) => {
      if (error instanceof AbortedRequestError) return;
      const apiErr = error as ApiError;
      if (apiErr.status === 401) {
        Alert.alert('Session Expired', 'Please log in again.');
      } else {
        Alert.alert('Error', apiErr.message || 'Failed to log activity');
      }
    },
  });

  const plannerSuggestionsMutation = useMutation({
    mutationFn: async ({ prompt, signal }: { prompt: string; signal?: AbortSignal }) => {
      const explicitMealType = extractExplicitPlannerMealType(prompt);
      const data = await apiClient.post(
        '/api/v1/planner/suggestions',
        {
          prompt,
          mealType: explicitMealType ?? undefined,
          date: selectedDate.toISOString(),
        },
        { signal },
      );
      return data.suggestions as {
        personalizationNote: string;
        canPersonalize: boolean;
        missingProfileFields?: string[];
        options: PlannerSuggestionOption[];
      };
    },
  });

  const plannerWeekMutation = useMutation({
    mutationFn: async ({ prompt, signal }: { prompt: string; signal?: AbortSignal }) => {
      const data = await apiClient.post(
        '/api/v1/planner/week',
        {
          prompt,
          startDate: selectedDate.toISOString(),
          maxDays: 7,
        },
        { signal },
      );
      return data.weekPlan as {
        personalizationNote: string;
        canPersonalize: boolean;
        missingProfileFields?: string[];
        days: PlannerWeekDay[];
      };
    },
  });

  const savePlannerSuggestionMutation = useMutation({
    mutationFn: async ({
      suggestion,
      plannedFor,
      mealTypeOverride,
      existingPlannedMealId,
      messageId,
      mealKey,
    }: {
      suggestion: PlannerSuggestionOption;
      plannedFor?: string;
      mealTypeOverride?: MealTypeTag;
      existingPlannedMealId?: string;
      messageId?: string;
      mealKey?: string;
      saveKey?: string;
    }) => {
      const mealType = mealTypeOverride ?? mealTypeForLog ?? suggestion.mealType ?? getMealPeriodFromProfile(profile) ?? 'dinner';
      const resolvedPlannedFor = plannedFor ?? selectedDate.toISOString();
      const totalNutrition = buildPlannerTotalNutrition(suggestion);

      if (existingPlannedMealId) {
        const data = await apiClient.patch(`/api/v1/logs/${existingPlannedMealId}`, {
          mealType,
          plannedFor: resolvedPlannedFor,
          name: suggestion.name,
          description: suggestion.description,
          totalNutrition,
          ingredients: [],
          recipeId: suggestion.recipe?.recipeId ?? null,
          skipAnalysis: true,
        });

        return {
          savedLog: data.data,
          mealType,
          plannedFor: resolvedPlannedFor,
          messageId,
          mealKey,
          wasUpdate: true,
        };
      }

      const data = await apiClient.post('/api/v1/logs/planned', {
        mealType,
        plannedFor: resolvedPlannedFor,
        name: suggestion.name,
        description: suggestion.description,
        totalNutrition,
        ingredients: [],
        recipeId: suggestion.recipe?.recipeId ?? null,
      });

      return {
        savedLog: data.data,
        mealType,
        plannedFor: resolvedPlannedFor,
        messageId,
        mealKey,
        wasUpdate: false,
      };
    },
    onMutate: ({ saveKey }) => {
      setSavingPlannerCardKey(saveKey ?? null);
    },
    onSuccess: async ({ savedLog, mealType, plannedFor, messageId, mealKey, wasUpdate }, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      if (messageId && mealKey && savedLog?.id) {
        setMessages((prev) =>
          prev.map((message) => {
            if (message.id !== messageId || message.type !== 'plannerWeek' || !message.plannerWeek) {
              return message;
            }

            return {
              ...message,
              plannerWeek: message.plannerWeek.map((day) => ({
                ...day,
                meals: day.meals.map((meal, idx) =>
                  getPlannerMealKey(day.date, meal.slot, idx) === mealKey
                    ? {
                        ...meal,
                        plannedMealId: savedLog.id,
                        plannedFor,
                      }
                    : meal
                ),
              })),
            };
          })
        );
      }
      const plannedDate = new Date(plannedFor);
      setMessages(prev => [
        ...prev,
        createAssistantMessage(
          `${wasUpdate ? 'Updated' : 'Saved'} ${variables.suggestion.name} ${wasUpdate ? 'in' : 'to'} your plan for ${getMealLabel(mealType)} ${formatLoggingForDate(plannedDate)}.`
        ),
      ]);
    },
    onError: (error: ApiError) => {
      console.error('Error saving planned meal:', error);
      Alert.alert('Error', error.message || 'Failed to save planned meal');
    },
    onSettled: () => {
      setSavingPlannerCardKey(null);
    },
  });

  const plannerReplaceMutation = useMutation({
    mutationFn: async ({
      messageId,
      mealKey,
      prompt,
      targetDate,
      targetSlot,
      currentMeal,
      currentPlan,
    }: {
      messageId: string;
      mealKey: string;
      prompt: string;
      targetDate: string;
      targetSlot: MealTypeTag;
      currentMeal: PlannerWeekMeal;
      currentPlan: PlannerWeekDay[];
    }) => {
      const data = await apiClient.post('/api/v1/planner/replace', {
        prompt,
        targetDate,
        targetSlot,
        currentMeal,
        currentPlan,
      });

      return {
        messageId,
        mealKey,
        previousMealName: currentMeal.name,
        replacement: data.replacement as PlannerReplaceResponse,
      };
    },
    onMutate: ({ mealKey }) => {
      setReplacingPlannerMealKey(mealKey);
    },
    onSuccess: ({ messageId, mealKey, previousMealName, replacement }) => {
      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== messageId || message.type !== 'plannerWeek' || !message.plannerWeek) {
            return message;
          }

          return {
            ...message,
            plannerWeek: message.plannerWeek.map((day) => {
              if (day.date !== replacement.targetDate) {
                return day;
              }

              return {
                ...day,
                meals: day.meals.map((meal, idx) =>
                  getPlannerMealKey(day.date, meal.slot, idx) === mealKey
                    ? {
                        ...replacement.replacement,
                        plannedMealId: meal.plannedMealId,
                        plannedFor: meal.plannedFor,
                      }
                    : meal
                ),
              };
            }),
          };
        })
      );
      setMessages((prev) => [
        ...prev,
        createAssistantMessage(
          `Replaced ${previousMealName} with ${replacement.replacement.name} for ${getMealLabel(replacement.targetSlot)} ${formatLoggingForDate(new Date(replacement.targetDate))}.`
        ),
      ]);
    },
    onError: (error: ApiError) => {
      console.error('Error replacing planned meal:', error);
      Alert.alert('Error', error.message || 'Failed to replace planned meal');
    },
    onSettled: () => {
      setReplacingPlannerMealKey(null);
    },
  });

  const handlePlannerSwapPress = useCallback((
    messageId: string,
    meal: PlannerWeekMeal,
    date: string,
    mealKey: string
  ) => {
    if (!plannerSwapSelection || plannerSwapSelection.messageId !== messageId) {
      setPlannerSwapSelection({ messageId, meal, date, mealKey });
      return;
    }

    if (plannerSwapSelection.mealKey === mealKey) {
      setPlannerSwapSelection(null);
      return;
    }

    const sourceSelection = plannerSwapSelection;
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== messageId || message.type !== 'plannerWeek' || !message.plannerWeek) {
          return message;
        }

        return {
          ...message,
          plannerWeek: message.plannerWeek.map((day) => ({
            ...day,
            meals: day.meals.map((candidateMeal, idx) => {
              const candidateKey = getPlannerMealKey(day.date, candidateMeal.slot, idx);

              if (candidateKey === sourceSelection.mealKey) {
                return {
                  ...meal,
                  slot: sourceSelection.meal.slot,
                  mealType: sourceSelection.meal.slot,
                };
              }

              if (candidateKey === mealKey) {
                return {
                  ...sourceSelection.meal,
                  slot: meal.slot,
                  mealType: meal.slot,
                };
              }

              return candidateMeal;
            }),
          })),
        };
      })
    );
    setPlannerSwapSelection(null);
    setMessages((prev) => [
      ...prev,
      createAssistantMessage(
        `Swapped ${sourceSelection.meal.name} with ${meal.name}. Save either slot again if you want to update an already planned meal.`
      ),
    ]);
  }, [plannerSwapSelection]);

  const handleOpenPlannerRecipe = useCallback((recipe?: PlannerRecipeMeta) => {
    if (!recipe?.recipeId) {
      Alert.alert('Recipe unavailable', 'This suggestion does not have recipe details yet.');
      return;
    }
    router.push({
      pathname: '/recipe-detail',
      params: { recipeId: recipe.recipeId },
    });
  }, []);

  const requestPlannerSuggestions = useCallback(async (prompt: string, signal?: AbortSignal) => {
    if (isWeeklyPlanningPrompt(prompt)) {
      try {
        const weekPlan = await plannerWeekMutation.mutateAsync({ prompt, signal });
        const guardrailPrefix = '__MEAL_CHAT_GUARDRAIL__:';
        if (weekPlan?.personalizationNote?.startsWith(guardrailPrefix)) {
          const message = weekPlan.personalizationNote.slice(guardrailPrefix.length);
          setMessages(prev => [...prev, createAssistantMessage(message)]);
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
          return;
        }
        const plannerMessage: Message = {
          id: `planner_week_${Date.now()}`,
          isUser: false,
          timestamp: new Date(),
          type: 'plannerWeek',
          text: weekPlan.personalizationNote,
          plannerWeek: weekPlan.days,
          plannerPersonalizationNote: weekPlan.personalizationNote,
          plannerCanPersonalize: weekPlan.canPersonalize,
          plannerPrompt: prompt,
        };
        setMessages(prev => [...prev, plannerMessage]);
      } catch (error: any) {
        console.error('Planner week error:', error);
        if (error instanceof AbortedRequestError) {
          throw error;
        }
        if (isLlmQuotaExceededError(error)) {
          showLlmQuotaExceededAlert();
        }
        setMessages(prev => [
          ...prev,
          createAssistantMessage(error?.message || buildPlannerPlaceholderResponse(prompt)),
        ]);
      }
      return;
    }

    try {
      const suggestions = await plannerSuggestionsMutation.mutateAsync({ prompt, signal });
      const guardrailPrefix = '__MEAL_CHAT_GUARDRAIL__:';
      if (suggestions?.personalizationNote?.startsWith(guardrailPrefix)) {
        const message = suggestions.personalizationNote.slice(guardrailPrefix.length);
        setMessages(prev => [...prev, createAssistantMessage(message)]);
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        return;
      }
      const plannerMessage: Message = {
        id: `planner_${Date.now()}`,
        isUser: false,
        timestamp: new Date(),
        type: 'plannerSuggestions',
        text: suggestions.personalizationNote,
        plannerSuggestions: suggestions.options,
        plannerPersonalizationNote: suggestions.personalizationNote,
        plannerCanPersonalize: suggestions.canPersonalize,
        plannerPrompt: prompt,
      };
      setMessages(prev => [...prev, plannerMessage]);
    } catch (error: any) {
      console.error('Planner suggestion error:', error);
      if (error instanceof AbortedRequestError) {
        throw error;
      }
      if (isLlmQuotaExceededError(error)) {
        showLlmQuotaExceededAlert();
      }
      setMessages(prev => [
        ...prev,
        createAssistantMessage(error?.message || 'Unable to generate meal suggestions right now. Please try again.'),
      ]);
    }
  }, [plannerSuggestionsMutation, plannerWeekMutation]);

  // Last 20 logged meals, most recent first (no time-of-day window).
  const { data: recentMeals } = useQuery({
    queryKey: ['recentMeals', 'latest20'],
    queryFn: async () => {
      const data = await apiClient.get('/api/v1/logs/recent?limit=20');
      return data.meals as MealSuggestion[];
    },
    enabled: fetchMealLists,
    staleTime: 60 * 1000,
  });

  // Fetch favorite meals (alphabetical) for the Favorites header tab.
  const { data: favoriteMeals } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const data = await apiClient.get('/api/v1/logs/favorites');
      return (data.meals ?? []) as MealSuggestion[];
    },
    enabled: fetchMealLists,
    staleTime: 60 * 1000,
  });

  // Fetch meal log by ID when mealLogId is provided
  const { data: fetchedMealLog } = useQuery({
    queryKey: ['mealLog', mealLogId],
    queryFn: async () => {
      if (!mealLogId) return null;
      const data = await apiClient.get(`/api/v1/logs/${mealLogId}`);
      return data.log as MealLog;
    },
    enabled: !!mealLogId,
  });

  // Fetch meal log when recent meal suggestion is selected
  const {
    data: fetchedRecentMealLog,
    error: fetchedRecentMealLogError,
    isError: isFetchedRecentMealLogError,
  } = useQuery({
    queryKey: ['mealLog', selectedRecentMealId],
    queryFn: async () => {
      if (!selectedRecentMealId) return null;
      const data = await apiClient.get(`/api/v1/logs/${selectedRecentMealId}`);
      return data.log as MealLog;
    },
    enabled: !!selectedRecentMealId,
    retry: false,
  });

  // Fetch favorite when user taps a favorite in the Favorites tab (data comes from favorites table)
  const { data: fetchedFavorite } = useQuery({
    queryKey: ['favorite', selectedFavoriteId],
    queryFn: async () => {
      if (!selectedFavoriteId) return null;
      const data = await apiClient.get(`/api/v1/logs/favorites/${selectedFavoriteId}`);
      return data.favorite as {
        id: string;
        name: string;
        description: string;
        total_nutrition: MealLog['total_nutrition'];
        ingredients: MealLog['ingredients'];
        icon?: string;
        analysis_status?: MealLog['analysis_status'];
        lock_meal_display_name?: boolean;
      };
    },
    enabled: !!selectedFavoriteId,
    retry: false,
  });


  useEffect(() => {
    if (!isFetchedRecentMealLogError) return;
    console.error('Error fetching selected meal log:', fetchedRecentMealLogError);
    Alert.alert(
      'Error',
      fetchedRecentMealLogError instanceof Error
        ? fetchedRecentMealLogError.message
        : 'Failed to load that meal. Please try again.'
    );
    setSelectedRecentMealId(null);
  }, [fetchedRecentMealLogError, isFetchedRecentMealLogError]);

  // When favorite is fetched, show meal card from favorite data and track favoriteId for logging
  useEffect(() => {
    if (!fetchedFavorite || !selectedFavoriteId) return;
    Keyboard.dismiss();
    const fav = fetchedFavorite;
    const syntheticLog: MealLog = {
      id: fav.id,
      name: fav.name,
      description: fav.description,
      total_nutrition: fav.total_nutrition ?? null,
      ingredients: fav.ingredients ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      icon: fav.icon,
      analysis_status: fav.analysis_status,
    };
    const summary = mealLogToConversationSummary(syntheticLog);
    if (isEditFavoriteMode) {
      loggingFromFavoriteIdRef.current = null;
      setFavoriteTemplateForLoggingId(null);
    } else {
      loggingFromFavoriteIdRef.current = fav.id;
      setFavoriteTemplateForLoggingId(fav.id);
    }
    setClarifications([]);
    setCurrentQuestion(null);
    setAskedQuestions(new Set());
    setQuestionAnswers([]);
    setOriginalMealLog(syntheticLog);
    setPreview(summary);
    setBaseDescription(fav.description);
    const analysisMessage: Message = {
      id: `a_fav_${Date.now()}`,
      isUser: false,
      timestamp: new Date(),
      type: 'analysis',
      analysis: summary,
      text: isEditFavoriteMode
        ? "Here's your favorite meal—edit if you like, then save."
        : "Here's your favorite meal—edit if you like, then log it.",
    };
    setMessages(prev => {
      const recentAnalyses = prev.slice(-2).filter(m => m.type === 'analysis');
      if (recentAnalyses.length > 0 && recentAnalyses[0].analysis?.description === summary.description) return prev;
      return [...prev, analysisMessage];
    });
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    setSelectedFavoriteId(null);
  }, [fetchedFavorite, selectedFavoriteId, isEditFavoriteMode]);

  // Handle initial message from navigation or props
  useEffect(() => {
    if (hasConsumedInitialMessageRef.current) return;
    if (initialMessage && initialMessage.trim()) {
      hasConsumedInitialMessageRef.current = true;
      const trimmed = initialMessage.trim();
      const userMessage: Message = {
        id: Date.now().toString(),
        text: trimmed,
        isUser: true,
        timestamp: new Date(),
        type: 'text',
      };
      if (chatMode === 'plan') {
        pendingComposerSendRef.current = {
          userMessageId: userMessage.id,
          inputRestore: trimmed,
          questionAnswersRestore: questionAnswers,
          baseDescriptionRestore: baseDescription,
        photoRestore: null,
        };
        setMessages(prev => [...prev, userMessage]);
        setTimeout(() => {
          void runOutboundWithAbort(async (signal) => {
            await requestPlannerSuggestions(trimmed, signal);
          })
            .then(() => {
              clearPendingComposerSendTracking();
            })
            .catch((err) => {
              if (err instanceof AbortedRequestError) {
                revertPendingComposerSend();
                return;
              }
              if (isLlmQuotaExceededError(err)) {
                showLlmQuotaExceededAlert();
              }
              console.error('Initial planner request failed:', err);
              clearPendingComposerSendTracking();
            });
        }, 0);
        return;
      }
      pendingComposerSendRef.current = {
        userMessageId: userMessage.id,
        inputRestore: trimmed,
        questionAnswersRestore: questionAnswers,
        baseDescriptionRestore: baseDescription,
        photoRestore: null,
      };
      setMessages(prev => [...prev, userMessage]);
      setBaseDescription(trimmed);
      
      // Trigger analysis
      setTimeout(() => {
        // Reset processed mutation ref when starting a new mutation
        processedMutationDataRef.current = null;
        void runOutboundWithAbort((signal) => analyzeMutation.mutateAsync({ description: trimmed, signal }))
          .then(() => {
            clearPendingComposerSendTracking();
          })
          .catch((err) => {
            if (err instanceof AbortedRequestError) {
              revertPendingComposerSend();
              return;
            }
            if (isLlmQuotaExceededError(err)) {
              showLlmQuotaExceededAlert();
            }
            console.error('Initial analyze failed:', err);
            clearPendingComposerSendTracking();
          });
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, chatMode, requestPlannerSuggestions]);

  // Handle recent meal log fetch completion
  useEffect(() => {
    if (fetchedRecentMealLog && selectedRecentMealId) {
      Keyboard.dismiss();
      loggingFromFavoriteIdRef.current = null; // Logging from meal log, not favorite
      setFavoriteTemplateForLoggingId(null);

      // Convert to ConversationSummary for the in-chat review card
      const summary = mealLogToConversationSummary(fetchedRecentMealLog);

      // Reset any prior Q/A state so we're in "duplicate meal" mode
      setClarifications([]);
      setCurrentQuestion(null);
      setAskedQuestions(new Set());
      setQuestionAnswers([]);

      // Store original meal log for change detection / quick re-log
      setOriginalMealLog(fetchedRecentMealLog);

      // Set preview so the app knows we have a pending log
      setPreview(summary);

      // Keep the underlying description for payloads, but do NOT populate the text input
      setBaseDescription(fetchedRecentMealLog.description);

      // Add analysis/review message to chat so the card appears
      const analysisMessage: Message = {
        id: `a_recent_${Date.now()}`,
        isUser: false,
        timestamp: new Date(),
        type: 'analysis',
        analysis: summary,
        text: "Here's a similar meal you logged before:"
      };
      setMessages(prev => {
        // Avoid immediate duplicates if user taps quickly
        const recentAnalyses = prev.slice(-2).filter(m => m.type === 'analysis');
        if (recentAnalyses.length > 0 && recentAnalyses[0].analysis?.description === summary.description) {
          return prev;
        }
        return [...prev, analysisMessage];
      });

      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);

      // Clear selected ID
      setSelectedRecentMealId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedRecentMealLog, selectedRecentMealId]);

  // Handle meal log fetch completion
  useEffect(() => {
    if (fetchedMealLog && mealLogId) {
      // Convert to ConversationSummary
      const summary = mealLogToConversationSummary(fetchedMealLog);
      
      // Store original meal log for change detection
      setOriginalMealLog(fetchedMealLog);
      
      // Set preview
      setPreview(summary);
      
      // In edit meal mode: set selectedDate and baseDescription so follow-up messages include full meal context
      if (isEditMealMode) {
        const dateToUse = fetchedMealLog.logged_at || fetchedMealLog.created_at;
        if (dateToUse) setSelectedDate(new Date(dateToUse));
        const ingredientsList = (summary.ingredients || [])
          .map((i) => `${i.servingAmount} ${i.servingUnit} ${i.name}`)
          .join(', ');
        const mealContext = [
          'Editing existing meal.',
          `Name: ${summary.name}`,
          `Description: ${summary.description}`,
          ingredientsList ? `Ingredients: ${ingredientsList}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        setBaseDescription(mealContext);
      }
      
      // Add analysis message and, in edit mode, set initial message in one update
      const analysisMessage: Message = {
        id: `a_${Date.now()}`,
        isUser: false,
        timestamp: new Date(),
        type: 'analysis',
        analysis: summary,
        text: isEditMealMode ? "Here's the meal you're editing:" : "Here's the previously logged meal:"
      };
      setMessages(prev => {
        const first = isEditMealMode ? { ...prev[0], text: EDIT_MEAL_INITIAL_MESSAGE } : prev[0];
        return [first, ...prev.slice(1), analysisMessage];
      });
      
      // Scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [fetchedMealLog, mealLogId, isEditMealMode]);

  // Handle app state changes to ensure mutation results are processed when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App returned to foreground - check if mutation completed while backgrounded
        // Only re-process if onSuccess hasn't already processed it (which can happen if app was backgrounded)
        if (analyzeMutation.isSuccess && analyzeMutation.data) {
          // Create the same stable key used in onSuccess
          const resultKey = `${analyzeMutation.data.name}-${analyzeMutation.data.description}-${JSON.stringify(analyzeMutation.data.ingredients || [])}`;
          // Only process if we haven't already processed this result
          if (processedMutationDataRef.current !== resultKey) {
            console.log('App returned to foreground, processing mutation result that may have been missed');
            processedMutationDataRef.current = resultKey;
            handleAnalysisResult(analyzeMutation.data);
          } else {
            console.log('App returned to foreground, but mutation result was already processed');
          }
        }
        if (activityAnalyzeMutation.isSuccess && activityAnalyzeMutation.data) {
          const d = activityAnalyzeMutation.data;
          const resultKey = `${d.name}-${d.description}-${JSON.stringify(d.items || [])}`;
          if (processedMutationDataRef.current !== resultKey) {
            processedMutationDataRef.current = resultKey;
            handleActivityAnalysisResult(d);
          }
        }
      }
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzeMutation.isSuccess, analyzeMutation.data, activityAnalyzeMutation.isSuccess, activityAnalyzeMutation.data]);

  const resetChat = (nextChatMode: ChatMode = lockMealChatOnly ? 'log' : chatMode) => {
    setMessages([createInitialAssistantMessage(nextChatMode)]);
    setInputText('');
    setPendingMealPhotos([]);
    photoUploadRequestIdRef.current = Date.now();
    setBaseDescription(null);
    setClarifications([]);
    setCurrentQuestion(null);
    setPreview(null);
    setActivitySummaryPreview(null);
    setActivityDraftsByMessageId(new Map());
    processedActivityGuardrailRef.current = null;
    setSelectedDate(new Date());
    setShowDatePicker(false);
    setAskedQuestions(new Set());
    setQuestionAnswers([]);
    setEditedAmounts(new Map());
    setMealTextEdits(new Map());
    if (mealSummaryTextBlurTimeoutRef.current) {
      clearTimeout(mealSummaryTextBlurTimeoutRef.current);
      mealSummaryTextBlurTimeoutRef.current = null;
    }
    setMealSummaryTextInputFocused(false);
    setPickerState(null);
    setSavingPlannerCardKey(null);
    setReplacingPlannerMealKey(null);
    setPlannerSwapSelection(null);
    setOriginalMealLog(null);
    setSelectedRecentMealId(null);
    setSelectedFavoriteId(null);
    loggingFromFavoriteIdRef.current = null;
    setFavoriteTemplateForLoggingId(null);
    setHeaderSegment('chat');
    setLoggerKind('meal');
    setChatMode(nextChatMode);
    setLoggerMenuVisible(false);
    setLoggerMenuLayout(null);
  };

  const handleChatModeChange = useCallback((nextMode: ChatMode) => {
    if (lockMealChatOnly || loggerKind !== 'meal' || nextMode === chatMode) return;
    Keyboard.dismiss();
    resetChat(nextMode);
  }, [chatMode, lockMealChatOnly, loggerKind]);

  // Keyboard event listeners
  useEffect(() => {
    // Use *did* events so we have reliable keyboard heights on first open.
    const showEvent = 'keyboardDidShow';
    const hideEvent = 'keyboardDidHide';
    
    const keyboardWillShow = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const keyboardWillHide = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      keyboardWillShow?.remove();
      keyboardWillHide?.remove();
    };
  }, []);

  // Animate date picker modal
  useEffect(() => {
    if (showDatePicker) {
      Animated.timing(datePickerBackdropAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      Animated.timing(datePickerContentAnim, {
        toValue: 0,
        duration: 300,
        delay: 50,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(datePickerContentAnim, {
        toValue: 300,
        duration: 250,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        Animated.timing(datePickerBackdropAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [showDatePicker, datePickerBackdropAnim, datePickerContentAnim]);

  const hasUnsavedEditMealChanges = useMemo(() => {
    if (!isEditMealMode || !originalMealLog) return false;
    return messages.some(
      (m) =>
        m.type === 'analysis' &&
        m.analysis &&
        editModeUpdateIsEnabled(
          originalMealLog,
          m.analysis,
          m.id,
          editedAmounts,
          selectedDate,
          mealTextEdits
        )
    );
  }, [isEditMealMode, originalMealLog, messages, editedAmounts, selectedDate, mealTextEdits]);

  const hasUnsavedEditFavoriteChanges = useMemo(() => {
    if (!isEditFavoriteMode || !originalMealLog) return false;
    return messages.some(
      (m) =>
        m.type === 'analysis' &&
        m.analysis &&
        editFavoriteTemplateUpdateIsEnabled(
          originalMealLog,
          m.analysis,
          m.id,
          editedAmounts,
          mealTextEdits
        )
    );
  }, [isEditFavoriteMode, originalMealLog, messages, editedAmounts, mealTextEdits]);

  const performClose = () => {
    Keyboard.dismiss();
    resetChat();
    if (isOverlay && propOnClose) {
      propOnClose();
    } else {
      router.back();
    }
  };

  const requestClose = () => {
    if (hasUnsavedEditMealChanges || hasUnsavedEditFavoriteChanges) {
      Alert.alert(
        'Unsaved changes',
        'You have edits that are not saved yet. Discard them and leave?',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: performClose },
        ]
      );
      return;
    }
    performClose();
  };

  usePreventRemove(hasUnsavedEditMealChanges, ({ data }) => {
    Alert.alert(
      'Unsaved changes',
      'You have edits that are not saved yet. Discard them and leave?',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            Keyboard.dismiss();
            resetChat();
            navigation.dispatch(data.action);
          },
        },
      ]
    );
  });

  const LOGGER_MENU_WIDTH = 224;
  const LOGGER_MENU_HEIGHT = 98;

  const closeLoggerMenu = useCallback(() => {
    setLoggerMenuVisible(false);
    setLoggerMenuLayout(null);
  }, []);

  const openLoggerPicker = useCallback(() => {
    if (lockMealChatOnly) return;
    Keyboard.dismiss();
    loggerTitleAnchorRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
      const { width: winW, height: winH } = Dimensions.get('window');
      const margin = 16;
      const left = Math.min(
        Math.max(margin, x + width / 2 - LOGGER_MENU_WIDTH / 2),
        winW - LOGGER_MENU_WIDTH - margin
      );
      let top = y + height + 4;
      if (top + LOGGER_MENU_HEIGHT > winH - insets.bottom - 8) {
        top = Math.max(margin + insets.top, y - LOGGER_MENU_HEIGHT - 4);
      }
      setLoggerMenuLayout({ top, left });
      setLoggerMenuVisible(true);
    });
  }, [lockMealChatOnly, insets.bottom, insets.top]);

  const { mutate: logMealSummary, isPending: isLoggingSummary } = useMutation({
    mutationFn: async ({
      updatedSummary,
      originalSummary,
      lockMealDisplayName,
      saveAsFavorite,
      signal,
    }: {
      updatedSummary: ConversationSummary;
      originalSummary: ConversationSummary;
      lockMealDisplayName?: boolean;
      saveAsFavorite?: boolean;
      signal?: AbortSignal;
    }) => {
      if (isCreateFavoriteMode) {
        const mealDescriptionPayload =
          updatedSummary.ingredients?.length > 0
            ? mealDescriptionFromIngredients(updatedSummary.ingredients)
            : buildRefinedDescriptionForApi(baseDescription || '', questionAnswers);
        const body: Record<string, unknown> = {
          mealSummary: updatedSummary,
          originalSummary,
          mealDescription: mealDescriptionPayload,
        };
        if (lockMealDisplayName === true) body.lockMealDisplayName = true;
        return await apiClient.post('/api/v1/logs/favorites', body, { signal });
      }

      const mealType = mealTypeForLog ?? getMealPeriodFromProfile(profile) ?? 'dinner';
      const plannedForISO = selectedDate.toISOString();
      const shouldCreatePlanned =
        !isEditMealMode && selectedTimeQualifiesAsPlannedMeal(selectedDate);

      const maybeFavoriteNewLog = async (res: { data?: { id?: string } } | null | undefined) => {
        if (
          !saveAsFavorite ||
          !res?.data?.id ||
          loggingFromFavoriteIdRef.current
        ) {
          return;
        }
        await apiClient.post(`/api/v1/logs/${res.data.id}/favorite`, {}, { signal });
      };

      if (shouldCreatePlanned) {
        const plannedBody: Record<string, unknown> = {
          mealType,
          plannedFor: plannedForISO,
          name: updatedSummary.name,
          description: updatedSummary.description,
        };
        if (loggingFromFavoriteIdRef.current) plannedBody.favoriteId = loggingFromFavoriteIdRef.current;
        const plannedRes = await apiClient.post('/api/v1/logs/planned', plannedBody, { signal });
        await maybeFavoriteNewLog(plannedRes);
        return plannedRes;
      }

      const mealDescriptionPayload =
        updatedSummary.ingredients?.length > 0
          ? mealDescriptionFromIngredients(updatedSummary.ingredients)
          : buildRefinedDescriptionForApi(baseDescription || '', questionAnswers);

      const body: Record<string, unknown> = {
        mealSummary: updatedSummary,
        originalSummary: originalSummary,
        mealDescription: mealDescriptionPayload,
        loggedAt: plannedForISO,
        mealType,
      };
      if (lastUploadedMealPhotoPathsRef.current && lastUploadedMealPhotoPathsRef.current.length > 0) {
        body.photoPaths = lastUploadedMealPhotoPathsRef.current.slice(0, MAX_MEAL_PHOTOS_PER_CHAT_MESSAGE);
      }
      if (loggingFromFavoriteIdRef.current) body.favoriteId = loggingFromFavoriteIdRef.current;
      if (lockMealDisplayName === true) body.lockMealDisplayName = true;
      const createRes = await apiClient.post('/api/v1/logs/create', body, { signal });
      await maybeFavoriteNewLog(createRes);
      return createRes;
    },
    onSuccess: async (_data, variables) => {
      if (isCreateFavoriteModeRef.current) {
        posthog.capture('favorite_meal_saved', {
          meal_name: variables.updatedSummary.name,
          ingredient_count: variables.updatedSummary.ingredients?.length ?? 0,
        });
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
      } else {
        posthog.capture('meal_logged', {
          meal_name: variables.updatedSummary.name,
          ingredient_count: variables.updatedSummary.ingredients?.length ?? 0,
          from_favorite: !!loggingFromFavoriteIdRef.current,
          saved_as_favorite: !!variables.saveAsFavorite && !loggingFromFavoriteIdRef.current,
        });
        if (variables.saveAsFavorite && !loggingFromFavoriteIdRef.current) {
          await queryClient.invalidateQueries({ queryKey: ['favorites'] });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      resetChat();
      performClose();
    },
    onError: (error: Error) => {
      if (error instanceof AbortedRequestError) {
        return;
      }
      const apiErr = error as ApiError;
      console.error('Error logging meal:', error);
      posthog.capture('meal_logging_failed', {
        error_message: apiErr.message ?? error.message,
        is_favorite_mode: isCreateFavoriteModeRef.current,
      });
      if (apiErr.status === 401) {
        Alert.alert('Session Expired', 'Please log in again.');
      } else {
        Alert.alert(
          'Error',
          apiErr.message ||
            (isCreateFavoriteModeRef.current ? 'Failed to save favorite' : 'Failed to log meal')
        );
      }
    },
  });

  const logMealSummaryWithAbort = useCallback(
    (vars: {
      updatedSummary: ConversationSummary;
      originalSummary: ConversationSummary;
      lockMealDisplayName?: boolean;
      saveAsFavorite?: boolean;
    }) => {
      const ac = new AbortController();
      pendingOutboundAbortRef.current?.abort();
      pendingOutboundAbortRef.current = ac;
      logMealSummary(
        { ...vars, signal: ac.signal },
        {
          onSettled: () => {
            if (pendingOutboundAbortRef.current === ac) {
              pendingOutboundAbortRef.current = null;
            }
          },
        },
      );
    },
    [logMealSummary],
  );

  const { mutate: logMealSimple, isPending: isLoggingSimple } = useMutation({
    mutationFn: async ({
      mealLog,
      saveAsFavorite,
    }: {
      mealLog: MealLog;
      saveAsFavorite?: boolean;
    }) => {
      const mealType = mealTypeForLog ?? getMealPeriodFromProfile(profile) ?? 'dinner';
      const plannedForISO = selectedDate.toISOString();
      const shouldCreatePlanned =
        !isEditMealMode && selectedTimeQualifiesAsPlannedMeal(selectedDate);

      // Planned meals can skip summary ONLY when logging from an existing favorite.
      if (shouldCreatePlanned) {
        if (!loggingFromFavoriteIdRef.current) {
          throw new Error('Planned meals must go through summary unless created from a favorite.');
        }
        return await apiClient.post('/api/v1/logs/planned', {
          mealType,
          plannedFor: plannedForISO,
          favoriteId: loggingFromFavoriteIdRef.current,
        });
      }

      const body: Record<string, unknown> = {
        name: mealLog.name,
        description: mealLog.description,
        totalNutrition: mealLog.total_nutrition,
        ingredients: mealLog.ingredients,
        loggedAt: plannedForISO,
        mealType,
      };
      if (loggingFromFavoriteIdRef.current) body.favoriteId = loggingFromFavoriteIdRef.current;
      const res = await apiClient.post('/api/v1/logs/simple', body);
      if (saveAsFavorite && res?.data?.id && !loggingFromFavoriteIdRef.current) {
        await apiClient.post(`/api/v1/logs/${res.data.id}/favorite`, {});
      }
      return res;
    },
    onSuccess: async (_data, variables) => {
      posthog.capture('meal_logged', {
        meal_name: variables.mealLog.name,
        from_favorite: !!loggingFromFavoriteIdRef.current,
        source: 'simple',
        saved_as_favorite: !!variables.saveAsFavorite && !loggingFromFavoriteIdRef.current,
      });
      if (variables.saveAsFavorite && !loggingFromFavoriteIdRef.current) {
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
      }
      await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      resetChat();
      performClose();
    },
    onError: (error: ApiError) => {
      console.error('Error logging meal:', error);
      posthog.capture('meal_logging_failed', {
        error_message: error.message,
        source: 'simple',
      });
      if (error.status === 401) {
        Alert.alert('Session Expired', 'Please log in again.');
      } else {
        Alert.alert('Error', error.message || 'Failed to log meal');
      }
    },
  });

  const { mutate: updateMeal, isPending: isUpdatingMeal } = useMutation({
    mutationFn: async ({
      mealLogId: id,
      mealLog,
      mealType: mealTypeOverride,
      unlinkFavorite,
      syncFavoriteTemplate,
      skipAnalysis,
    }: {
      mealLogId: string;
      mealLog: MealLog;
      mealType?: MealTypeTag;
      unlinkFavorite?: boolean;
      syncFavoriteTemplate?: boolean;
      /** When true, API skips async nutrition re-analysis (e.g. name/description-only edit). */
      skipAnalysis?: boolean;
    }) => {
      // When editing, preserve the original meal's type so it doesn't move to another bucket
      const mealType =
        mealTypeOverride ??
        mealTypeForLog ??
        getMealPeriodFromProfile(profile) ??
        'dinner';
      const body: Record<string, unknown> = {
        name: mealLog.name,
        description: mealLog.description,
        totalNutrition: mealLog.total_nutrition,
        ingredients: mealLog.ingredients,
        loggedAt: selectedDate.toISOString(),
        mealType,
      };
      if (unlinkFavorite) body.unlinkFavorite = true;
      if (syncFavoriteTemplate) body.syncFavoriteTemplate = true;
      if (skipAnalysis === true) body.skipAnalysis = true;
      const data = await apiClient.patch(`/api/v1/logs/${id}`, body);
      return data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['logsRange'] });
      if (variables?.unlinkFavorite || variables?.syncFavoriteTemplate) {
        await queryClient.invalidateQueries({ queryKey: ['favorites'] });
      }
      if (variables?.mealLogId) {
        await queryClient.invalidateQueries({ queryKey: ['mealLog', variables.mealLogId] });
      }
      resetChat();
      performClose();
    },
    onError: (error: ApiError) => {
      console.error('Error updating meal:', error);
      if (error.status === 401) {
        Alert.alert('Session Expired', 'Please log in again.');
      } else {
        Alert.alert('Error', error.message || 'Failed to update meal');
      }
    },
  });

  const { mutate: updateFavoriteTemplate, isPending: isUpdatingFavoriteTemplate } = useMutation({
    mutationFn: async ({
      favoriteId,
      mealLog,
      skipAnalysis,
      lockMealDisplayName,
    }: {
      favoriteId: string;
      mealLog: MealLog;
      skipAnalysis?: boolean;
      lockMealDisplayName?: boolean;
    }) => {
      const body: Record<string, unknown> = {
        name: mealLog.name,
        description: mealLog.description,
        totalNutrition: mealLog.total_nutrition,
        ingredients: mealLog.ingredients,
      };
      if (skipAnalysis === true) body.skipAnalysis = true;
      if (lockMealDisplayName === true) body.lockMealDisplayName = true;
      return apiClient.patch(`/api/v1/logs/favorites/${favoriteId}`, body);
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['favorites'] });
      if (variables?.favoriteId) {
        await queryClient.invalidateQueries({ queryKey: ['favorite', variables.favoriteId] });
      }
      resetChat();
      performClose();
    },
    onError: (error: ApiError) => {
      console.error('Error updating favorite template:', error);
      if (error.status === 401) {
        Alert.alert('Session Expired', 'Please log in again.');
      } else {
        Alert.alert('Error', error.message || 'Failed to update favorite');
      }
    },
  });

  const hasChanges = (original: MealLog | null, current: ConversationSummary | null): boolean => {
    if (!original || !current) return false;
    
    const originalIngredients = original.ingredients || [];
    const currentIngredients = current.ingredients || [];
    
    if (originalIngredients.length !== currentIngredients.length) {
      return true;
    }
    
    for (let i = 0; i < currentIngredients.length; i++) {
      const currentIng = currentIngredients[i];
      const originalIng = originalIngredients[i];
      
      if (!originalIng) {
        return true;
      }
      
      if (Math.abs(currentIng.servingAmount - originalIng.servingAmount) > 0.01) {
        return true;
      }
      
      if (currentIng.name !== originalIng.name) {
        return true;
      }
    }
    
    return false;
  };

  const startPhotoUpload = useCallback(
    async (asset: { uri: string; mimeType?: string | null; fileName?: string | null }) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const requestId = Date.now();
      photoUploadRequestIdRef.current = requestId;
      setPendingMealPhotos((prev) => {
        if (prev.length >= MAX_MEAL_PHOTOS_PER_CHAT_MESSAGE) return prev;
        return [
          ...prev,
          {
            id,
            localUri: asset.uri,
            mimeType: asset.mimeType,
            fileName: asset.fileName,
            storagePath: null,
            status: 'uploading',
            error: null,
          },
        ];
      });

      try {
        const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
        const TARGET_MAX_EDGE_PX = 2048;

        const getFileSizeBytes = async (uri: string): Promise<number | null> => {
          try {
            const info = await FileSystem.getInfoAsync(uri, { size: true });
            return typeof (info as { size?: unknown }).size === 'number'
              ? ((info as { size: number }).size ?? null)
              : null;
          } catch {
            return null;
          }
        };

        const compressAndDownscale = async (): Promise<{
          uri: string;
          mimeType: string;
          fileName: string;
        }> => {
          const sizesToTry = [0.72, 0.6, 0.48] as const;
          const originalSize = await getFileSizeBytes(asset.uri);
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[mealPhotoUpload] preprocess', {
              originalUriScheme: asset.uri.split(':')[0] ?? 'unknown',
              originalSize,
            });
          }

          for (const compress of sizesToTry) {
            const result = await ImageManipulator.manipulateAsync(
              asset.uri,
              [{ resize: { width: TARGET_MAX_EDGE_PX } }],
              { compress, format: ImageManipulator.SaveFormat.JPEG },
            );
            const size = await getFileSizeBytes(result.uri);
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.log('[mealPhotoUpload] preprocess attempt', { compress, size });
            }
            if (size != null && size <= MAX_UPLOAD_BYTES) {
              return { uri: result.uri, mimeType: 'image/jpeg', fileName: 'meal-photo.jpg' };
            }
          }

          // If size couldn't be determined, or still too large, keep last attempt and let server enforce.
          const fallback = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: TARGET_MAX_EDGE_PX } }],
            { compress: 0.48, format: ImageManipulator.SaveFormat.JPEG },
          );
          const fallbackSize = await getFileSizeBytes(fallback.uri);
          if (fallbackSize != null && fallbackSize > MAX_UPLOAD_BYTES) {
            throw new Error('This photo is too large to upload. Try a smaller image.');
          }
          return { uri: fallback.uri, mimeType: 'image/jpeg', fileName: 'meal-photo.jpg' };
        };

        const prepared =
          Platform.OS === 'web'
            ? {
                uri: asset.uri,
                mimeType: asset.mimeType ?? 'image/jpeg',
                fileName: asset.fileName ?? 'meal-photo.jpg',
              }
            : await compressAndDownscale();

        const uploadResult = await uploadMealPhotoToStorage({
          localUri: prepared.uri,
          mimeType: prepared.mimeType,
          fileName: prepared.fileName,
        });
        if (photoUploadRequestIdRef.current !== requestId) return;
        setPendingMealPhotos((prev) =>
          prev.map((p) =>
            p.id !== id
              ? p
              : {
                  ...p,
                  storagePath: uploadResult.path,
                  status: 'uploaded',
                  error: null,
                },
          ),
        );
      } catch (error) {
        if (photoUploadRequestIdRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : 'Upload failed. Please try again.';
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.error('[mealPhotoUpload] composer handler failed', { id, message, error });
        }
        setPendingMealPhotos((prev) =>
          prev.map((p) =>
            p.id !== id
              ? p
              : {
                  ...p,
                  status: 'failed',
                  error: message,
                },
          ),
        );
      }
    },
    [],
  );

  const handleOpenCamera = useCallback(async () => {
    if (pendingMealPhotos.length >= MAX_MEAL_PHOTOS_PER_CHAT_MESSAGE) {
      Alert.alert(
        'One photo per message',
        'Remove the attached photo or send this message before adding another.',
      );
      return;
    }
    const before = await ImagePicker.getCameraPermissionsAsync();
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    const after = await ImagePicker.getCameraPermissionsAsync();
    console.log('[camera-permission]', { before, request: permission, after });
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
        'Camera Access Needed',
        `Camera permission is currently "${permission.status}".\n\nDebug:\nbefore=${before.status} canAskAgain=${before.canAskAgain}\nrequest=${permission.status} canAskAgain=${permission.canAskAgain}\nafter=${after.status} canAskAgain=${after.canAskAgain}\n\nPlease enable Camera access to take meal photos.`,
        actions
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    await startPhotoUpload(result.assets[0]);
  }, [startPhotoUpload, pendingMealPhotos.length]);

  const handleOpenPhotoLibrary = useCallback(async () => {
    if (pendingMealPhotos.length >= MAX_MEAL_PHOTOS_PER_CHAT_MESSAGE) {
      Alert.alert(
        'One photo per message',
        'Remove the attached photo or send this message before adding another.',
      );
      return;
    }
    const before = await ImagePicker.getMediaLibraryPermissionsAsync();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const after = await ImagePicker.getMediaLibraryPermissionsAsync();
    console.log('[photos-permission]', { before, request: permission, after });
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
        'Photos Access Needed',
        `Photos permission is currently "${permission.status}".\n\nDebug:\nbefore=${before.status} canAskAgain=${before.canAskAgain}\nrequest=${permission.status} canAskAgain=${permission.canAskAgain}\nafter=${after.status} canAskAgain=${after.canAskAgain}\n\nPlease enable Photos access to pick meal photos.`,
        actions
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
    await startPhotoUpload(result.assets[0]);
  }, [startPhotoUpload, pendingMealPhotos.length]);

  const handleRemovePendingPhoto = useCallback((localUri: string) => {
    setPendingMealPhotos((prev) => prev.filter((p) => p.localUri !== localUri));
  }, []);

  const handleRetryPendingPhotoUpload = useCallback(
    async (localUri: string) => {
      const target = pendingMealPhotos.find((p) => p.localUri === localUri);
      if (!target) return;
      setPendingMealPhotos((prev) =>
        prev.map((p) =>
          p.localUri !== localUri
            ? p
            : {
                ...p,
                status: 'uploading',
                error: null,
              },
        ),
      );
      await startPhotoUpload({
        uri: target.localUri,
        mimeType: target.mimeType ?? undefined,
        fileName: target.fileName ?? undefined,
      });
      // Remove the old failed entry (startPhotoUpload re-adds a fresh tile)
      setPendingMealPhotos((prev) => prev.filter((p) => p.id !== target.id));
    },
    [pendingMealPhotos, startPhotoUpload],
  );

  const composerPhotoAttachments: ComposerPhotoAttachment[] | null = useMemo(() => {
    if (pendingMealPhotos.length === 0) return null;
    return pendingMealPhotos.map((p) => ({
      localUri: p.localUri,
      status: p.status,
      error: p.error,
    }));
  }, [pendingMealPhotos]);

  const handleSubmitClarifications = useCallback(
    async (answers: ChatAnswersCarouselAnswer[]) => {
      const clean = (Array.isArray(answers) ? answers : [])
        .map((a) => ({
          questionId: a.questionId,
          question: (a.question ?? '').trim(),
          answer: (a.answer ?? '').trim(),
        }))
        .filter((a) => a.question.length > 0 && a.answer.length > 0);

      if (clean.length === 0) {
        setIsAnswersWidgetOpen(false);
        return;
      }

      const combinedText = clean.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n');

      posthog.capture('chat_message_sent', {
        chat_mode: chatMode,
        logger_kind: loggerKind,
        message_length: combinedText.length,
        includes_meal_photo: false,
        meal_photo_count: 0,
      });

      if (!isOverlay) {
        Keyboard.dismiss();
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        text: combinedText,
        isUser: true,
        timestamp: new Date(),
        type: 'text',
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsAnswersWidgetOpen(false);
      setPendingClarificationQuestions([]);

      const nextQAPairs = [...questionAnswers, ...clean];
      setQuestionAnswers(nextQAPairs);

      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);

      // Clarifications are a log-flow concept; fall back to normal message send in planner mode.
      if (chatMode === 'plan') {
        return;
      }

      try {
        if (loggerKind === 'activity' && headerSegment === 'chat') {
          const conversationHistory = nextQAPairs.map((qa) => ({ question: qa.question, answer: qa.answer }));
          processedMutationDataRef.current = null;
          const descriptionForApi = buildActivitySummaryApiDescription(baseDescription || '', conversationHistory);
          const summary = await runOutboundWithAbort((signal) =>
            activityAnalyzeMutation.mutateAsync({
              description: descriptionForApi,
              conversationHistory,
              signal,
            }),
          );
          const resultKey = `${summary.name}-${summary.description}-${JSON.stringify(summary.items || [])}`;
          processedMutationDataRef.current = resultKey;
          handleActivityAnalysisResult(summary);
          return;
        }

        const conversationHistory = nextQAPairs.map((qa) => ({ question: qa.question, answer: qa.answer }));
        processedMutationDataRef.current = null;
        const descriptionForApi = buildMealSummaryApiMealDescription(
          messagesRef.current,
          editedAmounts,
          baseDescription || '',
          nextQAPairs,
        );
        const analysis = await runOutboundWithAbort((signal) =>
          analyzeMutation.mutateAsync({
            description: descriptionForApi,
            conversationHistory,
            signal,
          }),
        );
        handleAnalysisResult(analysis);
      } catch (error: unknown) {
        if (error instanceof AbortedRequestError) {
          console.log('Clarifications request was cancelled');
          return;
        }
        if (isLlmQuotaExceededError(error)) {
          showLlmQuotaExceededAlert();
        }
        console.error('Clarifications analyze/log error:', error);
        const errMessage: Message = {
          id: `e_${Date.now()}`,
          isUser: false,
          timestamp: new Date(),
          text: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        };
        setMessages((prev) => [...prev, errMessage]);
      }
    },
    [
      activityAnalyzeMutation,
      baseDescription,
      chatMode,
      editedAmounts,
      handleActivityAnalysisResult,
      handleAnalysisResult,
      headerSegment,
      isOverlay,
      loggerKind,
      posthog,
      questionAnswers,
      runOutboundWithAbort,
      analyzeMutation,
    ],
  );

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    const uploadedPhotos = pendingMealPhotos.filter(
      (p) => p.status === 'uploaded' && typeof p.storagePath === 'string' && p.storagePath.length > 0,
    );
    if (!trimmed && uploadedPhotos.length === 0) return;

    posthog.capture('chat_message_sent', {
      chat_mode: chatMode,
      logger_kind: loggerKind,
      message_length: trimmed.length,
      includes_meal_photo: uploadedPhotos.length > 0,
      meal_photo_count: uploadedPhotos.length,
    });

    const questionAnswersSnapshot = questionAnswers;
    const baseDescriptionSnapshot = baseDescription;

    // In overlay mode, keep keyboard open (input lives outside this component).
    if (!isOverlay) {
      Keyboard.dismiss();
    }

    if (trimmed || uploadedPhotos.length > 0) {
      const userMessage: Message = {
        id: Date.now().toString(),
        text: trimmed || 'Shared a meal photo',
        isUser: true,
        timestamp: new Date(),
        type: 'text',
        photo:
          uploadedPhotos.length > 0
            ? {
                localUri: uploadedPhotos[0].localUri,
                storagePath: uploadedPhotos[0].storagePath,
              }
            : undefined,
      };
      setMessages(prev => [...prev, userMessage]);
      pendingComposerSendRef.current = {
        userMessageId: userMessage.id,
        inputRestore: !isOverlay ? trimmed : null,
        questionAnswersRestore: questionAnswersSnapshot,
        baseDescriptionRestore: baseDescriptionSnapshot,
        photoRestore: null,
      };
      // Clear input - in overlay mode, parent handles this; in non-overlay, we clear local state
      if (!isOverlay) {
        setInputText('');
        setPendingMealPhotos([]);
        lastUploadedMealPhotoPathsRef.current = uploadedPhotos
          .map((p) => p.storagePath!)
          .slice(0, MAX_MEAL_PHOTOS_PER_CHAT_MESSAGE);
      }
    }

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    if (chatMode === 'plan') {
      try {
        await runOutboundWithAbort(async (signal) => {
          await requestPlannerSuggestions(trimmed, signal);
        });
        clearPendingComposerSendTracking();
      } catch (error: any) {
        if (error instanceof AbortedRequestError) {
          console.log('Planner request was cancelled');
          revertPendingComposerSend();
          return;
        }
        clearPendingComposerSendTracking();
        throw error;
      }
      return;
    }

    if (loggerKind === 'activity' && headerSegment === 'chat') {
      try {
        if (activitySummaryPreview) {
          const currentQ = questionAnswers.length > 0 ? questionAnswers[questionAnswers.length - 1] : null;
          const newQAPairs = currentQ
            ? [...questionAnswers.slice(0, -1), { ...currentQ, answer: `${currentQ.answer}, ${trimmed}` }]
            : [
                ...questionAnswers,
                { questionId: `refinement_${Date.now()}`, question: 'Additional details', answer: trimmed },
              ];
          setQuestionAnswers(newQAPairs);
          const conversationHistory = newQAPairs.map((qa) => ({ question: qa.question, answer: qa.answer }));
          processedMutationDataRef.current = null;
          const descriptionForApi = buildActivitySummaryApiDescription(baseDescription || '', conversationHistory);
          const summary = await runOutboundWithAbort((signal) =>
            activityAnalyzeMutation.mutateAsync({
              description: descriptionForApi,
              conversationHistory,
              signal,
            }),
          );
          const resultKey = `${summary.name}-${summary.description}-${JSON.stringify(summary.items || [])}`;
          processedMutationDataRef.current = resultKey;
          handleActivityAnalysisResult(summary);
          clearPendingComposerSendTracking();
          return;
        }

        if (!baseDescription) {
          setBaseDescription(trimmed);
          processedMutationDataRef.current = null;
          const summary = await runOutboundWithAbort((signal) =>
            activityAnalyzeMutation.mutateAsync({ description: trimmed, signal }),
          );
          const resultKey = `${summary.name}-${summary.description}-${JSON.stringify(summary.items || [])}`;
          processedMutationDataRef.current = resultKey;
          handleActivityAnalysisResult(summary);
          clearPendingComposerSendTracking();
          return;
        }

        if (askedQuestions.size >= 3) {
          const newQAPairs = [
            ...questionAnswers,
            { questionId: `qa_${Date.now()}`, question: 'User clarification', answer: trimmed },
          ];
          setQuestionAnswers(newQAPairs);
          const conversationHistory = newQAPairs.map((qa) => ({ question: qa.question, answer: qa.answer }));
          processedMutationDataRef.current = null;
          const descriptionForApi = buildActivitySummaryApiDescription(baseDescription, conversationHistory);
          const summaryRaw = await runOutboundWithAbort((signal) =>
            activityAnalyzeMutation.mutateAsync({
              description: descriptionForApi,
              conversationHistory,
              signal,
            }),
          );
          const summary =
            summaryRaw.questions && summaryRaw.questions.length > 0
              ? { ...summaryRaw, questions: [] }
              : summaryRaw;
          const resultKey = `${summary.name}-${summary.description}-${JSON.stringify(summary.items || [])}`;
          processedMutationDataRef.current = resultKey;
          handleActivityAnalysisResult(summary);
          clearPendingComposerSendTracking();
          return;
        }

        const lastQuestionMessage = messages.filter((m) => m.type === 'question').slice(-1)[0];
        const questionText = lastQuestionMessage?.text || 'Clarification';
        const newQAPairs = [
          ...questionAnswers,
          { questionId: `qa_${Date.now()}`, question: questionText, answer: trimmed },
        ];
        setQuestionAnswers(newQAPairs);
        const conversationHistory = newQAPairs.map((qa) => ({ question: qa.question, answer: qa.answer }));
        processedMutationDataRef.current = null;
        const descriptionForApi = buildActivitySummaryApiDescription(baseDescription, conversationHistory);
        const summary = await runOutboundWithAbort((signal) =>
          activityAnalyzeMutation.mutateAsync({
            description: descriptionForApi,
            conversationHistory,
            signal,
          }),
        );
        const resultKey = `${summary.name}-${summary.description}-${JSON.stringify(summary.items || [])}`;
        processedMutationDataRef.current = resultKey;
        handleActivityAnalysisResult(summary);
        clearPendingComposerSendTracking();
      } catch (error: unknown) {
        if (error instanceof AbortedRequestError) {
          console.log('Activity summary request was cancelled');
          revertPendingComposerSend();
          return;
        }
        clearPendingComposerSendTracking();
        console.error('Activity analyze/log error:', error);
        const errMessage: Message = {
          id: `e_${Date.now()}`,
          isUser: false,
          timestamp: new Date(),
          text: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        };
        setMessages((prev) => [...prev, errMessage]);
      }
      return;
    }

    try {
      if (preview) {
        const currentQ = questionAnswers.length > 0 ? questionAnswers[questionAnswers.length - 1] : null;
        const newQAPairs = currentQ
          ? [...questionAnswers.slice(0, -1), { ...currentQ, answer: `${currentQ.answer}, ${trimmed}` }]
          : [...questionAnswers, { questionId: `refinement_${Date.now()}`, question: 'Additional details', answer: trimmed }];
        setQuestionAnswers(newQAPairs);
        const conversationHistory = newQAPairs.map((qa) => ({ question: qa.question, answer: qa.answer }));
        processedMutationDataRef.current = null;
        const descriptionForApi = buildMealSummaryApiMealDescription(
          messages,
          editedAmounts,
          baseDescription || '',
          newQAPairs
        );
        const analysis = await runOutboundWithAbort((signal) =>
          analyzeMutation.mutateAsync({
            description: descriptionForApi,
            conversationHistory,
            signal,
          }),
        );
        handleAnalysisResult(analysis);
        clearPendingComposerSendTracking();
        return;
      }

      if (!baseDescription) {
        setBaseDescription(trimmed);
        // Reset processed mutation ref when starting a new mutation
        processedMutationDataRef.current = null;
        const photoPathsForSummary =
          lastUploadedMealPhotoPathsRef.current?.length
            ? lastUploadedMealPhotoPathsRef.current.slice(0, MAX_MEAL_PHOTOS_PER_CHAT_MESSAGE)
            : uploadedPhotos.map((p) => p.storagePath!).slice(0, MAX_MEAL_PHOTOS_PER_CHAT_MESSAGE);
        if (photoPathsForSummary.length > 0) {
          const photoResult = await runOutboundWithAbort((signal) =>
            analyzePhotoMutation.mutateAsync({
              photoPaths: photoPathsForSummary,
              userContext: trimmed,
              signal,
            }),
          );
          setBaseDescription(photoResult.sourceDescription || trimmed);
          handleAnalysisResult(photoResult.summary);
          clearPendingComposerSendTracking();
          return;
        }
        const analysis = await runOutboundWithAbort((signal) =>
          analyzeMutation.mutateAsync({ description: trimmed, signal }),
        );
        handleAnalysisResult(analysis);
        clearPendingComposerSendTracking();
        return;
      }

      if (askedQuestions.size >= 3) {
        const newQAPairs = [...questionAnswers, { questionId: `qa_${Date.now()}`, question: 'User clarification', answer: trimmed }];
        setQuestionAnswers(newQAPairs);
        const conversationHistory = newQAPairs.map(qa => ({ question: qa.question, answer: qa.answer }));
        // Reset processed mutation ref when starting a new mutation
      processedMutationDataRef.current = null;
      const descriptionForApi = buildMealSummaryApiMealDescription(
        messages,
        editedAmounts,
        baseDescription,
        newQAPairs
      );
      const analysis = await runOutboundWithAbort((signal) =>
        analyzeMutation.mutateAsync({
          description: descriptionForApi,
          conversationHistory,
          signal,
        }),
      );
        if (analysis.questions && analysis.questions.length > 0) {
          analysis.questions = [];
        }
        handleAnalysisResult(analysis);
        clearPendingComposerSendTracking();
        return;
      }

      const currentQuestion = questionAnswers.length < askedQuestions.size 
        ? Array.from(askedQuestions).slice(-1)[0] 
        : null;
      
      const lastQuestionMessage = messages.filter(m => m.type === 'question').slice(-1)[0];
      const questionText = lastQuestionMessage?.text || 'Clarification';
      
      const newQAPairs = [...questionAnswers, { 
        questionId: currentQuestion || `qa_${Date.now()}`, 
        question: questionText, 
        answer: trimmed 
      }];
      setQuestionAnswers(newQAPairs);
      
      const conversationHistory = newQAPairs.map(qa => ({ question: qa.question, answer: qa.answer }));
      // Reset processed mutation ref when starting a new mutation
      processedMutationDataRef.current = null;
      const descriptionForApi = buildMealSummaryApiMealDescription(
        messages,
        editedAmounts,
        baseDescription,
        newQAPairs
      );
      const analysis = await runOutboundWithAbort((signal) =>
        analyzeMutation.mutateAsync({
          description: descriptionForApi,
          conversationHistory,
          signal,
        }),
      );
      handleAnalysisResult(analysis);
      clearPendingComposerSendTracking();
    } catch (error: any) {
      // Don't show error for aborted requests (e.g., when app goes to background)
      if (error instanceof AbortedRequestError) {
        console.log('Meal summary request was cancelled');
        revertPendingComposerSend();
        return;
      }
      if (isLlmQuotaExceededError(error)) {
        showLlmQuotaExceededAlert();
      }
      clearPendingComposerSendTracking();
      console.error('Analyze/log error:', error);
      const errMessage: Message = {
        id: `e_${Date.now()}`,
        isUser: false,
        timestamp: new Date(),
        text: error?.message || 'Something went wrong. Please try again.',
      };
      setMessages(prev => [...prev, errMessage]);
    }
  };

  const handleRemoveAnalysisIngredient = useCallback((messageId: string, index: number) => {
    setPickerState((ps) => {
      if (!ps || ps.messageId !== messageId) return ps;
      if (ps.ingredientIndex === index) return { ...ps, visible: false };
      if (ps.ingredientIndex > index) return { ...ps, ingredientIndex: ps.ingredientIndex - 1 };
      return ps;
    });
    setEditedAmounts((prev) => {
      const next = new Map(prev);
      const perMsg = next.get(messageId);
      if (perMsg) {
        const newPerMsg = new Map<number, number>();
        for (const [i, v] of perMsg) {
          if (i === index) continue;
          if (i < index) newPerMsg.set(i, v);
          else newPerMsg.set(i - 1, v);
        }
        if (newPerMsg.size === 0) next.delete(messageId);
        else next.set(messageId, newPerMsg);
      }
      return next;
    });
    setMessages((prev) => {
      const next = prev.map((m) => {
        if (m.id !== messageId || !m.analysis) return m;
        const ing = m.analysis.ingredients;
        if (index < 0 || index >= ing.length) return m;
        const newIngredients = ing.filter((_, i) => i !== index);
        const forDescription = dropZeroServingIngredients(newIngredients);
        return {
          ...m,
          analysis: {
            ...m.analysis,
            ingredients: newIngredients,
            description: showMealHeaderFullEdit
              ? m.analysis.description
              : mealDescriptionFromIngredients(forDescription),
          },
        };
      });
      const lastAfter = [...next].reverse().find((x) => x.type === 'analysis' && x.analysis);
      if (lastAfter?.id === messageId && lastAfter.analysis) {
        requestAnimationFrame(() => setPreview(lastAfter.analysis!));
      }
      return next;
    });
  }, [showMealHeaderFullEdit]);

  // When the parent triggers a submit (overlay mode), run the normal submit flow.
  const lastSubmitNonceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!isOverlay) return;
    if (submitNonce === undefined) return;
    if (lastSubmitNonceRef.current === undefined) {
      // First time opening the overlay - reset chat to ensure fresh start
      resetChat();
      lastSubmitNonceRef.current = submitNonce;
      return;
    }
    if (submitNonce !== lastSubmitNonceRef.current && propSubmittedText) {
      lastSubmitNonceRef.current = submitNonce;
      void handleSubmit(propSubmittedText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOverlay, submitNonce, propSubmittedText]);

  const showActivityLoggerSegments = loggerKind === 'activity';
  const isPlannerMode = loggerKind === 'meal' && !lockMealChatOnly && chatMode === 'plan';
  const showMealModeToggle = loggerKind === 'meal' && !lockMealChatOnly;
  const showMealLoggerSegments = loggerKind === 'meal' && !lockMealChatOnly && chatMode === 'log';
  const showActivityChatPanel = loggerKind === 'activity' && headerSegment === 'chat';
  const showMealChatPanel =
    loggerKind === 'meal' && (lockMealChatOnly || chatMode === 'plan' || headerSegment === 'chat');
  const showPlannerExamples = isPlannerMode && messages.length === 1;
  const sharedInputPlaceholder = isPlannerMode
    ? 'What should I eat?'
    : loggerKind === 'activity' && activitySummaryPreview != null
      ? 'Any changes to this workout?'
      : loggerKind === 'activity'
        ? 'What did you do?'
        : loggerKind === 'meal' && (preview != null || isEditMealMode || isEditFavoriteMode)
          ? 'Any changes to this meal?'
          : 'What did you eat?';
  const isPlannerPending = chatMode === 'plan' && (plannerSuggestionsMutation.isPending || plannerWeekMutation.isPending);
  const isMealChatPending =
    chatMode === 'log' &&
    loggerKind === 'meal' &&
    (isLoggingSummary || analyzeMutation.isPending || analyzePhotoMutation.isPending);
  const isActivityChatPending =
    loggerKind === 'activity' && headerSegment === 'chat' && (activityAnalyzeMutation.isPending || logActivityFromChatMutation.isPending);
  const isChatPending = isMealChatPending || isActivityChatPending;
  const isMealPhotoUploadPending = pendingMealPhotos.some((p) => p.status === 'uploading');
  const isInputPending = isChatPending || isPlannerPending;

  const handleMealSummaryTextFieldFocus = useCallback(() => {
    if (mealSummaryTextBlurTimeoutRef.current) {
      clearTimeout(mealSummaryTextBlurTimeoutRef.current);
      mealSummaryTextBlurTimeoutRef.current = null;
    }
    setMealSummaryTextInputFocused(true);
  }, []);

  const handleMealSummaryTextFieldBlur = useCallback(() => {
    mealSummaryTextBlurTimeoutRef.current = setTimeout(() => {
      mealSummaryTextBlurTimeoutRef.current = null;
      setMealSummaryTextInputFocused(false);
    }, 120);
  }, []);

  const renderMessageBubble = (message: Message) => {
    if (message.type === 'plannerWeek' && message.plannerWeek) {
      return (
        <View style={styles.analysisContainer}>
          {message.text ? (
            <Text style={styles.analysisIntroText}>{message.text}</Text>
          ) : null}

          <View style={styles.plannerWeekList}>
            {message.plannerWeek.map((day) => (
              <PlannerWeekDayCard
                key={day.date}
                day={day}
                onSavePress={(meal, date, mealKey) =>
                  savePlannerSuggestionMutation.mutate({
                    suggestion: meal,
                    plannedFor: buildPlannerPlannedForISO(date, meal.slot),
                    mealTypeOverride: meal.slot,
                    existingPlannedMealId: meal.plannedMealId,
                    messageId: message.id,
                    mealKey,
                    saveKey: mealKey,
                  })
                }
                onReplacePress={(meal, date, mealKey) =>
                  plannerReplaceMutation.mutate({
                    messageId: message.id,
                    mealKey,
                    prompt: message.plannerPrompt || 'Refresh this weekly meal plan with a different meal for this slot.',
                    targetDate: date,
                    targetSlot: meal.slot,
                    currentMeal: meal,
                    currentPlan: message.plannerWeek || [],
                  })
                }
                onSwapPress={(meal, date, mealKey) =>
                  handlePlannerSwapPress(message.id, meal, date, mealKey)
                }
                onRecipePress={(meal) => handleOpenPlannerRecipe(meal.recipe)}
                savingMealKey={savePlannerSuggestionMutation.isPending ? savingPlannerCardKey : null}
                replacingMealKey={replacingPlannerMealKey}
                swapSelection={plannerSwapSelection?.messageId === message.id ? plannerSwapSelection : null}
              />
            ))}
          </View>

          <Text style={styles.analysisBottomText}>
            {plannerSwapSelection?.messageId === message.id
              ? `Choose another meal's Swap button to exchange it with ${plannerSwapSelection.meal.name}.`
              : 'You can review the week here, open recipe details, replace meals you do not want, swap slots, and save individual meals to your plan.'}
          </Text>
        </View>
      );
    }

    if (message.type === 'plannerSuggestions' && message.plannerSuggestions) {
      return (
        <View style={styles.analysisContainer}>
          {message.text ? (
            <Text style={styles.analysisIntroText}>{message.text}</Text>
          ) : null}

          <View style={styles.plannerSuggestionList}>
            {message.plannerSuggestions.map((suggestion, idx) => (
              <PlannerSuggestionCard
                key={`${message.id}_${idx}`}
                suggestion={suggestion}
                onSavePress={() =>
                  savePlannerSuggestionMutation.mutate({
                    suggestion,
                    saveKey: `${message.id}_${idx}`,
                  })
                }
                onRecipePress={() => handleOpenPlannerRecipe(suggestion.recipe)}
                isSaving={savePlannerSuggestionMutation.isPending && savingPlannerCardKey === `${message.id}_${idx}`}
              />
            ))}
          </View>

          <Text style={styles.analysisBottomText}>
            Pick a direction you like. You can open the recipe for details or save it to your plan now.
          </Text>
        </View>
      );
    }

    if ((message.type === 'analysis' || message.activitySummary) && message.activitySummary) {
      const draft = activityDraftsByMessageId.get(message.id) ?? message.activitySummary;
      return (
        <View style={styles.analysisContainer}>
          {message.text ? (
            <Pressable onPress={Keyboard.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss keyboard">
              <Text style={styles.analysisIntroText}>{message.text}</Text>
            </Pressable>
          ) : null}
          <ActivityChatSummaryCard
            summary={draft}
            onSummaryChange={(next) => {
              setActivityDraftsByMessageId((prev) => new Map(prev).set(message.id, next));
            }}
            dateLabel={formatMealDate(selectedDate)}
            onOpenDatePicker={() => setShowDatePicker(true)}
            onLog={() => {
              const s = activityDraftsByMessageId.get(message.id) ?? message.activitySummary!;
              if (!s.name.trim()) {
                Alert.alert('Name required', 'Add a short name for this workout before logging.');
                return;
              }
              if (!s.items.length) {
                Alert.alert('Details required', 'Add at least one activity detail before logging.');
                return;
              }
              const exercises = activitySummaryItemsToExerciseSegments(s.items || []);
              const validationErrors = validateManualExerciseSegments(exercises);
              if (validationErrors.length > 0) {
                Alert.alert('More detail needed', validationErrors[0]);
                return;
              }
              Keyboard.dismiss();
              logActivityFromChatMutation.mutate({
                summary: s,
                loggedAt: selectedDate.toISOString(),
              });
            }}
            isLogging={logActivityFromChatMutation.isPending}
            onSummaryFieldFocus={handleMealSummaryTextFieldFocus}
            onSummaryFieldBlur={handleMealSummaryTextFieldBlur}
          />
          <Pressable onPress={Keyboard.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss keyboard">
            <Text style={styles.analysisBottomText}>
              Add at least the minimum details for each workout type (for example distance or duration for cardio). Effort is optional and can help calorie estimates.
            </Text>
          </Pressable>
        </View>
      );
    }

    if ((message.type === 'analysis' || message.analysis) && message.analysis) {
      const analysisBlocked =
        originalMealLog?.analysis_status === 'pending' ||
        originalMealLog?.analysis_status === 'analyzing';
      const logPrimaryDisabled =
        isLoggingSummary ||
        isLoggingSimple ||
        isUpdatingMeal ||
        isUpdatingFavoriteTemplate ||
        analysisBlocked ||
        (isEditMealMode &&
          (!originalMealLog ||
            !editModeUpdateIsEnabled(
              originalMealLog,
              message.analysis,
              message.id,
              editedAmounts,
              selectedDate,
              mealTextEdits
            ))) ||
        (isEditFavoriteMode &&
          (!originalMealLog ||
            !editFavoriteTemplateUpdateIsEnabled(
              originalMealLog,
              message.analysis,
              message.id,
              editedAmounts,
              mealTextEdits
            )));

      return (
        <View style={styles.analysisContainer}>
          {message.text ? (
            <Pressable onPress={Keyboard.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss keyboard">
              <Text style={styles.analysisIntroText}>{message.text}</Text>
            </Pressable>
          ) : null}
          
          <View style={styles.mealReviewCard}>
            <View style={styles.mealHeaderSection}>
              <Pressable
                style={styles.mealHeaderDismissOverlay}
                onPress={Keyboard.dismiss}
                accessibilityLabel="Dismiss keyboard"
                accessibilityRole="button"
              />
              {showMealHeaderFullEdit ? (
                <View style={styles.mealHeaderEditFields}>
                  <TextInput
                    style={styles.mealNameInput}
                    value={mealTextEdits.get(message.id)?.name ?? message.analysis.name}
                    onFocus={handleMealSummaryTextFieldFocus}
                    onBlur={handleMealSummaryTextFieldBlur}
                    onChangeText={(t) =>
                      setMealTextEdits((prev) => {
                        const next = new Map(prev);
                        const base = message.analysis!;
                        const existing = next.get(message.id);
                        next.set(message.id, {
                          name: t,
                          description: existing?.description ?? base.description ?? '',
                        });
                        return next;
                      })
                    }
                    placeholder="Meal name"
                    placeholderTextColor="#9ca3af"
                    accessibilityLabel="Meal name"
                  />
                  <TextInput
                    style={styles.mealDescriptionInput}
                    value={
                      mealTextEdits.get(message.id)?.description ?? message.analysis.description ?? ''
                    }
                    onFocus={handleMealSummaryTextFieldFocus}
                    onBlur={handleMealSummaryTextFieldBlur}
                    onChangeText={(t) =>
                      setMealTextEdits((prev) => {
                        const next = new Map(prev);
                        const base = message.analysis!;
                        const existing = next.get(message.id);
                        next.set(message.id, {
                          name: existing?.name ?? base.name ?? '',
                          description: t,
                        });
                        return next;
                      })
                    }
                    placeholder="Description (optional)"
                    placeholderTextColor="#9ca3af"
                    multiline
                    accessibilityLabel="Meal description"
                  />
                </View>
              ) : (
                <View style={styles.mealHeaderEditFields}>
                  <TextInput
                    style={styles.mealNameInput}
                    value={mealTextEdits.get(message.id)?.name ?? message.analysis.name}
                    onFocus={handleMealSummaryTextFieldFocus}
                    onBlur={handleMealSummaryTextFieldBlur}
                    onChangeText={(t) =>
                      setMealTextEdits((prev) => {
                        const next = new Map(prev);
                        const base = message.analysis!;
                        const existing = next.get(message.id);
                        next.set(message.id, {
                          name: t,
                          description: existing?.description ?? base.description ?? '',
                        });
                        return next;
                      })
                    }
                    placeholder="Meal name"
                    placeholderTextColor="#9ca3af"
                    accessibilityLabel="Meal name"
                  />
                  {message.analysis.description ? (
                    <Text style={styles.mealSummaryDescriptionReadonly}>
                      {message.analysis.description}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
            
            <Pressable onPress={Keyboard.dismiss} style={styles.mealReviewCardTapAway}>
            <View style={styles.ingredientsSection}>
              <Text style={sharedStyles.sectionHeader}>INGREDIENTS</Text>
              <View style={sharedStyles.listCard}>
                {message.analysis.ingredients.map((ing, idx, arr) => {
                  const messageId = message.id;
                  const editedAmountMap = editedAmounts.get(messageId);
                  const editedAmount = editedAmountMap?.get(idx);
                  const displayAmount = editedAmount !== undefined ? editedAmount : ing.servingAmount;
                  const isLast = idx === arr.length - 1;

                  return (
                    <View
                      key={idx}
                      style={[
                        sharedStyles.listRow,
                        sharedStyles.ingredientRow,
                        isLast && sharedStyles.listRowLast,
                      ]}
                    >
                      <TouchableOpacity
                        onPress={() => handleRemoveAnalysisIngredient(messageId, idx)}
                        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                        style={styles.analysisIngredientDeleteBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${ing.name}`}
                      >
                        <Trash2 size={15} color="#d1d5db" strokeWidth={2} />
                      </TouchableOpacity>
                      <Text
                        style={[sharedStyles.listLabel, sharedStyles.ingredientNameLine]}
                        numberOfLines={4}
                      >
                        {ing.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setPickerState({
                            visible: true,
                            messageId,
                            ingredientIndex: idx,
                            currentAmount: displayAmount,
                            unit: ing.servingUnit,
                          });
                        }}
                        activeOpacity={0.7}
                        style={styles.servingAmountTouchable}
                      >
                        <View style={styles.servingAmountContainer}>
                          <Text style={sharedStyles.ingredientAmountLine}>
                            {displayAmount} {ing.servingUnit}
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color="#9ca3af" style={styles.editIcon} />
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
            
            {message.analysis.assumptions && message.analysis.assumptions.length > 0 && (
              <View style={styles.assumptionsSection}>
                <TouchableOpacity
                  style={styles.assumptionsDisclosureHeader}
                  onPress={() =>
                    setAssumptionsExpandedByMessageId((prev) => ({
                      ...prev,
                      [message.id]: !prev[message.id],
                    }))
                  }
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !!assumptionsExpandedByMessageId[message.id] }}
                  accessibilityLabel={`Assumptions, ${message.analysis!.assumptions!.length} items. ${assumptionsExpandedByMessageId[message.id] ? 'Expanded' : 'Collapsed'}. Tap to ${assumptionsExpandedByMessageId[message.id] ? 'collapse' : 'expand'}.`}
                >
                  <Text style={styles.assumptionsDisclosureTitle}>
                    Assumptions ({message.analysis.assumptions.length})
                  </Text>
                  {assumptionsExpandedByMessageId[message.id] ? (
                    <ChevronUp size={18} color="#6a7282" strokeWidth={2} />
                  ) : (
                    <ChevronDown size={18} color="#6a7282" strokeWidth={2} />
                  )}
                </TouchableOpacity>
                {assumptionsExpandedByMessageId[message.id] ? (
                  <View style={styles.assumptionsList}>
                    {message.analysis.assumptions.map((a, i) => (
                      <Text key={i} style={styles.assumptionItem}>- {a}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
            
            {!templateOnlyFlow ? (
              <View style={styles.datePickerCardContainer}>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={styles.datePickerWidget}
                  activeOpacity={0.7}
                >
                  <View style={styles.datePickerTopSection}>
                    <View style={styles.datePickerTopLeft}>
                      <Ionicons name="time-outline" size={16} color="#6366f1" />
                      <Text style={styles.datePickerQuestionText}>When did you eat this?</Text>
                    </View>
                  </View>
                  <View style={styles.datePickerSeparator} />
                  <View style={styles.datePickerBottomSection}>
                    <Text style={styles.datePickerDateText}>{formatMealDate(selectedDate)}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : null}

            {!isEditMealMode && !templateOnlyFlow && selectedTimeQualifiesAsPlannedMeal(selectedDate) && (
              <View style={styles.plannedHintContainer}>
                <View style={styles.plannedHintPill}>
                  <Clock size={14} color="#9810fa" strokeWidth={2} />
                  <Text style={styles.plannedHintText}>This will be saved as a planned meal</Text>
                </View>
              </View>
            )}

            {showSaveFavoriteCheckbox ? (
              <Pressable
                onPress={() => setSaveSummaryAsFavorite(!saveSummaryAsFavorite)}
                style={styles.saveFavoriteRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: saveSummaryAsFavorite }}
                accessibilityLabel="Save as favorite meal"
              >
                {saveSummaryAsFavorite ? (
                  <CheckSquare size={22} color="#9810fa" strokeWidth={2} />
                ) : (
                  <Square size={22} color="#6a7282" strokeWidth={2} />
                )}
                <Text style={styles.saveFavoriteLabel}>Save as favorite meal</Text>
              </Pressable>
            ) : null}
            
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                if (message.analysis) {
                  const messageId = message.id;
                  const originalSummary = message.analysis;
                  const fullSummaryIngredients = buildFullSummaryIngredientsForMessage(
                    message.analysis,
                    messageId,
                    editedAmounts
                  );
                  const ingredientsForLog = dropZeroServingIngredients(fullSummaryIngredients);
                  if (ingredientsForLog.length === 0) {
                    Alert.alert(
                      'No ingredients left',
                      'Set at least one ingredient to a non-zero amount before logging or updating.'
                    );
                    return;
                  }

                  const updatedSummary = buildUpdatedSummaryFromAnalysisMessage(
                    message.analysis,
                    messageId,
                    editedAmounts,
                    showMealHeaderFullEdit
                      ? { descriptionMode: 'preserveMealText', mealTextEdits }
                      : { mealTextEdits }
                  );
                  if (!updatedSummary) return;
                  const lockMealDisplayName =
                    !showMealHeaderFullEdit &&
                    updatedSummary.name.trim() !== originalSummary.name.trim();

                  if (isEditFavoriteMode && originalMealLog) {
                    const mealLogForUpdate = buildPatchedMealLogForEditUpdate(
                      originalMealLog,
                      updatedSummary,
                      fullSummaryIngredients
                    );
                    const skipNutritionReanalysis = patchedIngredientsNutritionallyMatchOriginal(
                      originalMealLog,
                      mealLogForUpdate
                    );
                    const nameLock =
                      updatedSummary.name.trim() !== originalSummary.name.trim();
                    updateFavoriteTemplate({
                      favoriteId: originalMealLog.id,
                      mealLog: mealLogForUpdate,
                      skipAnalysis: skipNutritionReanalysis,
                      lockMealDisplayName: nameLock ? true : undefined,
                    });
                  } else if (isEditMealMode && originalMealLog) {
                    const mealLogForUpdate = buildPatchedMealLogForEditUpdate(
                      originalMealLog,
                      updatedSummary,
                      fullSummaryIngredients
                    );
                    const skipNutritionReanalysis = patchedIngredientsNutritionallyMatchOriginal(
                      originalMealLog,
                      mealLogForUpdate
                    );
                    const originalMealType = (originalMealLog as { meal_type?: string }).meal_type as MealTypeTag | undefined;
                    const submitEdit = (extra?: { unlinkFavorite?: boolean; syncFavoriteTemplate?: boolean }) => {
                      updateMeal({
                        mealLogId: originalMealLog.id,
                        mealLog: mealLogForUpdate,
                        mealType: originalMealType,
                        skipAnalysis: skipNutritionReanalysis,
                        ...extra,
                      });
                    };
                    if (originalMealLog.favorite_id) {
                      Alert.alert(
                        'Favorite meal',
                        'This meal log is linked to a favorite. Would you like to update the fovorite in addition to this log, or update only this log only?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Update favorite and this log', onPress: () => submitEdit({ syncFavoriteTemplate: true }) },
                          {
                            text: 'Update this log only',
                            onPress: () => submitEdit({ unlinkFavorite: true }),
                          },
                        ]
                      );
                    } else {
                      submitEdit();
                    }
                  } else if (originalMealLog) {
                    const changesDetected = hasChanges(originalMealLog, updatedSummary);
                    const shouldCreatePlanned =
                      !isEditMealMode && selectedTimeQualifiesAsPlannedMeal(selectedDate);
                    if (changesDetected) {
                      logMealSummaryWithAbort({
                        updatedSummary,
                        originalSummary,
                        lockMealDisplayName,
                        saveAsFavorite: showSaveFavoriteCheckbox && saveSummaryAsFavorite,
                      });
                    } else if (shouldCreatePlanned && !loggingFromFavoriteIdRef.current) {
                      // Planned meals should use the summary flow unless created from a favorite.
                      logMealSummaryWithAbort({
                        updatedSummary,
                        originalSummary,
                        lockMealDisplayName,
                        saveAsFavorite: showSaveFavoriteCheckbox && saveSummaryAsFavorite,
                      });
                    } else {
                      logMealSimple({
                        mealLog: originalMealLog,
                        saveAsFavorite: showSaveFavoriteCheckbox && saveSummaryAsFavorite,
                      });
                    }
                  } else {
                    logMealSummaryWithAbort({
                      updatedSummary,
                      originalSummary,
                      lockMealDisplayName,
                      saveAsFavorite: showSaveFavoriteCheckbox && saveSummaryAsFavorite,
                    });
                  }
                }
              }}
              disabled={logPrimaryDisabled}
              activeOpacity={0.85}
              style={[styles.logItButtonWrapper, logPrimaryDisabled && styles.logItButtonDisabled]}
            >
              <MealLogGradient
                colors={['#9810fa', '#155dfc']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.logItButtonGradient}
              >
                {(isLoggingSummary || isLoggingSimple || isUpdatingMeal || isUpdatingFavoriteTemplate) ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Check size={16} color="#ffffff" strokeWidth={2} />
                )}
                <Text style={styles.logItButtonText}>
                  {(isLoggingSummary || isLoggingSimple)
                    ? 'Logging...'
                    : isUpdatingMeal
                      ? 'Updating...'
                    : isUpdatingFavoriteTemplate
                      ? 'Saving...'
                    : isEditMealMode
                      ? 'Update meal'
                    : templateOnlyFlow
                      ? 'Save favorite'
                    : 'Log It!'}
                </Text>
              </MealLogGradient>
            </TouchableOpacity>
            </Pressable>
          </View>
          
          <Pressable onPress={Keyboard.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss keyboard">
            <Text style={styles.analysisBottomText}>
              Does this summary look accurate? You can clarify details or confirm to log.
            </Text>
          </Pressable>
        </View>
      );
    }
    
    if (message.analysis) {
      return null;
    }
    return (
      <View style={[
        message.isUser ? styles.messageBubble : styles.assistantMessageContainer,
        message.isUser ? styles.userMessage : styles.assistantMessage
      ]}>
        <View>
          {message.isUser && message.photo?.localUri ? (
            <View style={styles.userPhotoWrap}>
              <Image source={{ uri: message.photo.localUri }} style={styles.userPhoto} />
            </View>
          ) : null}
          <Text
            selectable={message.isUser}
            style={[
              styles.messageText,
              message.isUser ? styles.userMessageText : styles.assistantMessageText,
            ]}
          >
            {message.text}
          </Text>
        </View>
      </View>
    );
  };

  const content = (
      <View style={styles.mainColumn}>
        <View style={[styles.header, { paddingTop: isOverlay ? 16 : insets.top + 16 }]}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerSideSlot} />
            <View style={styles.headerTitleCenter}>
              {lockMealChatOnly ? (
                <View style={styles.headerTitleButton}>
                  <Utensils size={18} color="#101828" strokeWidth={2} />
                  <Text style={styles.headerTitleText}>Meal Logger</Text>
                </View>
              ) : (
                <View ref={loggerTitleAnchorRef} collapsable={false} style={styles.headerTitleButton}>
                  <TouchableOpacity
                    onPress={openLoggerPicker}
                    style={styles.headerTitleButton}
                    activeOpacity={0.8}
                  >
                    {loggerKind === 'activity' ? (
                      <Dumbbell size={18} color="#101828" strokeWidth={2} />
                    ) : (
                      <Utensils size={18} color="#101828" strokeWidth={2} />
                    )}
                    <Text style={styles.headerTitleText}>
                      {loggerKind === 'activity'
                        ? 'Activity Logger'
                        : chatMode === 'plan'
                          ? 'Meal Planner'
                          : 'Meal Logger'}
                    </Text>
                    <ChevronDown size={16} color="#101828" strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={requestClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color="#6a7282" />
            </TouchableOpacity>
          </View>
          {showMealModeToggle && (
            <View style={styles.modeToggleRow}>
              <View style={styles.modeToggleTrack}>
                <Pressable
                  style={({ pressed }) => [
                    styles.modeToggleSegment,
                    chatMode === 'log' && styles.modeToggleSegmentActive,
                    pressed && styles.modeToggleSegmentPressed,
                  ]}
                  onPress={() => handleChatModeChange('log')}
                >
                  <Text
                    style={[
                      styles.modeToggleLabel,
                      chatMode === 'log' ? styles.modeToggleLabelActive : styles.modeToggleLabelInactive,
                    ]}
                  >
                    Log
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.modeToggleSegment,
                    chatMode === 'plan' && styles.modeToggleSegmentActive,
                    pressed && styles.modeToggleSegmentPressed,
                  ]}
                  onPress={() => handleChatModeChange('plan')}
                >
                  <Text
                    style={[
                      styles.modeToggleLabel,
                      chatMode === 'plan' ? styles.modeToggleLabelActive : styles.modeToggleLabelInactive,
                    ]}
                  >
                    Plan
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
          {showActivityLoggerSegments && (
            <View style={styles.headerSegmentRow}>
              <TouchableOpacity
                style={[
                  styles.headerSegmentBtn,
                  headerSegment === 'chat' && styles.headerSegmentBtnActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setHeaderSegment('chat')}
              >
                <View style={styles.headerSegmentInner}>
                  <MessageCircle
                    size={14}
                    color={headerSegment === 'chat' ? '#ffffff' : '#4a5565'}
                    strokeWidth={2}
                    style={styles.suggestionsTabIcon}
                  />
                  <Text
                    style={[
                      styles.suggestionsTabLabel,
                      headerSegment === 'chat'
                        ? styles.suggestionsTabLabelActive
                        : styles.suggestionsTabLabelInactive,
                    ]}
                  >
                    Chat
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.headerSegmentBtn,
                  headerSegment === 'recent' && styles.headerSegmentBtnActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setHeaderSegment('recent')}
              >
                <View style={styles.headerSegmentInner}>
                  <Clock
                    size={14}
                    color={headerSegment === 'recent' ? '#ffffff' : '#4a5565'}
                    strokeWidth={2}
                    style={styles.suggestionsTabIcon}
                  />
                  <Text
                    style={[
                      styles.suggestionsTabLabel,
                      headerSegment === 'recent'
                        ? styles.suggestionsTabLabelActive
                        : styles.suggestionsTabLabelInactive,
                    ]}
                  >
                    Recent
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
          {showMealLoggerSegments && (
            <View style={styles.headerSegmentRow}>
              <TouchableOpacity
                style={[
                  styles.headerSegmentBtn,
                  headerSegment === 'chat' && styles.headerSegmentBtnActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setHeaderSegment('chat')}
              >
                <View style={styles.headerSegmentInner}>
                  <MessageCircle
                    size={14}
                    color={headerSegment === 'chat' ? '#ffffff' : '#4a5565'}
                    strokeWidth={2}
                    style={styles.suggestionsTabIcon}
                  />
                  <Text
                    style={[
                      styles.suggestionsTabLabel,
                      headerSegment === 'chat'
                        ? styles.suggestionsTabLabelActive
                        : styles.suggestionsTabLabelInactive,
                    ]}
                  >
                    Chat
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.headerSegmentBtn,
                  headerSegment === 'favorites' && styles.headerSegmentBtnActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setHeaderSegment('favorites')}
              >
                <View style={styles.headerSegmentInner}>
                  <Star
                    size={14}
                    color={headerSegment === 'favorites' ? '#ffffff' : '#4a5565'}
                    strokeWidth={2}
                    style={styles.suggestionsTabIcon}
                  />
                  <Text
                    style={[
                      styles.suggestionsTabLabel,
                      headerSegment === 'favorites'
                        ? styles.suggestionsTabLabelActive
                        : styles.suggestionsTabLabelInactive,
                    ]}
                  >
                    Favorites
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.headerSegmentBtn,
                  headerSegment === 'recent' && styles.headerSegmentBtnActive,
                ]}
                activeOpacity={0.8}
                onPress={() => setHeaderSegment('recent')}
              >
                <View style={styles.headerSegmentInner}>
                  <Clock
                    size={14}
                    color={headerSegment === 'recent' ? '#ffffff' : '#4a5565'}
                    strokeWidth={2}
                    style={styles.suggestionsTabIcon}
                  />
                  <Text
                    style={[
                      styles.suggestionsTabLabel,
                      headerSegment === 'recent'
                        ? styles.suggestionsTabLabelActive
                        : styles.suggestionsTabLabelInactive,
                    ]}
                  >
                    Recent
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {showMealChatPanel || showActivityChatPanel ? (
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={[
              styles.messagesContent,
              styles.messagesContentGrow,
              isOverlay && { paddingTop: 16, paddingBottom: 140 },
              isKeyboardVisible && isOverlay && keyboardHeight > 0 && {
                paddingBottom: keyboardHeight + 80,
              },
              !isOverlay && { paddingBottom: scrollContentPaddingBottom },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            nestedScrollEnabled={true}
            onScrollBeginDrag={() => {
              if (mealSummaryTextInputFocused) Keyboard.dismiss();
            }}
          >
            {/* Logging-for bar (hidden when not logging: edit meal, planner, or favorite template create/edit). */}
            {showActivityChatPanel && (
              <View style={styles.loggingForBarContainer}>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={styles.loggingForBar}
                  activeOpacity={0.7}
                >
                  <View style={styles.loggingForBarIcon}>
                    <Dumbbell size={18} color="#9810fa" strokeWidth={2} />
                  </View>
                  <Text style={styles.loggingForBarLabel}>
                    Logging workout {formatLoggingForDate(selectedDate)}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {!isEditMealMode && !isPlannerMode && !templateOnlyFlow && showMealChatPanel && (
              <View style={styles.loggingForBarContainer}>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={styles.loggingForBar}
                  activeOpacity={0.7}
                >
                  <View style={styles.loggingForBarIcon}>
                    {getLoggingForIcon(mealTypeForLog ?? getMealPeriodFromProfile(profile) ?? 'dinner')}
                  </View>
                  <Text style={styles.loggingForBarLabel}>
                    Logging {getMealLabel(mealTypeForLog ?? getMealPeriodFromProfile(profile) ?? 'dinner')}{' '}
                    {formatLoggingForDate(selectedDate)}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {showMealChatPanel && showPlannerExamples && (
              <View style={styles.plannerWelcomeCard}>
                <Text style={styles.plannerWelcomeTitle}>Meal planning mode</Text>
                <Text style={styles.plannerWelcomeText}>
                  Start with a quick prompt and this chat can return personalized meal options, weekly plans, and source-backed recipe cards.
                </Text>
                <View style={styles.plannerExampleList}>
                  {PLANNER_PROMPT_EXAMPLES.map((example) => (
                    <TouchableOpacity
                      key={example}
                      style={styles.plannerExampleChip}
                      onPress={() => {
                        void handleSubmit(example);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.plannerExampleChipText}>{example}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {messages.map((message) => (
              <Fragment key={message.id}>{renderMessageBubble(message)}</Fragment>
            ))}

            {(isChatPending || isPlannerPending) && (
              <View style={styles.loadingContainer}>
                <LoadingDots />
                <Text style={[styles.messageText, styles.assistantMessageText, { marginLeft: 8 }]}>
                  {isPlannerPending
                    ? 'Planning meal ideas'
                    : isLoggingSummary
                      ? 'Saving your log'
                      : logActivityFromChatMutation.isPending
                        ? 'Saving your activity'
                        : loggerKind === 'activity'
                          ? 'Parsing your workout'
                          : 'Beep boop, doing computer things'}
                </Text>
              </View>
            )}
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.listPanelScroll}
            contentContainerStyle={[
              styles.listPanelContent,
              { paddingBottom: insets.bottom + 24 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {loggerKind === 'activity' ? (
              <View style={styles.activityLoggerPanel}>
                <ActivityImportLogger />
              </View>
            ) : headerSegment === 'favorites' ? (
              !favoriteMeals ? (
                <ActivityIndicator size="small" color="#9810fa" style={styles.listPanelLoading} />
              ) : favoriteMeals.length > 0 ? (
                <>
                  <Text style={styles.suggestionsLabel}>Favorite meals (swipe to log again):</Text>
                  <View style={styles.suggestionsList}>
                    {favoriteMeals.map((meal: MealSuggestion) => (
                      <SuggestionCard
                        key={meal.id}
                        suggestion={meal}
                        isFavorite
                        onLogPress={() => {
                          setSelectedRecentMealId(null);
                          setSelectedFavoriteId(meal.id);
                          setHeaderSegment('chat');
                        }}
                        onRemoveFavorite={handleRemoveFavorite}
                      />
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.favoriteMealsEmptyState}>
                  <Text style={styles.favoriteMealsTitle}>Favorite meals</Text>
                  <Text style={styles.favoriteMealsSubtitle}>
                    You haven&apos;t favorited any meals yet. Use &quot;Favorite this meal&quot; from a meal card&apos;s menu to add some—they&apos;ll show up here for quick logging.
                  </Text>
                </View>
              )
            ) : !recentMeals ? (
              <ActivityIndicator size="small" color="#9810fa" style={styles.listPanelLoading} />
            ) : recentMeals.length > 0 ? (
              <>
                <Text style={styles.suggestionsLabel}>Recent meals (swipe to log again):</Text>
                <View style={styles.suggestionsList}>
                  {recentMeals.map((meal) => (
                    <SuggestionCard
                      key={meal.id}
                      suggestion={meal}
                      onLogPress={() => {
                        setSelectedFavoriteId(null);
                        setSelectedRecentMealId(meal.id);
                        setHeaderSegment('chat');
                      }}
                    />
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.recentMealsEmptyState}>
                <Text style={styles.favoriteMealsTitle}>Recent meals</Text>
                <Text style={styles.favoriteMealsSubtitle}>
                  No logged meals yet. Log something from Chat and your last 20 meals will show up here.
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Transparent → white gradient behind the floating input (matches tab bar) */}
        {!isOverlay && (showMealChatPanel || showActivityChatPanel) && !mealSummaryTextInputFocused && (
          <Svg
            pointerEvents="none"
            width={screenWidth}
            height={chatBottomFadeHeight}
            style={[
              styles.chatInputBottomFade,
              {
                bottom:
                  isKeyboardVisible && keyboardHeight > 0 ? keyboardHeight : 0,
              },
            ]}
          >
            <Defs>
              <LinearGradient id="chatInputBottomFadeGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={screenWidth}
              height={chatBottomFadeHeight}
              fill="url(#chatInputBottomFadeGrad)"
            />
          </Svg>
        )}

        {/* Input UI */}
        {isOverlay || !(showMealChatPanel || showActivityChatPanel) || mealSummaryTextInputFocused ? null : (
          isAnswersWidgetOpen && pendingClarificationQuestions.length > 0 ? (
            <ChatAnswersCarousel
              questions={pendingClarificationQuestions}
              bottom={floatingNavBottom}
              onHeight={setMealChatComposerHeight}
              onClose={() => {
                setIsAnswersWidgetOpen(false);
              }}
              onComplete={handleSubmitClarifications}
            />
          ) : (
            <ChatComposer
              onSubmit={handleSubmit}
              bottomInset={insets.bottom}
              initialValue={inputText}
              isPending={isInputPending}
              isSubmitBlocked={isMealPhotoUploadPending}
              placeholder={sharedInputPlaceholder}
              showPlusButton={loggerKind === 'meal' && chatMode === 'log' && headerSegment === 'chat'}
              onOpenCamera={handleOpenCamera}
              onOpenPhotos={handleOpenPhotoLibrary}
              photoAttachments={composerPhotoAttachments}
              onRemovePhoto={handleRemovePendingPhoto}
              onRetryPhotoUpload={handleRetryPendingPhotoUpload}
              canSubmitWithoutText={pendingMealPhotos.some((p) => p.status === 'uploaded')}
              onComposerLayout={setMealChatComposerHeight}
              onCancelPending={cancelPendingOutboundRequest}
            />
          )
        )}

        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={selectedDate}
            mode="datetime"
            display="default"
            maximumDate={maxSelectableDate}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (event.type === 'set' && date) {
                setSelectedDate(date);
              }
            }}
          />
        )}
        
        {Platform.OS === 'ios' && (
          <Modal
            visible={showDatePicker}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowDatePicker(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
              style={styles.iosPickerModalContainer}
            >
              <Animated.View 
                style={[
                  StyleSheet.absoluteFill,
                  { opacity: datePickerBackdropAnim, backgroundColor: 'rgba(0, 0, 0, 0.5)' }
                ]}
              />
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
                style={styles.iosPickerModalContentWrapper}
              >
                <Animated.View
                  style={[
                    styles.iosPickerModalContent,
                    { transform: [{ translateY: datePickerContentAnim }] }
                  ]}
                >
                  <View style={styles.iosPickerHeader}>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(false)}
                      style={styles.iosPickerCancelButton}
                    >
                      <Text style={styles.iosPickerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.iosPickerTitle}>Select Date & Time</Text>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(false)}
                      style={styles.iosPickerDoneButton}
                    >
                      <Text style={styles.iosPickerDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={selectedDate}
                    mode="datetime"
                    display="spinner"
                    maximumDate={maxSelectableDate}
                    onChange={(event, date) => {
                      if (date) {
                        setSelectedDate(date);
                      }
                    }}
                    style={styles.iosPicker}
                  />
                </Animated.View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}
        
        {pickerState && (
          <ServingAmountPicker
            visible={pickerState.visible}
            currentAmount={pickerState.currentAmount}
            unit={pickerState.unit}
            onClose={() => setPickerState(null)}
            onConfirm={(amount) => {
              const { messageId, ingredientIndex } = pickerState;
              const currentMap = editedAmounts.get(messageId) || new Map();
              const newMap = new Map(currentMap);
              newMap.set(ingredientIndex, amount);
              const updatedAmounts = new Map(editedAmounts);
              updatedAmounts.set(messageId, newMap);
              setEditedAmounts(updatedAmounts);
              setPickerState(null);
            }}
          />
        )}

        <Modal
          visible={loggerMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={closeLoggerMenu}
        >
          <Pressable style={styles.loggerMenuBackdrop} onPress={closeLoggerMenu}>
            {loggerMenuLayout ? (
              <View
                style={[
                  styles.loggerMenuCard,
                  { top: loggerMenuLayout.top, left: loggerMenuLayout.left },
                ]}
                pointerEvents="box-none"
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setLoggerKind('meal');
                    setChatMode('log');
                    setHeaderSegment('chat');
                    setPreview(null);
                    setActivitySummaryPreview(null);
                    setActivityDraftsByMessageId(new Map());
                    setBaseDescription(null);
                    setQuestionAnswers([]);
                    setAskedQuestions(new Set());
                    setMessages([createInitialAssistantMessage('log')]);
                    closeLoggerMenu();
                  }}
                  style={[
                    styles.loggerMenuRow,
                    loggerKind === 'meal' && styles.loggerMenuRowSelected,
                  ]}
                >
                  <Utensils
                    size={18}
                    color={loggerKind === 'meal' ? '#8200db' : '#364153'}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.loggerMenuLabel,
                      loggerKind === 'meal' && styles.loggerMenuLabelSelected,
                    ]}
                  >
                    Meal Logger
                  </Text>
                </TouchableOpacity>
                <View style={styles.loggerMenuDivider} />
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setLoggerKind('activity');
                    setChatMode('log');
                    setHeaderSegment('chat');
                    setPreview(null);
                    setActivitySummaryPreview(null);
                    setActivityDraftsByMessageId(new Map());
                    setBaseDescription(null);
                    setQuestionAnswers([]);
                    setAskedQuestions(new Set());
                    setMessages([createActivityInitialAssistantMessage()]);
                    closeLoggerMenu();
                  }}
                  style={[
                    styles.loggerMenuRow,
                    loggerKind === 'activity' && styles.loggerMenuRowSelected,
                  ]}
                >
                  <Dumbbell
                    size={18}
                    color={loggerKind === 'activity' ? '#8200db' : '#364153'}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.loggerMenuLabel,
                      loggerKind === 'activity' && styles.loggerMenuLabelSelected,
                    ]}
                  >
                    Activity Logger
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </Pressable>
        </Modal>
      </View>
  );

  // No KeyboardAvoidingView: ChatComposer positions itself with bottom: keyboardHeight + 8
  // relative to the screen. Wrapping in KeyboardAvoidingView would shift the container and
  // make the bar's bottom offset double-count, pushing the input to the top of the screen.
  return <View style={styles.fullScreenContainer}>{content}</View>;
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  /** Fills the screen under the status bar; safe-area inset for the home indicator is handled inside scroll padding / floating nav, not by shrinking this column. */
  mainColumn: {
    flex: 1,
    backgroundColor: 'white',
  },
  chatInputBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 900,
  },
  header: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSideSlot: {
    width: 36,
    height: 36,
  },
  headerTitleCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
    letterSpacing: -0.3125,
  },
  modeToggleRow: {
    alignItems: 'center',
    marginTop: 16,
  },
  modeToggleTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 200,
    width: '100%',
    padding: 4,
    borderRadius: 9999,
    backgroundColor: '#f3e8ff',
  },
  modeToggleSegment: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggleSegmentActive: {
    backgroundColor: '#9810fa',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  modeToggleSegmentPressed: {
    opacity: 0.92,
  },
  modeToggleLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.12,
  },
  modeToggleLabelActive: {
    color: '#ffffff',
  },
  modeToggleLabelInactive: {
    color: '#7e22ce',
  },
  headerSegmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  headerSegmentBtn: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
  },
  headerSegmentBtnActive: {
    backgroundColor: '#000000',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerSegmentInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  plannerWelcomeCard: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#f3e8ff',
    gap: 12,
  },
  plannerWelcomeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
    letterSpacing: -0.24,
  },
  plannerWelcomeText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4a5565',
  },
  plannerExampleList: {
    gap: 8,
  },
  plannerExampleChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  plannerExampleChipText: {
    fontSize: 14,
    color: '#6b21a8',
    fontWeight: '500',
    lineHeight: 20,
  },
  plannerSuggestionList: {
    gap: 10,
  },
  plannerWeekList: {
    gap: 12,
  },
  plannerWeekDayCard: {
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#f3e8ff',
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  plannerWeekDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  plannerWeekDayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
    letterSpacing: -0.24,
  },
  plannerWeekDayDate: {
    fontSize: 12,
    color: '#6a7282',
    fontWeight: '500',
  },
  plannerWeekMealsList: {
    gap: 10,
  },
  plannerWeekMealCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3e8ff',
    padding: 14,
    gap: 8,
  },
  plannerWeekMealCardSwapSelected: {
    borderColor: '#9810fa',
    backgroundColor: '#faf5ff',
  },
  plannerWeekMealHeader: {
    gap: 8,
  },
  plannerWeekMealName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101828',
    letterSpacing: -0.2,
  },
  plannerSuggestionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f3e8ff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  plannerSuggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  plannerSuggestionName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
    letterSpacing: -0.24,
  },
  plannerSuggestionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  plannerSuggestionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7c3aed',
  },
  plannerSuggestionDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#364153',
  },
  plannerSuggestionWhyItFits: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6a7282',
  },
  plannerSuggestionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  plannerSuggestionMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  plannerSuggestionMetaText: {
    fontSize: 12,
    color: '#6a7282',
    fontWeight: '500',
  },
  plannerRecipeSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  plannerRecipeSourceText: {
    flex: 1,
    fontSize: 12,
    color: '#6a7282',
    fontWeight: '500',
  },
  plannerRecipeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  plannerRecipeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7c3aed',
  },
  plannerSuggestionActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  plannerWeekMealActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  plannerWeekActionButton: {
    flex: 1,
  },
  plannerSuggestionSaveButton: {
    height: 42,
    borderRadius: 14,
    backgroundColor: '#9810fa',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  plannerSuggestionSaveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: -0.15,
  },
  plannerWeekReplaceButton: {
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d8b4fe',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  plannerWeekReplaceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7c3aed',
    letterSpacing: -0.15,
  },
  plannerWeekSwapButtonSelected: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  plannerWeekSwapButtonSelectedText: {
    color: '#ffffff',
  },
  recipeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    justifyContent: 'flex-end',
  },
  recipeModalCard: {
    maxHeight: '82%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  recipeModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  recipeModalHeaderText: {
    flex: 1,
    gap: 4,
  },
  recipeModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#101828',
    letterSpacing: -0.3,
  },
  recipeModalSource: {
    fontSize: 13,
    color: '#7c3aed',
    fontWeight: '600',
  },
  recipeModalCloseButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#faf5ff',
  },
  recipeModalCloseText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7c3aed',
  },
  recipeModalLoading: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  recipeModalScroll: {
    flexGrow: 0,
  },
  recipeModalContent: {
    gap: 16,
    paddingBottom: 12,
  },
  recipeModalSummary: {
    fontSize: 14,
    lineHeight: 20,
    color: '#364153',
  },
  recipeModalMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recipeModalMetaChip: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6a7282',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recipeModalNutritionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  recipeModalNutritionText: {
    fontSize: 12,
    color: '#6a7282',
    fontWeight: '600',
  },
  recipeModalSection: {
    gap: 10,
  },
  recipeModalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
    letterSpacing: -0.2,
  },
  recipeModalBulletText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#364153',
  },
  recipeModalStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  recipeModalStepNumber: {
    width: 24,
    fontSize: 14,
    fontWeight: '700',
    color: '#7c3aed',
  },
  recipeModalStepBody: {
    flex: 1,
    gap: 4,
  },
  recipeModalStepTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#101828',
  },
  recipeModalStepText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#364153',
  },
  recipeModalSourceButton: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8b4fe',
    backgroundColor: '#faf5ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  recipeModalSourceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7c3aed',
  },
  activityLoggerPanel: {
    flex: 1,
    alignSelf: 'stretch',
    minHeight: 0,
  },
  listPanelScroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listPanelContent: {
    paddingTop: 16,
    gap: 12,
    flexGrow: 1,
  },
  listPanelLoading: {
    marginTop: 24,
    alignSelf: 'center',
  },
  recentMealsEmptyState: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 0.698,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loggerMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  loggerMenuCard: {
    position: 'absolute',
    width: 224,
    zIndex: 1000,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 0.698,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 15,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  loggerMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingLeft: 16,
    gap: 12,
    backgroundColor: '#ffffff',
  },
  loggerMenuRowSelected: {
    backgroundColor: '#faf5ff',
  },
  loggerMenuDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    width: '100%',
  },
  loggerMenuLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#364153',
    letterSpacing: -0.3125,
  },
  loggerMenuLabelSelected: {
    color: '#8200db',
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesContent: {
    paddingVertical: 16,
    gap: 12,
  },
  messagesContentGrow: {
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  assistantMessageContainer: {
    width: '100%',
    paddingVertical: 8,
  },
  userMessage: {
    backgroundColor: '#000',
    alignSelf: 'flex-end',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 5,
    overflow: 'hidden',
  },
  assistantMessage: {
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: 'white',
  },
  assistantMessageText: {
    color: '#101828',
  },
  userPhotoWrap: {
    width: 220,
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#111827',
    marginBottom: 10,
  },
  userPhoto: {
    width: '100%',
    height: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: 'white',
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#f3f3f5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    maxHeight: 100,
  },
  input: {
    fontSize: 16,
    color: '#101828',
    padding: 0,
    minHeight: 24,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
  },
  sendButtonActive: {
    opacity: 1,
  },
  sendButtonDisabled: {
    opacity: 0.3,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  analysisContainer: {
    width: '100%',
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  analysisIntroText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#101828',
    marginBottom: 12,
  },
  mealReviewCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 0.698,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    marginBottom: 12,
  },
  mealHeaderSection: {
    position: 'relative',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.698,
    borderBottomColor: '#f3f4f6',
  },
  mealHeaderDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  mealReviewCardTapAway: {
    flexShrink: 0,
  },
  mealHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  mealHeaderEditFields: {
    gap: 10,
    marginBottom: 6,
    width: '100%',
    zIndex: 1,
    elevation: 2,
  },
  mealNameInput: {
    fontSize: 18,
    fontWeight: '500',
    color: '#101828',
    letterSpacing: -0.3125,
    paddingVertical: 4,
    paddingHorizontal: 0,
    margin: 0,
    borderWidth: 0,
  },
  mealDescriptionInput: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4a5565',
    minHeight: 44,
    maxHeight: 120,
    paddingVertical: 6,
    paddingHorizontal: 0,
    margin: 0,
    borderWidth: 0,
    textAlignVertical: 'top' as const,
  },
  mealSummaryDescriptionReadonly: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4a5565',
  },
  mealName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#101828',
    letterSpacing: -0.3125,
  },
  summaryNote: {
    fontSize: 13,
    color: '#6a7282',
    lineHeight: 18,
  },
  ingredientsSection: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomColor: '#f3f4f6',
  },
  analysisIngredientDeleteBtn: {
    flexShrink: 0,
    paddingVertical: 2,
    paddingRight: 6,
    marginRight: 2,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  servingAmountTouchable: {
    flexShrink: 0,
  },
  servingAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editIcon: {
    marginLeft: 2,
  },
  assumptionsSection: {
    backgroundColor: 'rgba(249, 250, 251, 0.5)',
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  assumptionsDisclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 8,
  },
  assumptionsDisclosureTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6a7282',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    flex: 1,
  },
  assumptionsList: {
    gap: 4,
    paddingTop: 4,
    paddingBottom: 4,
  },
  assumptionItem: {
    fontSize: 12,
    fontWeight: '400',
    color: '#4a5565',
    lineHeight: 19.5,
  },
  loggingForBarContainer: {
    paddingLeft: 0,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  loggingForBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7.992,
  },
  loggingForBarIcon: {
    width: 16,
    height: 16,
  },
  loggingForBarLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#4a5565',
    letterSpacing: -0.1504,
    lineHeight: 20,
    flex: 1,
  },
  datePickerCardContainer: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  plannedHintContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  plannedHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f3e8ff',
    borderWidth: 0.698,
    borderColor: '#dab2ff',
  },
  plannedHintText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9810fa',
    letterSpacing: -0.1504,
    flex: 1,
  },
  saveFavoriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 12,
  },
  saveFavoriteLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#364153',
    letterSpacing: -0.1504,
    flex: 1,
  },
  datePickerWidget: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 0.698,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  datePickerTopSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12.691,
    paddingHorizontal: 12.691,
    paddingBottom: 7.992,
  },
  datePickerTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7.992,
  },
  datePickerQuestionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#364153',
    letterSpacing: -0.1504,
  },
  datePickerSeparator: {
    borderTopWidth: 0.698,
    borderTopColor: '#f3f4f6',
  },
  datePickerBottomSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12.691,
    paddingBottom: 12.691,
  },
  datePickerDateText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#101828',
    letterSpacing: -0.1504,
  },
  logItButtonWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  logItButtonGradient: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logItButtonDisabled: {
    opacity: 0.6,
  },
  logItButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    letterSpacing: -0.3125,
  },
  analysisBottomText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#101828',
    letterSpacing: -0.1504,
  },
  iosPickerModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosPickerModalContentWrapper: {
    width: '100%',
  },
  iosPickerModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  iosPickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101828',
  },
  iosPickerCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iosPickerCancelText: {
    fontSize: 16,
    color: '#6a7282',
  },
  iosPickerDoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iosPickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  iosPicker: {
    height: 200,
  },
  suggestionsSection: {
    marginTop: 16,
    marginBottom: 8,
    gap: 8,
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101828',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  suggestionsContainer: {
    paddingTop: 16,
    gap: 12,
    marginTop: 8,
  },
  suggestionsLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6a7282',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  suggestionsList: {
    gap: 8,
  },
  suggestionsTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  suggestionsTab: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  suggestionsTabActive: {
    backgroundColor: '#9810fa',
  },
  suggestionsTabInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  suggestionsTabIcon: {
    marginRight: 6,
  },
  suggestionsTabLabel: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.1504,
  },
  suggestionsTabLabelActive: {
    color: '#ffffff',
  },
  suggestionsTabLabelInactive: {
    color: '#4a5565',
  },
  suggestionCard: {
    backgroundColor: '#faf5ff',
    borderWidth: 0.698,
    borderColor: '#f3e8ff',
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  suggestionSwipeableContainer: {
    overflow: 'hidden',
    borderRadius: 10,
  },
  suggestionSwipeableContent: {
    backgroundColor: '#faf5ff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  suggestionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  suggestionCardTapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  suggestionCardLeft: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  suggestionMealName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#101828',
    letterSpacing: -0.3125,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  suggestionDate: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6a7282',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  suggestionDescription: {
    fontSize: 12,
    lineHeight: 19.5,
    color: '#4a5565',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  suggestionExpandChevron: {
    marginLeft: 8,
    marginTop: -2,
    padding: 4,
  },
  suggestionSwipeAction: {
    width: 72,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionSwipeActionRight: {
    alignItems: 'flex-end',
    paddingRight: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.28)',
  },
  suggestionSwipeActionLeft: {
    alignItems: 'flex-start',
    paddingLeft: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  suggestionSwipeActionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  suggestionIngredientsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.698,
    borderTopColor: '#f3e8ff',
  },
  suggestionLogMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(124, 58, 237, 0.14)',
    borderRadius: 10,
  },
  suggestionLogMealButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#7c3aed',
  },
  suggestionNutritionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  suggestionNutritionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  suggestionNutritionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4a5565',
  },
  suggestionIngredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  suggestionIngredientBullet: {
    fontSize: 14,
    color: '#99a1af',
    letterSpacing: -0.1504,
    marginTop: 1,
  },
  suggestionIngredientContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  suggestionIngredientNameWrap: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  suggestionIngredientName: {
    fontSize: 14,
    fontWeight: '400',
    color: '#101828',
    letterSpacing: -0.1504,
  },
  suggestionIngredientServing: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6a7282',
    letterSpacing: -0.1504,
    marginLeft: 4,
    flexShrink: 0,
  },
  favoriteMealsEmptyState: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 0.698,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  favoriteMealsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  favoriteMealsSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
});
