import { Router, Request, Response, RequestHandler } from 'express';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { NutritionService } from '../services/nutritionService';
import { EmbeddingService } from '../services/embeddingService';
import { IconSelectionService } from '../services/iconSelectionService';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { MealSummary } from '../types/mealSummary';
import { NutritionData } from '../types/nutrition';
import { MealChatIntentClassifier, type MealChatIntent } from '../services/mealChatIntentClassifier';
import posthog from '../config/posthog';
import { LlmQuotaExceededError, replyIfLlmQuotaExceeded } from '../ai/openaiResponses';
import { singleRouteParam } from '../utils/singleRouteParam';

const router = Router();
const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
function isValidMealType(v: unknown): v is (typeof VALID_MEAL_TYPES)[number] {
  return typeof v === 'string' && VALID_MEAL_TYPES.includes(v.toLowerCase() as (typeof VALID_MEAL_TYPES)[number]);
}

const MAX_MEAL_PHOTO_PATHS = 4;

type ChatSummaryRequestStatus = 'pending' | 'complete' | 'error';
const CHAT_SUMMARY_PUSH_MAX_CHARS = 120;

function normalizePushText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncatePushText(value: string): string {
  if (value.length <= CHAT_SUMMARY_PUSH_MAX_CHARS) return value;
  return `${value.slice(0, CHAT_SUMMARY_PUSH_MAX_CHARS - 3).trimEnd()}...`;
}

function buildChatSummaryPushContents(status: ChatSummaryRequestStatus, summary?: MealSummary): string {
  if (status !== 'complete') {
    return 'There was an issue generating your chat response.';
  }

  const questions = Array.isArray(summary?.questions) ? summary.questions : [];
  if (questions.length > 0) {
    const questionText = normalizePushText(summary?.questionSummary || questions[0]?.text || '');
    if (questionText.length > 0) return truncatePushText(questionText);
    return 'I have a quick question about your meal.';
  }

  const mealName = normalizePushText(summary?.name || '');
  if (mealName.length > 0) {
    return truncatePushText(`Here's your meal summary: ${mealName}.`);
  }
  return "Here's your meal summary.";
}

async function sendOneSignalChatSummaryCompletePush(params: {
  userId: string;
  requestId: string;
  status: ChatSummaryRequestStatus;
  summary?: MealSummary;
}): Promise<void> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!appId || !apiKey) {
    console.warn('[chat_summary] Missing ONESIGNAL_APP_ID or ONESIGNAL_API_KEY; skipping push');
    return;
  }

  const body = {
    app_id: appId,
    target_channel: 'push',
    include_aliases: { external_id: [params.userId] },
    headings: { en: 'Nomlog' },
    contents: {
      en: buildChatSummaryPushContents(params.status, params.summary),
    },
    data: {
      type: 'chat_summary_complete',
      requestId: params.requestId,
      status: params.status,
    },
  };

  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    console.warn('[chat_summary] OneSignal push failed', { status: response.status, text });
  }
}

/** Parse PATCH body `photoStoragePaths`: null clears; array trims, validates user ownership prefix, max length. */
function mealPhotoPathsFromBody(
  photoStoragePaths: unknown,
  userId: string
):
  | { ok: true; paths: string[] | null }
  | { ok: false; status: number; message: string } {
  if (photoStoragePaths === null) {
    return { ok: true, paths: null };
  }
  if (!Array.isArray(photoStoragePaths)) {
    return {
      ok: false,
      status: 400,
      message: 'photoStoragePaths must be an array of strings or null',
    };
  }
  const paths = (photoStoragePaths as unknown[])
    .filter((p) => typeof p === 'string' && String(p).trim().length > 0)
    .map((p) => String(p).trim())
    .slice(0, MAX_MEAL_PHOTO_PATHS);
  if (paths.some((p) => !p.startsWith(`${userId}/`))) {
    return {
      ok: false,
      status: 403,
      message: 'One or more photo paths are not owned by this user',
    };
  }
  return { ok: true, paths };
}

async function photoStoragePathsFromFavoriteMeal(
  favoriteId: string,
  userId: string
): Promise<string[] | null> {
  const { data: fav, error } = await supabaseAdmin
    .from('favorites')
    .select('meals:meal_id ( photo_storage_paths )')
    .eq('user_id', userId)
    .eq('id', favoriteId)
    .single();
  if (error || !fav) return null;
  const meal = (fav as { meals?: { photo_storage_paths?: string[] | null } }).meals;
  const paths = meal?.photo_storage_paths;
  return Array.isArray(paths) && paths.length > 0 ? paths : null;
}

const nutritionService = new NutritionService();
const embeddingService = new EmbeddingService();
const iconSelectionService = new IconSelectionService();
const mealChatIntentClassifier = new MealChatIntentClassifier();
const MEAL_PHOTO_BUCKET = process.env.MEAL_PHOTO_BUCKET || 'meal-photos';

function buildMealChatGuardrailSummary(message: string): MealSummary {
  return {
    name: '__MEAL_CHAT_GUARDRAIL__',
    description: message,
    questionSummary: '',
    ingredients: [],
    questions: [],
    assumptions: [],
  };
}

const ZERO_INGREDIENT_NUTRITION = {
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
} as const;

/** Summary-step ingredients saved immediately so detail UIs can list them while analysis is still pending. */
function ingredientsFromMealSummaryForInsert(summary: MealSummary): Record<string, unknown>[] {
  const list = summary.ingredients;
  if (!list?.length) return [];
  return list.map((ing) => ({
    name: ing.name,
    servingAmount: ing.servingAmount,
    servingUnit: ing.servingUnit,
    servingSizeGrams: ing.servingSizeGrams ?? 0,
    nutrition: { ...ZERO_INGREDIENT_NUTRITION },
    provenance: ing.provenance ?? { source: 'llm_estimate' as const, confidence: 'medium' as const },
  }));
}

type NutritionAnalysisAsyncOptions = {
  syncFavoriteTemplate?: boolean;
  /** When true, keep existing `meal_logs.name` (or `meals.name` for templates) after analysis. */
  lockMealDisplayName?: boolean;
};

type NutritionAnalysisTarget =
  | { kind: 'meal_log'; mealLogId: string }
  | { kind: 'meal'; mealId: string; userId: string };

/** Full nutrition analysis for a meal log row or a saved template (`meals`) row. */
async function applyNutritionAnalysis(params: {
  target: NutritionAnalysisTarget;
  /** Meal owner (for LLM quota + ledger). */
  userId: string;
  description: string;
  mealSummary?: MealSummary;
  originalSummary?: MealSummary;
  options?: NutritionAnalysisAsyncOptions;
}): Promise<void> {
  const { target, userId, description, mealSummary, originalSummary, options } = params;
  const llmRoute = 'async/logs/nutrition-analysis';
  const llm = { userId, route: llmRoute } as const;
  const targetDebugId = target.kind === 'meal_log' ? target.mealLogId : target.mealId;

  if (target.kind === 'meal_log') {
    await supabaseAdmin
      .from('meal_logs')
      .update({ analysis_status: 'analyzing' })
      .eq('id', target.mealLogId);
  } else {
    await supabaseAdmin
      .from('meals')
      .update({ analysis_status: 'analyzing' })
      .eq('id', target.mealId)
      .eq('user_id', target.userId);
  }

  try {
    let nutritionData: NutritionData;
    
    if (mealSummary && mealSummary.ingredients && mealSummary.ingredients.length > 0) {
      // Use the meal summary with edited amounts to calculate nutrition
      // Build a description that includes the edited amounts for the LLM
      const ingredientDescriptions = mealSummary.ingredients.map(ing => 
        `${ing.servingAmount} ${ing.servingUnit} ${ing.name}`
      ).join(', ');
      const enhancedDescription = `${description}. Ingredients: ${ingredientDescriptions}`;
      
      // Run nutrition analysis with the enhanced description that includes edited amounts
      nutritionData = await nutritionService.analyzeMeal(enhancedDescription, llm);
      
      // Helper: robust ingredient matching (handles brand-normalized renames)
      const usedAnalyzedIndexes = new Set<number>();
      const normalizeTokens = (s: string): string[] =>
        (s || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
      const jaccard = (aTokens: string[], bTokens: string[]): number => {
        const a = new Set(aTokens);
        const b = new Set(bTokens);
        if (a.size === 0 && b.size === 0) return 1;
        if (a.size === 0 || b.size === 0) return 0;
        let intersect = 0;
        for (const t of a) if (b.has(t)) intersect++;
        const union = a.size + b.size - intersect;
        return union === 0 ? 0 : intersect / union;
      };
      const findBestAnalyzedIngredient = (summaryName: string) => {
        if (!nutritionData.ingredients || nutritionData.ingredients.length === 0) return null;
        const sLower = summaryName.toLowerCase();
        // First pass: original partial matching (fast)
        for (let idx = 0; idx < nutritionData.ingredients.length; idx++) {
          if (usedAnalyzedIndexes.has(idx)) continue;
          const aName = nutritionData.ingredients[idx].name || '';
          const aLower = aName.toLowerCase();
          if (aLower.includes(sLower) || sLower.includes(aLower)) {
            usedAnalyzedIndexes.add(idx);
            return nutritionData.ingredients[idx];
          }
        }
        // Second pass: token overlap (handles renames like "fig salad dressing" -> "fig balsamic vinaigrette")
        const sTokens = normalizeTokens(summaryName);
        let bestIdx = -1;
        let bestScore = 0;
        for (let idx = 0; idx < nutritionData.ingredients.length; idx++) {
          if (usedAnalyzedIndexes.has(idx)) continue;
          const aName = nutritionData.ingredients[idx].name || '';
          const score = jaccard(sTokens, normalizeTokens(aName));
          if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
          }
        }
        if (bestIdx >= 0 && bestScore >= 0.2) {
          usedAnalyzedIndexes.add(bestIdx);
          return nutritionData.ingredients[bestIdx];
        }
        // Final fallback: pick the next unused analyzed ingredient to avoid all-zero totals
        for (let idx = 0; idx < nutritionData.ingredients.length; idx++) {
          if (usedAnalyzedIndexes.has(idx)) continue;
          usedAnalyzedIndexes.add(idx);
          return nutritionData.ingredients[idx];
        }
        return null;
      };

      // Override ingredients with the ones from summary (preserving edited amounts)
      // and scale nutrition proportionally
      // Match ingredients by name (case-insensitive) since order might differ
      nutritionData.ingredients = mealSummary.ingredients.map((summaryIng) => {
        const analyzedIng = findBestAnalyzedIngredient(summaryIng.name);
        
        if (analyzedIng) {
          // Calculate scale factor based on serving amount change
          // Use servingSizeGrams ratio for more accurate scaling
          const analyzedGrams = analyzedIng.servingSizeGrams || 0;
          const scaleFactor = analyzedGrams > 0 ? (summaryIng.servingSizeGrams / analyzedGrams) : 1;
          
          // Scale nutrition values proportionally
          const scaledNutrition = {
            calories: Math.round(analyzedIng.nutrition.calories * scaleFactor),
            fat: Math.round(analyzedIng.nutrition.fat * scaleFactor * 10) / 10,
            protein: Math.round(analyzedIng.nutrition.protein * scaleFactor * 10) / 10,
            carbohydrates: Math.round(analyzedIng.nutrition.carbohydrates * scaleFactor * 10) / 10,
            fiber: Math.round(analyzedIng.nutrition.fiber * scaleFactor * 10) / 10,
            sugar: Math.round(analyzedIng.nutrition.sugar * scaleFactor * 10) / 10,
            sodium: Math.round(analyzedIng.nutrition.sodium * scaleFactor),
            saturatedFat: Math.round(analyzedIng.nutrition.saturatedFat * scaleFactor * 10) / 10,
            potassium: Math.round(analyzedIng.nutrition.potassium * scaleFactor),
            cholesterol: Math.round(analyzedIng.nutrition.cholesterol * scaleFactor),
            calcium: Math.round(analyzedIng.nutrition.calcium * scaleFactor),
            iron: Math.round(analyzedIng.nutrition.iron * scaleFactor * 10) / 10,
            vitaminA: Math.round(analyzedIng.nutrition.vitaminA * scaleFactor),
            vitaminC: Math.round(analyzedIng.nutrition.vitaminC * scaleFactor),
            vitaminD: Math.round(analyzedIng.nutrition.vitaminD * scaleFactor),
            magnesium: Math.round(analyzedIng.nutrition.magnesium * scaleFactor),
          };
          
          return {
            // Preserve edited quantities/units/grams from the summary,
            // but adopt analysis-derived naming (often includes brand/product normalization).
            name: analyzedIng.name || summaryIng.name,
            servingAmount: summaryIng.servingAmount,
            servingUnit: summaryIng.servingUnit,
            servingSizeGrams: summaryIng.servingSizeGrams,
            nutrition: scaledNutrition,
          };
        }
        // Fallback if ingredient not found in analysis
        return {
          name: summaryIng.name,
          servingAmount: summaryIng.servingAmount,
          servingUnit: summaryIng.servingUnit,
          servingSizeGrams: summaryIng.servingSizeGrams,
          nutrition: {
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
          },
        };
      });
      
      // Recalculate totals from scaled ingredients
      const totalNutrition = nutritionData.ingredients.reduce((totals, ing) => {
        totals.calories += ing.nutrition.calories;
        totals.fat += ing.nutrition.fat;
        totals.protein += ing.nutrition.protein;
        totals.carbohydrates += ing.nutrition.carbohydrates;
        totals.fiber += ing.nutrition.fiber;
        totals.sugar += ing.nutrition.sugar;
        totals.sodium += ing.nutrition.sodium;
        totals.saturatedFat += ing.nutrition.saturatedFat;
        totals.potassium += ing.nutrition.potassium;
        totals.cholesterol += ing.nutrition.cholesterol;
        totals.calcium += ing.nutrition.calcium;
        totals.iron += ing.nutrition.iron;
        totals.vitaminA += ing.nutrition.vitaminA;
        totals.vitaminC += ing.nutrition.vitaminC;
        totals.vitaminD += ing.nutrition.vitaminD;
        totals.magnesium += ing.nutrition.magnesium;
        return totals;
      }, {
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
      });
      
      nutritionData.totalNutrition = totalNutrition;
      
      // Check if amounts were edited by comparing to original summary
      // Match ingredients by name since order might differ
      const hasEdits = originalSummary && originalSummary.ingredients && originalSummary.ingredients.length > 0
        ? mealSummary.ingredients.some((ing) => {
            const originalIng = originalSummary.ingredients.find(oi => 
              oi.name.toLowerCase() === ing.name.toLowerCase() ||
              oi.name.toLowerCase().includes(ing.name.toLowerCase()) ||
              ing.name.toLowerCase().includes(oi.name.toLowerCase())
            );
            return originalIng && (
              ing.servingAmount !== originalIng.servingAmount ||
              ing.servingUnit !== originalIng.servingUnit
            );
          })
        : false;
      // Always prefer analysis-derived name/description (can include brand/product normalization).
      // The summary step is intentionally lightweight and may be generic.
      // If the model failed to provide a name/description for some reason, fall back to the original summary.
      if ((!nutritionData.name || !nutritionData.description) && originalSummary) {
        nutritionData.name = nutritionData.name || originalSummary.name;
        nutritionData.description = nutritionData.description || originalSummary.description;
      }
    } else {
      // Fallback: run full analysis from description if no summary provided
      nutritionData = await nutritionService.analyzeMeal(description, llm);
    }
    
    // Log nutrition data for debugging
    console.log('[applyNutritionAnalysis] Nutrition data received:', {
      target: target.kind,
      id: targetDebugId,
      name: nutritionData.name,
      hasTotalNutrition: !!nutritionData.totalNutrition,
      totalCalories: nutritionData.totalNutrition?.calories,
      ingredientsCount: nutritionData.ingredients?.length || 0,
      ingredients: nutritionData.ingredients?.map(ing => ({
        name: ing.name,
        calories: ing.nutrition.calories
      })) || []
    });
    
    // Validate nutrition data before proceeding
    if (!nutritionData.totalNutrition || nutritionData.totalNutrition.calories === 0) {
      console.warn('[applyNutritionAnalysis] WARNING: Nutrition data has zero calories or missing totalNutrition:', {
        target: target.kind,
        id: targetDebugId,
        totalNutrition: nutritionData.totalNutrition,
        ingredientsCount: nutritionData.ingredients?.length || 0
      });
    }
    
    let finalName = nutritionData.name;
    if (options?.lockMealDisplayName) {
      if (target.kind === 'meal_log') {
        const { data: nameRow, error: nameFetchErr } = await supabaseAdmin
          .from('meal_logs')
          .select('name')
          .eq('id', target.mealLogId)
          .single();
        if (!nameFetchErr && nameRow?.name && typeof nameRow.name === 'string' && nameRow.name.trim()) {
          finalName = nameRow.name;
        }
      } else {
        const { data: nameRow, error: nameFetchErr } = await supabaseAdmin
          .from('meals')
          .select('name')
          .eq('id', target.mealId)
          .eq('user_id', target.userId)
          .single();
        if (!nameFetchErr && nameRow?.name && typeof nameRow.name === 'string' && nameRow.name.trim()) {
          finalName = nameRow.name;
        }
      }
    }

    // Select icon for the meal (don't let icon selection failure block nutrition update)
    let icon = 'utensils'; // Default fallback
    try {
      icon = await iconSelectionService.selectIcon(finalName, nutritionData.description, llm);
    } catch (iconError) {
      console.error('[applyNutritionAnalysis] Icon selection failed, using default:', iconError);
      // Continue with default icon - don't fail the entire analysis
    }
    
    if (target.kind === 'meal_log') {
      await supabaseAdmin
        .from('meal_logs')
        .update({
          name: finalName,
          description: nutritionData.description,
          total_nutrition: nutritionData.totalNutrition,
          ingredients: nutritionData.ingredients || [],
          icon: icon,
          analysis_status: 'completed'
        })
        .eq('id', target.mealLogId);

      if (options?.syncFavoriteTemplate) {
        const { data: logRow, error: logFetchErr } = await supabaseAdmin
          .from('meal_logs')
          .select('favorite_id, user_id, photo_storage_paths')
          .eq('id', target.mealLogId)
          .single();
        if (logFetchErr || !logRow?.favorite_id) {
          console.log(
            '[applyNutritionAnalysis] syncFavoriteTemplate: no favorite_id on log, skipping meals template sync'
          );
        } else {
          const { data: fav, error: favErr } = await supabaseAdmin
            .from('favorites')
            .select('meal_id')
            .eq('id', logRow.favorite_id)
            .eq('user_id', logRow.user_id)
            .single();
          if (favErr || !fav?.meal_id) {
            console.warn('[applyNutritionAnalysis] syncFavoriteTemplate: favorite row not found', favErr);
          } else {
            const paths = (logRow as { photo_storage_paths?: string[] | null }).photo_storage_paths;
            const { error: mealUpdErr } = await supabaseAdmin
              .from('meals')
              .update({
                name: finalName,
                description: nutritionData.description,
                total_nutrition: nutritionData.totalNutrition,
                ingredients: nutritionData.ingredients || [],
                icon,
                analysis_status: 'completed',
                photo_storage_paths: Array.isArray(paths) && paths.length > 0 ? paths : null,
              })
              .eq('id', fav.meal_id)
              .eq('user_id', logRow.user_id);
            if (mealUpdErr) {
              console.error('[applyNutritionAnalysis] Failed to sync meals template:', mealUpdErr);
            }
          }
        }
      }
    } else {
      await supabaseAdmin
        .from('meals')
        .update({
          name: finalName,
          description: nutritionData.description,
          total_nutrition: nutritionData.totalNutrition,
          ingredients: nutritionData.ingredients || [],
          icon: icon,
          analysis_status: 'completed',
        })
        .eq('id', target.mealId)
        .eq('user_id', target.userId);
    }
  } catch (error) {
    console.error('Async nutrition analysis failed:', error);
    if (target.kind === 'meal_log') {
      await supabaseAdmin
        .from('meal_logs')
        .update({ analysis_status: 'failed' })
        .eq('id', target.mealLogId);
    } else {
      await supabaseAdmin
        .from('meals')
        .update({ analysis_status: 'failed' })
        .eq('id', target.mealId)
        .eq('user_id', target.userId);
    }
  }
}

async function processNutritionAnalysisAsync(
  mealLogId: string,
  userId: string,
  description: string,
  mealSummary?: MealSummary,
  originalSummary?: MealSummary,
  options?: NutritionAnalysisAsyncOptions
): Promise<void> {
  return applyNutritionAnalysis({
    target: { kind: 'meal_log', mealLogId },
    userId,
    description,
    mealSummary,
    originalSummary,
    options,
  });
}

async function processMealTemplateNutritionAnalysisAsync(
  mealId: string,
  userId: string,
  description: string,
  mealSummary?: MealSummary,
  originalSummary?: MealSummary,
  options?: Pick<NutritionAnalysisAsyncOptions, 'lockMealDisplayName'>
): Promise<void> {
  return applyNutritionAnalysis({
    target: { kind: 'meal', mealId, userId },
    userId,
    description,
    mealSummary,
    originalSummary,
    options,
  });
}

// Async function to generate and store embedding for a meal log
async function processEmbeddingGenerationAsync(
  mealLogId: string,
  name: string | null,
  description: string | null,
  originalDescription: string | null
): Promise<void> {
  try {
    // Check if embedding already exists (idempotent)
    const { data: existing } = await supabaseAdmin
      .from('meal_log_embeddings')
      .select('meal_log_id')
      .eq('meal_log_id', mealLogId)
      .single();

    if (existing) {
      console.log(`Embedding already exists for meal log ${mealLogId}, skipping`);
      return;
    }

    // Generate embedding
    const embedding = await embeddingService.generateEmbedding(
      name,
      description,
      originalDescription
    );

    // Store embedding in database
    // Supabase JS client accepts array directly for vector types
    const { error } = await supabaseAdmin
      .from('meal_log_embeddings')
      .insert({
        meal_log_id: mealLogId,
        embedding: embedding,
      });

    if (error) {
      console.error('Error storing embedding:', error);
      throw error;
    }

    console.log(`Successfully generated and stored embedding for meal log ${mealLogId}`);
  } catch (error) {
    console.error('Async embedding generation failed:', error);
    // Don't throw - we don't want to block meal creation if embedding fails
  }
}

// Get logs for a date range for the authenticated user
// Returns meals, water, and activity logs grouped by day
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    // Get timezone from query parameter or default to UTC
    const timezone = (req.query.timezone as string) || 'UTC';
    // Validate timezone
    const tzCheck = DateTime.now().setZone(timezone);
    if (!tzCheck.isValid) {
      res.status(400).json({ error: 'Invalid timezone' });
      return;
    }

    // Get date range from query parameters (required)
    const dateStartParam = req.query.dateStart as string | undefined;
    const dateEndParam = req.query.dateEnd as string | undefined;

    if (!dateStartParam || !dateEndParam) {
      res.status(400).json({ error: 'Missing required query parameters: dateStart and dateEnd (format: YYYY-MM-DD)' });
      return;
    }

    // Parse and validate dateStart
    const dateStart = DateTime.fromFormat(dateStartParam, 'yyyy-MM-dd', { zone: timezone });
    if (!dateStart.isValid) {
      res.status(400).json({ error: 'Invalid dateStart format. Use YYYY-MM-DD' });
      return;
    }

    // Parse and validate dateEnd
    const dateEnd = DateTime.fromFormat(dateEndParam, 'yyyy-MM-dd', { zone: timezone });
    if (!dateEnd.isValid) {
      res.status(400).json({ error: 'Invalid dateEnd format. Use YYYY-MM-DD' });
      return;
    }

    // Ensure dateStart <= dateEnd
    if (dateStart > dateEnd) {
      res.status(400).json({ error: 'dateStart must be less than or equal to dateEnd' });
      return;
    }

    // Calculate date range boundaries in user's timezone
    const startOfRangeTz = dateStart.startOf('day');
    const endOfRangeTz = dateEnd.endOf('day'); // Inclusive end of day
    const nextDayAfterEndTz = endOfRangeTz.plus({ days: 1 }).startOf('day'); // Exclusive for filtering

    // Convert boundaries to UTC ISO strings for DB filtering
    const startOfRangeUTCISO = startOfRangeTz.toUTC().toISO();
    const endOfRangeUTCISO = nextDayAfterEndTz.toUTC().toISO();

    // Fetch meal logs for the user, then filter by date range.
    // For planned meals, prefer planned_for (so they show on the intended day).
    // For logged meals, prefer logged_at (preferred) or created_at (fallback).
    const { data: allMealLogs, error: mealLogsError } = await supabaseAdmin
      .from('meal_logs')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('planned_for', { ascending: false, nullsFirst: false })
      .order('logged_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (mealLogsError) throw mealLogsError;

    // Filter meal logs within the date range
    const mealLogsInRange = (allMealLogs || []).filter(log => {
      const dateToCheck =
        log.status === 'planned'
          ? (log.planned_for || log.created_at)
          : (log.logged_at || log.created_at);
      if (!dateToCheck) return false;
      
      // Parse the date - it should already be in UTC from the database
      const logDate = DateTime.fromISO(dateToCheck, { zone: 'utc' });
      const startDate = DateTime.fromISO(startOfRangeUTCISO!, { zone: 'utc' });
      const endDate = DateTime.fromISO(endOfRangeUTCISO!, { zone: 'utc' });
      
      if (!logDate.isValid) return false;
      
      return logDate >= startDate && logDate < endDate;
    });

    // Fetch water logs for the date range
    const { data: waterLogs, error: waterLogsError } = await supabaseAdmin
      .from('water_logs')
      .select('date, glasses')
      .eq('user_id', req.user!.id)
      .gte('date', dateStartParam)
      .lte('date', dateEndParam)
      .order('date', { ascending: true });

    if (waterLogsError) throw waterLogsError;

    const { data: allActivityLogs, error: activityLogsError } = await supabaseAdmin
      .from('activity_logs')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('logged_at', { ascending: false });

    if (activityLogsError) throw activityLogsError;

    const activityLogsInRange = (allActivityLogs || []).filter((log) => {
      const dateToCheck = log.logged_at;
      if (!dateToCheck) return false;
      const logDate = DateTime.fromISO(dateToCheck, { zone: 'utc' });
      const startDate = DateTime.fromISO(startOfRangeUTCISO!, { zone: 'utc' });
      const endDate = DateTime.fromISO(endOfRangeUTCISO!, { zone: 'utc' });
      if (!logDate.isValid) return false;
      return logDate >= startDate && logDate < endDate;
    });

    const activityLogsByDate = new Map<string, any[]>();
    activityLogsInRange.forEach((log) => {
      const dateToCheck = log.logged_at;
      if (!dateToCheck) return;
      const logDate = DateTime.fromISO(dateToCheck, { zone: 'utc' }).setZone(timezone);
      if (!logDate.isValid) return;
      const dateKey = logDate.toFormat('yyyy-MM-dd');
      if (!activityLogsByDate.has(dateKey)) {
        activityLogsByDate.set(dateKey, []);
      }
      activityLogsByDate.get(dateKey)!.push(log);
    });

    // Create a map of water logs by date for quick lookup
    const waterLogsByDate = new Map<string, { glasses: number }>();
    (waterLogs || []).forEach(waterLog => {
      waterLogsByDate.set(waterLog.date, { glasses: waterLog.glasses });
    });

    // Group meal logs by day in user's timezone
    const mealLogsByDate = new Map<string, any[]>();
    mealLogsInRange.forEach(log => {
      const dateToCheck =
        log.status === 'planned'
          ? (log.planned_for || log.created_at)
          : (log.logged_at || log.created_at);
      if (!dateToCheck) return;

      // Convert UTC timestamp to user's timezone and get the date string
      const logDate = DateTime.fromISO(dateToCheck, { zone: 'utc' }).setZone(timezone);
      if (!logDate.isValid) return;

      const dateKey = logDate.toFormat('yyyy-MM-dd');
      
      if (!mealLogsByDate.has(dateKey)) {
        mealLogsByDate.set(dateKey, []);
      }
      mealLogsByDate.get(dateKey)!.push(log);
    });

    // Build the response object with all days in the range
    const result: Record<
      string,
      { meals: any[]; water: { glasses: number }; activities: any[] }
    > = {};

    // Iterate through all days in the range
    let currentDay = startOfRangeTz;
    while (currentDay <= endOfRangeTz) {
      const dateKey = currentDay.toFormat('yyyy-MM-dd');

      result[dateKey] = {
        meals: mealLogsByDate.get(dateKey) || [],
        water: waterLogsByDate.get(dateKey) || { glasses: 0 },
        activities: activityLogsByDate.get(dateKey) || [],
      };
      
      currentDay = currentDay.plus({ days: 1 });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch logs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Semantic search for meal logs (must come before /:id route)
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const thresholdParam = req.query.threshold as string | undefined;
    const daysParam = req.query.days as string | undefined;
    const startDateParam = req.query.start_date as string | undefined;
    const endDateParam = req.query.end_date as string | undefined;

    if (!query || query.trim().length === 0) {
      res.status(400).json({ error: 'Missing or empty query parameter (q)' });
      return;
    }

    // Parse limit (default 10, max 50)
    const limit = Math.min(
      Math.max(parseInt(limitParam || '10', 10) || 10, 1),
      50
    );

    // Parse threshold (default 0.25, must be between 0 and 1)
    // Lower default because single-word queries like "protein" have lower similarity scores
    // (typically 0.2-0.4) compared to full sentence queries
    const threshold = Math.max(
      Math.min(parseFloat(thresholdParam || '0.25') || 0.25, 1),
      0
    );

    // Parse date range parameters
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (daysParam) {
      // If days parameter is provided, calculate start_date from now
      const days = parseInt(daysParam, 10);
      if (isNaN(days) || days < 1) {
        res.status(400).json({ error: 'Invalid days parameter. Must be a positive integer.' });
        return;
      }
      endDate = new Date(); // End date is now
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days); // Start date is N days ago
    } else if (startDateParam || endDateParam) {
      // If explicit start_date or end_date are provided, parse them
      if (startDateParam) {
        startDate = new Date(startDateParam);
        if (isNaN(startDate.getTime())) {
          res.status(400).json({ error: 'Invalid start_date parameter. Must be a valid ISO 8601 date string.' });
          return;
        }
      }
      if (endDateParam) {
        endDate = new Date(endDateParam);
        if (isNaN(endDate.getTime())) {
          res.status(400).json({ error: 'Invalid end_date parameter. Must be a valid ISO 8601 date string.' });
          return;
        }
      }
    }

    // Generate embedding for the query
    const queryEmbedding = await embeddingService.generateQueryEmbedding(query);

    // Perform vector similarity search using RPC function
    // The RPC function handles the vector operations and user filtering
    // Convert array to string format for RPC call: '[0.1,0.2,0.3,...]'
    const queryEmbeddingString = '[' + queryEmbedding.join(',') + ']';

    // Prepare RPC parameters
    const rpcParams: any = {
      p_user_id: req.user!.id,
      p_query_embedding: queryEmbeddingString,
      p_threshold: threshold,
      p_limit: limit,
    };

    // Add date range parameters if provided
    if (startDate) {
      rpcParams.p_start_date = startDate.toISOString();
    }
    if (endDate) {
      rpcParams.p_end_date = endDate.toISOString();
    }

    // Fetch exactly the limit number of results - we'll reorder them by similarity range and date
    const { data, error } = await supabaseAdmin.rpc('search_meal_embeddings', rpcParams);

    if (error) {
      console.error('Error calling search_meal_embeddings RPC:', error);
      throw error;
    }

    // Format results from RPC function
    const formattedResults = (data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      logged_at: item.logged_at,
      total_nutrition: item.total_nutrition || null,
      similarity: typeof item.similarity === 'number' 
        ? parseFloat(item.similarity.toFixed(4)) 
        : parseFloat(parseFloat(item.similarity).toFixed(4)), // Round to 4 decimal places
    }));

    // Group results by similarity ranges (0.05 increments)
    // Helper function to get the range key for a similarity score
    const getRangeKey = (similarity: number): number => {
      // Round down to nearest 0.05 increment (e.g., 0.67 -> 0.65, 0.72 -> 0.70)
      return Math.floor(similarity * 20) / 20;
    };

    // Group results by similarity range
    const groupedByRange = new Map<number, typeof formattedResults>();
    
    for (const result of formattedResults) {
      const rangeKey = getRangeKey(result.similarity);
      if (!groupedByRange.has(rangeKey)) {
        groupedByRange.set(rangeKey, []);
      }
      groupedByRange.get(rangeKey)!.push(result);
    }

    // Sort each group by logged_at DESC (most recent first)
    for (const [rangeKey, group] of groupedByRange.entries()) {
      group.sort((a: typeof formattedResults[0], b: typeof formattedResults[0]) => {
        const dateA = a.logged_at ? new Date(a.logged_at).getTime() : 0;
        const dateB = b.logged_at ? new Date(b.logged_at).getTime() : 0;
        return dateB - dateA; // DESC order (newest first)
      });
    }

    // Flatten groups into a single array, ordered by similarity range (highest first)
    const sortedRanges = Array.from(groupedByRange.entries())
      .sort(([rangeA], [rangeB]) => rangeB - rangeA); // DESC order (highest similarity first)

    const results: typeof formattedResults = [];
    for (const [, group] of sortedRanges) {
      results.push(...group);
    }

    // Results are already limited to the requested amount from the RPC call
    res.json({ results });
  } catch (error) {
    console.error('Error searching meal logs:', error);
    res.status(500).json({
      error: 'Failed to search meal logs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get recently logged meals with optional filtering
router.get('/recent', requireAuth, async (req: Request, res: Response) => {
  try {
    // Parse query parameters
    const limitParam = req.query.limit as string | undefined;
    const timezone = (req.query.timezone as string) || 'UTC';
    const hourStartParam = req.query.hourStart as string | undefined;
    const hourEndParam = req.query.hourEnd as string | undefined;
    const dateStartParam = req.query.dateStart as string | undefined;
    const dateEndParam = req.query.dateEnd as string | undefined;
    const daysParam = req.query.days as string | undefined;

    // Validate timezone
    const tzCheck = DateTime.now().setZone(timezone);
    if (!tzCheck.isValid) {
      res.status(400).json({ error: 'Invalid timezone' });
      return;
    }

    // Parse limit (default 5, max 50)
    const limit = Math.min(
      Math.max(parseInt(limitParam || '5', 10) || 5, 1),
      50
    );

    // Validate hour format if provided
    const hourFormatRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (hourStartParam && !hourFormatRegex.test(hourStartParam)) {
      res.status(400).json({ error: 'Invalid hourStart format. Use HH:mm (e.g., 00:00, 11:00)' });
      return;
    }
    if (hourEndParam && !hourFormatRegex.test(hourEndParam)) {
      res.status(400).json({ error: 'Invalid hourEnd format. Use HH:mm (e.g., 00:00, 11:00)' });
      return;
    }

    // Both hourStart and hourEnd must be provided together
    if ((hourStartParam && !hourEndParam) || (!hourStartParam && hourEndParam)) {
      res.status(400).json({ error: 'Both hourStart and hourEnd must be provided together' });
      return;
    }

    // Parse hour range if provided
    let hourStart: { hour: number; minute: number } | null = null;
    let hourEnd: { hour: number; minute: number } | null = null;
    if (hourStartParam && hourEndParam) {
      const [startHour, startMinute] = hourStartParam.split(':').map(Number);
      const [endHour, endMinute] = hourEndParam.split(':').map(Number);
      hourStart = { hour: startHour, minute: startMinute };
      hourEnd = { hour: endHour, minute: endMinute };
    }

    // Calculate date range
    let dateStart: DateTime | null = null;
    let dateEnd: DateTime | null = null;

    if (daysParam) {
      // Use days parameter: calculate dateStart as today minus days
      const days = parseInt(daysParam, 10);
      if (isNaN(days) || days < 1) {
        res.status(400).json({ error: 'Invalid days parameter. Must be a positive number' });
        return;
      }
      const today = DateTime.now().setZone(timezone).startOf('day');
      dateStart = today.minus({ days: days - 1 }); // Include today, so days=30 means 30 days including today
      dateEnd = today.plus({ days: 1 }); // Exclusive end, so add 1 day
    } else if (dateStartParam || dateEndParam) {
      // Use explicit date range
      if (dateStartParam) {
        dateStart = DateTime.fromFormat(dateStartParam, 'yyyy-MM-dd', { zone: timezone });
        if (!dateStart.isValid) {
          res.status(400).json({ error: 'Invalid dateStart format. Use YYYY-MM-DD' });
          return;
        }
        dateStart = dateStart.startOf('day');
      }
      if (dateEndParam) {
        dateEnd = DateTime.fromFormat(dateEndParam, 'yyyy-MM-dd', { zone: timezone });
        if (!dateEnd.isValid) {
          res.status(400).json({ error: 'Invalid dateEnd format. Use YYYY-MM-DD' });
          return;
        }
        dateEnd = dateEnd.plus({ days: 1 }).startOf('day'); // Make exclusive end
      }
    }

    // Build base query - fetch recent meals for user
    // We'll filter by date and hour in application code for better control
    // over logged_at vs created_at fallback logic
    // Fetch a reasonable number of recent meals (200) to avoid performance issues
    // If date range is specified, we might need more, but 200 should cover most cases
    let query = supabaseAdmin
      .from('meal_logs')
      .select('*')
      .eq('user_id', req.user!.id)
      .eq('status', 'logged')
      .order('logged_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200); // Fetch up to 200 most recent meals

    const { data: meals, error } = await query;

    if (error) {
      console.error('Error fetching recent meals:', error);
      throw error;
    }

    // Filter by date range in application code (for more precise control)
    let filteredMeals = (meals || []).filter(meal => {
      const dateToCheck = meal.logged_at || meal.created_at;
      if (!dateToCheck) return false;

      const mealDate = DateTime.fromISO(dateToCheck, { zone: 'utc' });

      if (dateStart) {
        const startDateUTC = dateStart.toUTC();
        if (mealDate < startDateUTC) return false;
      }
      if (dateEnd) {
        const endDateUTC = dateEnd.toUTC();
        if (mealDate >= endDateUTC) return false;
      }

      return true;
    });

    // Apply hour range filtering if provided
    if (hourStart && hourEnd) {
      filteredMeals = filteredMeals.filter(meal => {
        const dateToCheck = meal.logged_at || meal.created_at;
        if (!dateToCheck) return false;

        // Convert meal timestamp to user's timezone
        const mealDateTime = DateTime.fromISO(dateToCheck, { zone: 'utc' }).setZone(timezone);
        if (!mealDateTime.isValid) return false;

        const mealHour = mealDateTime.hour;
        const mealMinute = mealDateTime.minute;
        const mealTimeMinutes = mealHour * 60 + mealMinute;
        const startTimeMinutes = hourStart.hour * 60 + hourStart.minute;
        const endTimeMinutes = hourEnd.hour * 60 + hourEnd.minute;

        // Handle hour range that spans midnight (e.g., 22:00-02:00)
        if (startTimeMinutes > endTimeMinutes) {
          // Range spans midnight: check if meal time is >= start OR <= end
          return mealTimeMinutes >= startTimeMinutes || mealTimeMinutes <= endTimeMinutes;
        } else {
          // Normal range: check if meal time is within range
          return mealTimeMinutes >= startTimeMinutes && mealTimeMinutes <= endTimeMinutes;
        }
      });
    }

    // Sort by logged_at DESC (nulls last), then created_at DESC as fallback
    filteredMeals.sort((a, b) => {
      const dateA = a.logged_at || a.created_at;
      const dateB = b.logged_at || b.created_at;
      
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1; // nulls last
      if (!dateB) return -1; // nulls last
      
      const timeA = new Date(dateA).getTime();
      const timeB = new Date(dateB).getTime();
      return timeB - timeA; // DESC order (newest first)
    });

    // Apply limit
    const limitedMeals = filteredMeals.slice(0, limit);

    // Format response
    const formattedMeals = limitedMeals.map(meal => ({
      id: meal.id,
      name: meal.name,
      description: meal.description,
      logged_at: meal.logged_at,
      created_at: meal.created_at,
      total_nutrition: meal.total_nutrition || null,
      ingredients: meal.ingredients || null,
    }));

    res.json({ meals: formattedMeals });
  } catch (error) {
    console.error('Error fetching recent meals:', error);
    res.status(500).json({
      error: 'Failed to fetch recent meals',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get one favorite by ID (for chat when user taps a favorite to re-log)
router.get('/favorites/:favoriteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { favoriteId } = req.params;
    if (!favoriteId) {
      res.status(400).json({ error: 'Missing favorite ID' });
      return;
    }
    const { data: favorite, error } = await supabaseAdmin
      .from('favorites')
      .select(
        'id, user_id, meals:meal_id ( id, name, description, total_nutrition, ingredients, icon, analysis_status, lock_meal_display_name, photo_storage_paths, updated_at )'
      )
      .eq('id', favoriteId)
      .eq('user_id', req.user!.id)
      .single();

    const meal = (favorite as any)?.meals;
    if (error || !favorite || !meal) {
      res.status(404).json({ error: 'Favorite not found' });
      return;
    }
    res.json({
      favorite: {
        id: favorite.id, // favorite join id (used by client as favoriteId)
        meal_id: meal.id,
        name: meal.name,
        description: meal.description,
        total_nutrition: meal.total_nutrition ?? null,
        ingredients: meal.ingredients ?? [],
        icon: meal.icon ?? undefined,
        analysis_status: meal.analysis_status ?? 'completed',
        lock_meal_display_name: meal.lock_meal_display_name ?? false,
        photo_storage_paths: meal.photo_storage_paths ?? null,
        updated_at: meal.updated_at ?? undefined,
      },
    });
  } catch (error) {
    console.error('Error fetching favorite:', error);
    res.status(500).json({
      error: 'Failed to fetch favorite',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// List favorites (full snapshot rows) sorted by name for chat Favorites tab
router.get('/favorites', requireAuth, async (req: Request, res: Response) => {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from('favorites')
      .select(
        'id, meals:meal_id ( id, name, description, total_nutrition, ingredients, icon, analysis_status, lock_meal_display_name, photo_storage_paths, updated_at )'
      )
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const meals = (rows || []).map((f: any) => ({
      // Keep id as the favorite join id so existing client calls keep working.
      id: f.id,
      name: f.meals?.name,
      description: f.meals?.description,
      logged_at: null,
      total_nutrition: f.meals?.total_nutrition ?? null,
      ingredients: f.meals?.ingredients ?? null,
      icon: f.meals?.icon ?? undefined,
      analysis_status: f.meals?.analysis_status ?? 'completed',
      lock_meal_display_name: f.meals?.lock_meal_display_name ?? false,
      photo_storage_paths: f.meals?.photo_storage_paths ?? null,
      updated_at: f.meals?.updated_at ?? null,
    }));
    meals.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
    res.json({ meals });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({
      error: 'Failed to fetch favorites',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Remove a favorite by favorite id (e.g. from chat Favorites tab)
router.delete('/favorites/:favoriteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { favoriteId } = req.params;
    if (!favoriteId) {
      res.status(400).json({ error: 'Missing favorite ID' });
      return;
    }
    const { error } = await supabaseAdmin
      .from('favorites')
      .delete()
      .eq('id', favoriteId)
      .eq('user_id', req.user!.id);
    if (error) throw error;
    res.json({ message: 'Removed from favorites' });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({
      error: 'Failed to remove from favorites',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create a favorite template (meals + favorites) without creating a meal_log; async nutrition analysis on meals row
router.post('/favorites', requireAuth, async (req: Request, res: Response) => {
  try {
    const { mealSummary, originalSummary, mealDescription, lockMealDisplayName } = req.body;

    if (!mealSummary) {
      res.status(400).json({ error: 'Missing or invalid mealSummary in request body' });
      return;
    }
    if (!mealDescription || typeof mealDescription !== 'string') {
      res.status(400).json({ error: 'Missing or invalid mealDescription' });
      return;
    }

    const summary = mealSummary as MealSummary;
    if (!summary.name || !summary.description) {
      res.status(400).json({
        error: 'Invalid mealSummary: missing required fields (name, description)',
      });
      return;
    }

    const initialIngredients = ingredientsFromMealSummaryForInsert(summary);
    const wantLockDisplayName = lockMealDisplayName === true;

    const { data: meal, error: mealErr } = await supabaseAdmin
      .from('meals')
      .insert({
        user_id: req.user!.id,
        name: summary.name,
        description: summary.description,
        total_nutrition: null,
        ingredients: initialIngredients.length > 0 ? initialIngredients : [],
        icon: null,
        analysis_status: 'pending',
        lock_meal_display_name: wantLockDisplayName,
      })
      .select()
      .single();

    if (mealErr) {
      console.error('[POST /favorites] meal insert:', mealErr);
      throw mealErr;
    }
    if (!meal) {
      res.status(500).json({ error: 'Failed to create meal template' });
      return;
    }

    const { data: newFavorite, error: favErr } = await supabaseAdmin
      .from('favorites')
      .insert({
        user_id: req.user!.id,
        meal_id: meal.id,
      })
      .select('id')
      .single();

    if (favErr) {
      console.error('[POST /favorites] favorite insert:', favErr);
      await supabaseAdmin.from('meals').delete().eq('id', meal.id).eq('user_id', req.user!.id);
      throw favErr;
    }
    if (!newFavorite) {
      res.status(500).json({ error: 'Failed to create favorite' });
      return;
    }

    const originalSummaryForAnalysis = (originalSummary as MealSummary | undefined) || summary;
    setImmediate(() => {
      processMealTemplateNutritionAnalysisAsync(
        meal.id,
        req.user!.id,
        mealDescription,
        summary,
        originalSummaryForAnalysis,
        { lockMealDisplayName: wantLockDisplayName }
      ).catch(err => {
        console.error('[POST /favorites] Failed to start async nutrition analysis:', err);
      });
    });

    res.status(201).json({
      message: 'Favorite template created, nutrition analysis in progress',
      favoriteId: newFavorite.id,
      data: meal,
    });
  } catch (error) {
    console.error('Failed to create favorite template:', error);
    res.status(500).json({
      error: 'Failed to create favorite template',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update favorite template (meals row); same re-analysis rules as PATCH /logs/:id body (no meal_log)
router.patch('/favorites/:favoriteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { favoriteId } = req.params;
    const {
      name,
      description,
      totalNutrition,
      ingredients,
      skipAnalysis,
      skipIconSelection,
      lockMealDisplayName,
      photoStoragePaths,
    } = req.body;

    if (!favoriteId) {
      res.status(400).json({ error: 'Missing favorite ID' });
      return;
    }

    const { data: fav, error: favErr } = await supabaseAdmin
      .from('favorites')
      .select('id, meal_id, user_id')
      .eq('id', favoriteId)
      .eq('user_id', req.user!.id)
      .single();

    if (favErr || !fav) {
      if (favErr?.code === 'PGRST116') {
        res.status(404).json({ error: 'Favorite not found' });
        return;
      }
      throw favErr;
    }

    const mealId = (fav as { meal_id: string }).meal_id;

    const { data: existingMeal, error: mealFetchErr } = await supabaseAdmin
      .from('meals')
      .select('id, user_id, name, description, ingredients, icon')
      .eq('id', mealId)
      .eq('user_id', req.user!.id)
      .single();

    if (mealFetchErr || !existingMeal) {
      res.status(404).json({ error: 'Meal template not found' });
      return;
    }

    const updatePayload: Record<string, unknown> = {};

    if (name !== undefined) {
      updatePayload.name = name;
    }
    if (description !== undefined) {
      updatePayload.description = description;
    }
    if (totalNutrition !== undefined) {
      updatePayload.total_nutrition = totalNutrition;
    }
    if (ingredients !== undefined) {
      updatePayload.ingredients = ingredients;
    }
    if (lockMealDisplayName !== undefined) {
      updatePayload.lock_meal_display_name = lockMealDisplayName === true;
    }
    if (photoStoragePaths !== undefined) {
      const parsed = mealPhotoPathsFromBody(photoStoragePaths, req.user!.id);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.message });
        return;
      }
      updatePayload.photo_storage_paths = parsed.paths;
    }

    if (Object.keys(updatePayload).length === 0) {
      res.status(400).json({
        error:
          'Request body must include at least one of: name, description, totalNutrition, ingredients, lockMealDisplayName, photoStoragePaths',
      });
      return;
    }

    const contentChanged = name !== undefined || description !== undefined || ingredients !== undefined;
    const shouldRunAnalysis = contentChanged && skipAnalysis !== true;
    if (shouldRunAnalysis) {
      updatePayload.analysis_status = 'analyzing';
    }

    if (
      (name !== undefined || description !== undefined) &&
      skipIconSelection !== true
    ) {
      try {
        const displayName = name ?? (existingMeal as { name?: string }).name ?? '';
        const displayDesc = description ?? (existingMeal as { description?: string }).description ?? '';
        updatePayload.icon = await iconSelectionService.selectIcon(displayName, displayDesc, {
          userId: req.user!.id,
          route: 'logs/favorites/patch',
        });
      } catch (iconError) {
        console.error('[PATCH favorites/:id] Icon selection failed, keeping existing icon:', iconError);
      }
    }

    const { data: updatedMeal, error: updateError } = await supabaseAdmin
      .from('meals')
      .update(updatePayload)
      .eq('id', mealId)
      .eq('user_id', req.user!.id)
      .select()
      .single();

    if (updateError) {
      console.error('Database error:', updateError);
      throw updateError;
    }

    if (shouldRunAnalysis && updatedMeal) {
      const desc = (description ?? (updatedMeal as { description?: string }).description) || '';
      const summary: MealSummary = {
        name: (name ?? (updatedMeal as { name?: string }).name) || '',
        description: desc,
        questionSummary: '',
        ingredients: ((ingredients ?? (updatedMeal as { ingredients?: unknown[] }).ingredients) || []).map(
          (ing: any) => ({
            name: ing.name,
            servingAmount: ing.servingAmount,
            servingUnit: ing.servingUnit,
            servingSizeGrams: ing.servingSizeGrams ?? 0,
            provenance: ing.provenance ?? { source: 'llm_estimate' as const, confidence: 'medium' as const },
          })
        ),
        questions: [],
        assumptions: [],
      };
      const wantLock =
        lockMealDisplayName !== undefined
          ? lockMealDisplayName === true
          : !!(updatedMeal as { lock_meal_display_name?: boolean }).lock_meal_display_name;
      setImmediate(() => {
        processMealTemplateNutritionAnalysisAsync(mealId, req.user!.id, desc, summary, summary, {
          lockMealDisplayName: wantLock,
        }).catch(err => {
          console.error('[PATCH favorites/:id] Failed to start async nutrition analysis:', err);
        });
      });
    }

    res.json({
      message: 'Favorite template updated successfully',
      data: updatedMeal,
      favoriteId,
    });
  } catch (error) {
    console.error('Error updating favorite template:', error);
    res.status(500).json({
      error: 'Failed to update favorite template',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Add a meal log to favorites: create a favorite row (copy of meal) and set meal_log.favorite_id
router.post('/:id/favorite', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing meal log ID' });
      return;
    }
    const { data: log, error: fetchError } = await supabaseAdmin
      .from('meal_logs')
      .select('id, user_id, name, description, total_nutrition, ingredients, icon, photo_storage_paths')
      .eq('id', id)
      .single();
    if (fetchError || !log) {
      res.status(404).json({ error: 'Meal log not found' });
      return;
    }
    if (log.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Unauthorized' });
      return;
    }
    // Create a saved meal row
    const logPaths = (log as { photo_storage_paths?: string[] | null }).photo_storage_paths;
    const { data: meal, error: mealErr } = await supabaseAdmin
      .from('meals')
      .insert({
        user_id: req.user!.id,
        name: log.name,
        description: log.description,
        total_nutrition: log.total_nutrition ?? null,
        ingredients: log.ingredients ?? [],
        icon: log.icon ?? null,
        photo_storage_paths:
          Array.isArray(logPaths) && logPaths.length > 0 ? logPaths : null,
      })
      .select('id')
      .single();
    if (mealErr) throw mealErr;
    if (!meal) throw new Error('Failed to create meal');

    // Create join favorite row
    const { data: newFavorite, error: favErr } = await supabaseAdmin
      .from('favorites')
      .insert({
        user_id: req.user!.id,
        meal_id: meal.id,
      })
      .select('id')
      .single();
    if (favErr) throw favErr;
    if (!newFavorite) throw new Error('Failed to create favorite');

    const { error: updateError } = await supabaseAdmin
      .from('meal_logs')
      .update({ favorite_id: newFavorite.id })
      .eq('id', id)
      .eq('user_id', req.user!.id);
    if (updateError) throw updateError;
    res.status(201).json({ message: 'Added to favorites', favoriteId: newFavorite.id });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({
      error: 'Failed to add to favorites',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Remove from favorites: delete the favorite (and clear favorite_id on all linked meal_logs via ON DELETE SET NULL)
router.delete('/:id/favorite', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing meal log ID' });
      return;
    }
    const { data: log, error: fetchError } = await supabaseAdmin
      .from('meal_logs')
      .select('favorite_id')
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .single();
    if (fetchError || !log) {
      res.status(404).json({ error: 'Meal log not found' });
      return;
    }
    const favoriteId = (log as { favorite_id?: string | null }).favorite_id;
    if (!favoriteId) {
      res.status(400).json({ error: 'This meal is not a favorite' });
      return;
    }
    const { error: deleteError } = await supabaseAdmin
      .from('favorites')
      .delete()
      .eq('id', favoriteId)
      .eq('user_id', req.user!.id);
    if (deleteError) throw deleteError;
    res.json({ message: 'Removed from favorites' });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({
      error: 'Failed to remove from favorites',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get a single meal log by ID
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({ 
        error: 'Missing meal log ID' 
      });
      return;
    }

    // Fetch the meal log - RLS will ensure user can only access their own logs
    const { data: log, error } = await supabaseAdmin
      .from('meal_logs')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ 
          error: 'Meal log not found' 
        });
        return;
      }
      console.error('Database error:', error);
      throw error;
    }

    res.json({ log });
  } catch (error) {
    console.error('Error fetching meal log:', error);
    res.status(500).json({ 
      error: 'Failed to fetch meal log',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a new log with nutrition analysis
const createLog: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { mealDescription, loggedAt, mealType, favoriteId } = req.body;
    
    if (!mealDescription || typeof mealDescription !== 'string') {
      res.status(400).json({ 
        error: 'Missing or invalid mealDescription in request body' 
      });
      return;
    }
    if (mealType !== undefined && !isValidMealType(mealType)) {
      res.status(400).json({ error: 'mealType must be one of: breakfast, lunch, dinner, snack' });
      return;
    }
    
    let nutritionData;
    try {
      nutritionData = await nutritionService.analyzeMeal(mealDescription, {
        userId: req.user!.id,
        route: 'logs/create',
      });
    } catch (nutritionError) {
      console.error('Nutrition analysis failed:', nutritionError);
      throw nutritionError;
    }
    
    // Select icon for the meal (don't let icon selection failure block meal creation)
    let icon = 'utensils'; // Default fallback
    try {
      icon = await iconSelectionService.selectIcon(nutritionData.name, nutritionData.description, {
        userId: req.user!.id,
        route: 'logs/create',
      });
    } catch (iconError) {
      console.error('[createLog] Icon selection failed, using default:', iconError);
      // Continue with default icon - don't fail the entire meal creation
    }
    
    // Prepare insert data
    const insertData: any = {
      user_id: req.user!.id,
      name: nutritionData.name,
      description: nutritionData.description, // Use LLM-generated description
      total_nutrition: nutritionData.totalNutrition,
      ingredients: nutritionData.ingredients || [],
      icon: icon
    };
    
    // Add logged_at if provided
    if (loggedAt) {
      insertData.logged_at = loggedAt;
    }
    if (mealType !== undefined && isValidMealType(mealType)) {
      insertData.meal_type = mealType.toLowerCase();
    }
    if (favoriteId != null && typeof favoriteId === 'string') {
      insertData.favorite_id = favoriteId;
    }
    
    // Create the meal log in the database
    const { data: log, error } = await supabaseAdmin
      .from('meal_logs')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    // Start async embedding generation in background (fire-and-forget)
    setImmediate(() => {
      processEmbeddingGenerationAsync(
        log.id,
        nutritionData.name,
        nutritionData.description,
        mealDescription
      ).catch(err => {
        console.error('Failed to start async embedding generation:', err);
      });
    });
    
    posthog.capture({
      distinctId: req.user!.id,
      event: 'meal log created',
      properties: {
        meal_type: mealType ?? null,
        from_favorite: favoriteId != null,
      },
    });

    res.status(201).json({
      message: 'Meal log created with nutrition analysis',
      data: log
    });
  } catch (error) {
    console.error('Failed to process meal log:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    posthog.captureException(error, req.user?.id);
    res.status(500).json({
      error: 'Failed to process meal log',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

router.post('/', requireAuth, createLog);

router.post('/photo-summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const { photoPaths, userContext, conversationHistory } = req.body;
    const rawPaths: unknown[] = Array.isArray(photoPaths) ? photoPaths : [];
    const paths = rawPaths
      .filter((p) => typeof p === 'string' && p.trim().length > 0)
      .map((p) => String(p).trim())
      .slice(0, 4);
    if (paths.length === 0) {
      res.status(400).json({ error: 'Missing or invalid photoPaths' });
      return;
    }
    if (paths.some((p) => !p.startsWith(`${req.user!.id}/`))) {
      res.status(403).json({ error: 'One or more photo paths are not owned by this user' });
      return;
    }

    let validatedHistory: Array<{ question: string; answer: string }> | undefined;
    if (conversationHistory) {
      if (!Array.isArray(conversationHistory)) {
        res.status(400).json({ error: 'conversationHistory must be an array' });
        return;
      }
      validatedHistory = conversationHistory.map((item: any) => {
        if (typeof item.question !== 'string' || typeof item.answer !== 'string') {
          throw new Error('Each conversationHistory item must have question and answer strings');
        }
        return { question: item.question, answer: item.answer };
      });
    }

    const signedUrls: string[] = [];
    for (const p of paths) {
      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from(MEAL_PHOTO_BUCKET)
        .createSignedUrl(p, 60 * 5);
      if (signedUrlError || !signedUrlData?.signedUrl) {
        res.status(400).json({ error: 'Unable to access one of the uploaded photos for analysis' });
        return;
      }
      signedUrls.push(signedUrlData.signedUrl);
    }

    const photoAnalysis = await nutritionService.analyzeMealPhoto(
      signedUrls,
      typeof userContext === 'string' ? userContext : undefined,
      { userId: req.user!.id, route: 'logs/photo-summary' }
    );
    if (!photoAnalysis.isMeal) {
      res.json({
        summary: buildMealChatGuardrailSummary(
          "I couldn't confidently identify a meal in that photo. Try another angle or add a short description of what you ate.",
        ),
        sourceDescription: '',
      });
      return;
    }

    const sourceDescription = photoAnalysis.mealDescription.trim();
    const summary = await nutritionService.analyzeMealConversation(sourceDescription, validatedHistory, {
      userId: req.user!.id,
      route: 'logs/photo-summary',
    });
    res.json({
      summary,
      sourceDescription,
      photo: {
        confidence: photoAnalysis.confidence,
        assumptions: photoAnalysis.assumptions,
      },
    });
  } catch (error) {
    console.error('Error generating meal photo summary:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({
      error: 'Failed to generate meal photo summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Generate meal summary + clarifying questions (stateless)
router.post('/summary', requireAuth, async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
  try {
    const { mealDescription, conversationHistory } = req.body;
    if (!mealDescription || typeof mealDescription !== 'string') {
      res.status(400).json({ error: 'Missing or invalid mealDescription' });
      return;
    }
    // Validate conversationHistory if provided
    let validatedHistory: Array<{question: string; answer: string}> | undefined;
    if (conversationHistory) {
      if (!Array.isArray(conversationHistory)) {
        res.status(400).json({ error: 'conversationHistory must be an array' });
        return;
      }
      validatedHistory = conversationHistory.map((item: any) => {
        if (typeof item.question !== 'string' || typeof item.answer !== 'string') {
          throw new Error('Each conversationHistory item must have question and answer strings');
        }
        return { question: item.question, answer: item.answer };
      });
    }

    // Meal-chat guardrails: keep the log-mode chat strictly meal-logging focused.
    // Fail-open behavior: if classification fails, we fall back to the existing summary flow.
    const cannedOffTopic =
      'I can only help with logging meals in this chat. Try telling me what you ate and I\'ll take it from there :)';
    const cannedPlanMismatch =
      'I can only help with logging meals in this chat. Switch to Plan mode for help with meal planning.';

    let intent: MealChatIntent = 'log';
    try {
      intent = await mealChatIntentClassifier.classify(
        {
          mealDescription,
          conversationHistory: validatedHistory ?? [],
        },
        { userId: req.user!.id, route: 'logs/summary' }
      );
    } catch (e) {
      if (e instanceof LlmQuotaExceededError) throw e;
      console.warn('[logs/summary] mealChatIntentClassifier failed; proceeding with existing flow', {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    if (intent === 'off_topic') {
      res.json({ summary: buildMealChatGuardrailSummary(cannedOffTopic) });
      return;
    }

    if (intent === 'plan') {
      res.json({ summary: buildMealChatGuardrailSummary(cannedPlanMismatch) });
      return;
    }

    const summaryStartedAt = Date.now();
    const summary = await nutritionService.analyzeMealConversation(mealDescription, validatedHistory, {
      userId: req.user!.id,
      route: 'logs/summary',
    });
    const summaryMs = Date.now() - summaryStartedAt;
    const totalMs = Date.now() - requestStartedAt;
    console.log('[logs/summary] ok', { summaryMs, totalMs });
    res.json({ summary });
  } catch (error) {
    console.error('Error generating meal summary:', error);
    const totalMs = Date.now() - requestStartedAt;
    console.log('[logs/summary] error', { totalMs });
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({ 
      error: 'Failed to generate meal summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Generate meal summary + clarifying questions (async). Returns quickly with a requestId.
router.post('/summary-async', requireAuth, async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
  try {
    const { mealDescription, conversationHistory } = req.body;
    if (!mealDescription || typeof mealDescription !== 'string') {
      res.status(400).json({ error: 'Missing or invalid mealDescription' });
      return;
    }

    let validatedHistory: Array<{ question: string; answer: string }> | undefined;
    if (conversationHistory) {
      if (!Array.isArray(conversationHistory)) {
        res.status(400).json({ error: 'conversationHistory must be an array' });
        return;
      }
      validatedHistory = conversationHistory.map((item: any) => {
        if (typeof item.question !== 'string' || typeof item.answer !== 'string') {
          throw new Error('Each conversationHistory item must have question and answer strings');
        }
        return { question: item.question, answer: item.answer };
      });
    }

    // Guardrails: keep log-mode chat strictly meal-logging focused (same as /summary).
    const cannedOffTopic =
      "I can only help with logging meals in this chat. Try telling me what you ate and I'll take it from there :)";
    const cannedPlanMismatch =
      'I can only help with logging meals in this chat. Switch to Plan mode for help with meal planning.';

    let intent: MealChatIntent = 'log';
    try {
      intent = await mealChatIntentClassifier.classify(
        {
          mealDescription,
          conversationHistory: validatedHistory ?? [],
        },
        { userId: req.user!.id, route: 'logs/summary-async' }
      );
    } catch (e) {
      if (e instanceof LlmQuotaExceededError) throw e;
      console.warn('[logs/summary-async] mealChatIntentClassifier failed; proceeding with existing flow', {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    if (intent === 'off_topic') {
      res.status(202).json({ requestId: null, summary: buildMealChatGuardrailSummary(cannedOffTopic) });
      return;
    }
    if (intent === 'plan') {
      res.status(202).json({ requestId: null, summary: buildMealChatGuardrailSummary(cannedPlanMismatch) });
      return;
    }

    const requestId = randomUUID();
    const userId = req.user!.id;

    const { error: insertError } = await supabaseAdmin.from('chat_summary_requests').insert({
      id: requestId,
      user_id: userId,
      status: 'pending',
      payload: {
        mealDescription,
        conversationHistory: validatedHistory ?? null,
      },
    });

    if (insertError) {
      console.error('[logs/summary-async] insert failed:', insertError);
      res.status(500).json({ error: 'Failed to start async summary' });
      return;
    }

    posthog.capture({
      distinctId: userId,
      event: 'meal chat summary requested',
      properties: {
        has_conversation_history: (validatedHistory?.length ?? 0) > 0,
      },
    });

    res.status(202).json({ requestId });

    setImmediate(() => {
      (async () => {
        try {
          const summaryStartedAt = Date.now();
          const summary = await nutritionService.analyzeMealConversation(mealDescription, validatedHistory, {
            userId,
            route: 'logs/summary-async',
          });
          const summaryMs = Date.now() - summaryStartedAt;
          const totalMs = Date.now() - requestStartedAt;
          console.log('[logs/summary-async] ok', { requestId, summaryMs, totalMs });

          await supabaseAdmin
            .from('chat_summary_requests')
            .update({ status: 'complete', summary, error_message: null })
            .eq('id', requestId)
            .eq('user_id', userId);

          await sendOneSignalChatSummaryCompletePush({ userId, requestId, status: 'complete', summary });
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          const totalMs = Date.now() - requestStartedAt;
          console.log('[logs/summary-async] error', { requestId, totalMs, message });

          await supabaseAdmin
            .from('chat_summary_requests')
            .update({ status: 'error', error_message: message })
            .eq('id', requestId)
            .eq('user_id', userId);

          await sendOneSignalChatSummaryCompletePush({ userId, requestId, status: 'error' });
        }
      })().catch((err) => console.error('[logs/summary-async] unexpected:', err));
    });
  } catch (error) {
    console.error('Error starting async meal summary:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({
      error: 'Failed to start async meal summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Fetch async summary status/result.
router.get('/summary-async/:requestId', requireAuth, async (req: Request, res: Response) => {
  try {
    const requestId = req.params.requestId;
    if (!requestId || typeof requestId !== 'string') {
      res.status(400).json({ error: 'Missing requestId' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('chat_summary_requests')
      .select('id,status,summary,error_message,created_at')
      .eq('id', requestId)
      .eq('user_id', req.user!.id)
      .single();

    if (error) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const status = (data as any)?.status as ChatSummaryRequestStatus | undefined;
    if (status !== 'pending' && status !== 'complete' && status !== 'error') {
      res.status(500).json({ error: 'Invalid status' });
      return;
    }

    res.json({
      requestId: data.id,
      status,
      summary: status === 'complete' ? (data as any).summary : null,
      message: status === 'error' ? (data as any).error_message : null,
    });
  } catch (error) {
    console.error('Error fetching async meal summary:', error);
    res.status(500).json({
      error: 'Failed to fetch async meal summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create meal log with summary + original description; kick off async nutrition analysis
router.post('/create', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      mealSummary,
      originalSummary,
      mealDescription,
      photoPaths,
      loggedAt,
      mealType,
      favoriteId,
      lockMealDisplayName,
    } = req.body;
    
    if (mealType !== undefined && !isValidMealType(mealType)) {
      res.status(400).json({ error: 'mealType must be one of: breakfast, lunch, dinner, snack' });
      return;
    }
    if (!mealSummary) {
      res.status(400).json({ 
        error: 'Missing or invalid mealSummary in request body' 
      });
      return;
    }
    if (!mealDescription || typeof mealDescription !== 'string') {
      res.status(400).json({ error: 'Missing or invalid mealDescription' });
      return;
    }

    // Validate mealSummary structure
    const summary = mealSummary as MealSummary;
    if (!summary.name || !summary.description) {
      res.status(400).json({ 
        error: 'Invalid mealSummary: missing required fields (name, description)' 
      });
      return;
    }
    
    const initialIngredients = ingredientsFromMealSummaryForInsert(summary);
    const wantLockDisplayName = lockMealDisplayName === true;

    // Prepare insert data with summary results (per-ingredient + total nutrition refined async)
    const insertData: any = {
      user_id: req.user!.id,
      name: summary.name,
      description: summary.description, // LLM-generated summary
      total_nutrition: null,
      ingredients: initialIngredients.length > 0 ? initialIngredients : null,
      analysis_status: 'pending',
      original_description: mealDescription,
      photo_storage_paths: Array.isArray(photoPaths)
        ? (photoPaths as unknown[])
            .filter((p) => typeof p === 'string' && p.trim().length > 0)
            .map((p) => String(p).trim())
            .filter((p) => p.startsWith(`${req.user!.id}/`))
            .slice(0, 4)
        : null,
      lock_meal_display_name: wantLockDisplayName,
    };
    
    // Add logged_at if provided
    if (loggedAt) {
      insertData.logged_at = loggedAt;
    }
    if (mealType !== undefined && isValidMealType(mealType)) {
      insertData.meal_type = mealType.toLowerCase();
    }
    if (favoriteId != null && typeof favoriteId === 'string') {
      insertData.favorite_id = favoriteId;
      const noPaths =
        !insertData.photo_storage_paths || insertData.photo_storage_paths.length === 0;
      if (noPaths) {
        const fromTemplate = await photoStoragePathsFromFavoriteMeal(favoriteId, req.user!.id);
        if (fromTemplate) {
          insertData.photo_storage_paths = fromTemplate;
        }
      }
    }
    
    // Create the meal log in the database
    const { data: log, error } = await supabaseAdmin
      .from('meal_logs')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }
    
    // Start async nutrition analysis in background (fire-and-forget)
    // Pass the mealSummary (with edited amounts) and original summary to detect edits
    const originalSummaryForAnalysis = originalSummary || summary; // Use provided original or fallback to current
    setImmediate(() => {
      processNutritionAnalysisAsync(log.id, req.user!.id, mealDescription, summary, originalSummaryForAnalysis, {
        lockMealDisplayName: wantLockDisplayName,
      }).catch(err => {
        console.error('Failed to start async nutrition analysis:', err);
      });
    });

    // Start async embedding generation in background (fire-and-forget)
    setImmediate(() => {
      processEmbeddingGenerationAsync(
        log.id,
        summary.name,
        summary.description,
        mealDescription
      ).catch(err => {
        console.error('Failed to start async embedding generation:', err);
      });
    });
    
    res.status(201).json({
      message: 'Meal log created, nutrition analysis in progress',
      data: log
    });
  } catch (error) {
    console.error('Failed to create meal log:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({ 
      error: 'Failed to create meal log',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a planned meal log (does not count toward totals until converted to logged)
// Supports creating from an existing favorite join row (favorites.id -> meals row), or from explicit analyzed nutrition payload.
router.post('/planned', requireAuth, async (req: Request, res: Response) => {
  try {
    const { favoriteId, name, description, totalNutrition, ingredients, mealType, plannedFor, recipeId } = req.body;

    if (mealType !== undefined && !isValidMealType(mealType)) {
      res.status(400).json({ error: 'mealType must be one of: breakfast, lunch, dinner, snack' });
      return;
    }

    const insertData: any = {
      user_id: req.user!.id,
      status: 'planned',
      planned_for: plannedFor || null,
      logged_at: null,
      recipe_id: typeof recipeId === 'string' ? recipeId : null,
    };

    if (mealType !== undefined && isValidMealType(mealType)) {
      insertData.meal_type = mealType.toLowerCase();
    }

    if (favoriteId != null && typeof favoriteId === 'string') {
      // Hydrate from favorite join row -> meals
      const { data: fav, error: favErr } = await supabaseAdmin
        .from('favorites')
        .select(
          'id, meals:meal_id ( id, name, description, total_nutrition, ingredients, icon, photo_storage_paths )'
        )
        .eq('user_id', req.user!.id)
        .eq('id', favoriteId)
        .single();

      const meal = (fav as any)?.meals;
      if (favErr || !fav || !meal) {
        res.status(404).json({ error: 'Favorite not found' });
        return;
      }

      insertData.favorite_id = favoriteId;
      insertData.name = meal.name;
      insertData.description = meal.description;
      insertData.total_nutrition = meal.total_nutrition ?? null;
      insertData.ingredients = meal.ingredients ?? [];
      insertData.icon = meal.icon ?? null;
      insertData.analysis_status = meal.total_nutrition ? 'completed' : 'pending';
      insertData.original_description = meal.description;
      const tmplPaths = meal.photo_storage_paths;
      if (Array.isArray(tmplPaths) && tmplPaths.length > 0) {
        insertData.photo_storage_paths = tmplPaths;
      }
    } else {
      // Create from explicit analyzed payload (similar to /simple)
      if (!name || !description) {
        res.status(400).json({ error: 'Missing required fields: name, description (or provide favoriteId)' });
        return;
      }

      insertData.name = name;
      insertData.description = description;
      insertData.total_nutrition = totalNutrition ?? null;
      insertData.ingredients = ingredients || [];
      insertData.analysis_status = totalNutrition ? 'completed' : 'pending';
      insertData.original_description = description;

      // If nutrition isn't present, kick off async analysis using the description (optional)
      if (!totalNutrition) {
        insertData.analysis_status = 'pending';
      }

      // Pick an icon (best effort)
      try {
        insertData.icon = await iconSelectionService.selectIcon(name, description, {
          userId: req.user!.id,
          route: 'logs/planned',
        });
      } catch {
        insertData.icon = 'utensils';
      }
    }

    const { data: log, error } = await supabaseAdmin
      .from('meal_logs')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    // If we created a planned log without nutrition totals, analyze async for display (still won't count while planned)
    if (!log.total_nutrition && typeof log.original_description === 'string' && log.original_description.trim().length > 0) {
      setImmediate(() => {
        processNutritionAnalysisAsync(log.id, req.user!.id, log.original_description).catch(err => {
          console.error('Failed to start async nutrition analysis for planned log:', err);
        });
      });
    }

    // Generate embedding async (optional; safe)
    setImmediate(() => {
      processEmbeddingGenerationAsync(
        log.id,
        log.name ?? null,
        log.description ?? null,
        log.original_description ?? null
      ).catch(err => {
        console.error('Failed to start async embedding generation for planned log:', err);
      });
    });

    res.status(201).json({ message: 'Planned meal created', data: log });
  } catch (error) {
    console.error('Failed to create planned meal:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({
      error: 'Failed to create planned meal',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Convert a planned meal to a logged meal (counts toward totals after this)
router.post('/:id/log', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'Missing meal log id' });
      return;
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('meal_logs')
      .select('id, status, planned_for')
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Database error:', fetchError);
      throw fetchError;
    }
    if (!existing) {
      res.status(404).json({ error: 'Meal log not found' });
      return;
    }
    if (existing.status !== 'planned') {
      res.status(400).json({ error: 'Only planned meals can be logged with this action' });
      return;
    }

    // Use the scheduled time so planned meals from past days log on the correct day.
    const loggedAt = existing.planned_for ?? new Date().toISOString();

    const { data: updatedRows, error } = await supabaseAdmin
      .from('meal_logs')
      .update({
        status: 'logged',
        logged_at: loggedAt,
      })
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .eq('status', 'planned')
      .select();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }
    if (!updatedRows?.length) {
      res.status(409).json({ error: 'Meal is no longer planned' });
      return;
    }

    res.json({ message: 'Meal logged', data: updatedRows[0] });
  } catch (error) {
    console.error('Failed to log planned meal:', error);
    res.status(500).json({
      error: 'Failed to log planned meal',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Manual full nutrition analysis (not used by app flow)
router.post('/analyze', requireAuth, async (req: Request, res: Response) => {
  try {
    const { mealDescription } = req.body;
    if (!mealDescription || typeof mealDescription !== 'string') {
      res.status(400).json({ error: 'Missing or invalid mealDescription' });
      return;
    }
    const analysis = await nutritionService.analyzeMeal(mealDescription, {
      userId: req.user!.id,
      route: 'logs/analyze',
    });
    res.json({ analysis });
  } catch (error) {
    console.error('Error running nutrition analysis:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({ 
      error: 'Failed to analyze meal description',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a simple meal log without LLM analysis
router.post('/simple', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, description, totalNutrition, ingredients, loggedAt, mealType, favoriteId } = req.body;
    
    if (mealType !== undefined && !isValidMealType(mealType)) {
      res.status(400).json({ error: 'mealType must be one of: breakfast, lunch, dinner, snack' });
      return;
    }
    if (!name || !description || !totalNutrition) {
      res.status(400).json({ 
        error: 'Missing required fields: name, description, totalNutrition' 
      });
      return;
    }
    
    // Select icon for the meal (don't let icon selection failure block meal creation)
    let icon = 'utensils'; // Default fallback
    try {
      icon = await iconSelectionService.selectIcon(name, description, {
        userId: req.user!.id,
        route: 'logs/simple',
      });
    } catch (iconError) {
      console.error('[createLog/simple] Icon selection failed, using default:', iconError);
      // Continue with default icon - don't fail the entire meal creation
    }
    
    // Prepare insert data
    const insertData: any = {
      user_id: req.user!.id,
      name: name,
      description: description,
      total_nutrition: totalNutrition,
      ingredients: ingredients || [],
      icon: icon,
      // This endpoint is explicitly for already-analyzed meals (duplicates / quick log).
      // Ensure Home screen doesn't show "Crunching nomz..." for these.
      analysis_status: 'completed',
      original_description: description,
    };
    
    // Add logged_at if provided
    if (loggedAt) {
      insertData.logged_at = loggedAt;
    }
    if (mealType !== undefined && isValidMealType(mealType)) {
      insertData.meal_type = mealType.toLowerCase();
    }
    if (favoriteId != null && typeof favoriteId === 'string') {
      insertData.favorite_id = favoriteId;
      const fromTemplate = await photoStoragePathsFromFavoriteMeal(favoriteId, req.user!.id);
      if (fromTemplate) {
        insertData.photo_storage_paths = fromTemplate;
      }
    }
    
    // Create the meal log in the database
    const { data: log, error } = await supabaseAdmin
      .from('meal_logs')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    // Start async embedding generation in background (fire-and-forget)
    // For simple logs, use description as original_description since there's no separate field
    setImmediate(() => {
      processEmbeddingGenerationAsync(
        log.id,
        name,
        description,
        description // Use description as original_description for simple logs
      ).catch(err => {
        console.error('Failed to start async embedding generation:', err);
      });
    });
    
    res.status(201).json({
      message: 'Meal log created successfully',
      data: log
    });
  } catch (error) {
    console.error('Failed to create simple meal log:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({ 
      error: 'Failed to create meal log',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update a meal log (time/date only, or full meal body)
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = singleRouteParam(req.params.id);
    const {
      loggedAt,
      plannedFor,
      name,
      description,
      totalNutrition,
      ingredients,
      mealType,
      recipeId,
      photoStoragePaths,
      skipAnalysis,
      skipIconSelection,
      unlinkFavorite,
      syncFavoriteTemplate,
    } = req.body;

    if (!id) {
      res.status(400).json({
        error: 'Missing meal log ID'
      });
      return;
    }

    const wantUnlinkFavorite = unlinkFavorite === true;
    const wantSyncFavoriteTemplate = syncFavoriteTemplate === true;

    if (wantUnlinkFavorite && wantSyncFavoriteTemplate) {
      res.status(400).json({
        error: 'Cannot combine unlinkFavorite and syncFavoriteTemplate',
      });
      return;
    }

    // First, verify the log belongs to the authenticated user and load fields needed for icon selection
    const { data: existingLog, error: fetchError } = await supabaseAdmin
      .from('meal_logs')
      .select('id, user_id, name, description, status, planned_for, favorite_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        res.status(404).json({
          error: 'Meal log not found'
        });
        return;
      }
      throw fetchError;
    }

    if (existingLog.user_id !== req.user!.id) {
      res.status(403).json({
        error: 'Unauthorized to update this meal log'
      });
      return;
    }

    if (wantSyncFavoriteTemplate) {
      const fid = (existingLog as { favorite_id?: string | null }).favorite_id;
      if (!fid) {
        res.status(400).json({
          error: 'Meal is not linked to a favorite; cannot sync favorite template',
        });
        return;
      }
    }

    const updatePayload: Record<string, unknown> = {};

    if (loggedAt !== undefined) {
      if (existingLog.status === 'planned') {
        updatePayload.planned_for = loggedAt;
      } else {
        updatePayload.logged_at = loggedAt;
      }
    }
    if (plannedFor !== undefined) {
      if (existingLog.status !== 'planned') {
        res.status(400).json({
          error: 'plannedFor can only be updated for planned meals',
        });
        return;
      }
      updatePayload.planned_for = plannedFor;
    }
    if (name !== undefined) {
      updatePayload.name = name;
    }
    if (description !== undefined) {
      updatePayload.description = description;
    }
    if (totalNutrition !== undefined) {
      updatePayload.total_nutrition = totalNutrition;
    }
    if (ingredients !== undefined) {
      updatePayload.ingredients = ingredients;
    }
    if (mealType !== undefined) {
      if (!isValidMealType(mealType)) {
        res.status(400).json({ error: 'mealType must be one of: breakfast, lunch, dinner, snack' });
        return;
      }
      updatePayload.meal_type = mealType.toLowerCase();
    }
    if (recipeId !== undefined) {
      updatePayload.recipe_id = typeof recipeId === 'string' ? recipeId : null;
    }
       if (photoStoragePaths !== undefined) {
      const parsed = mealPhotoPathsFromBody(photoStoragePaths, req.user!.id);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.message });
        return;
      }
      updatePayload.photo_storage_paths = parsed.paths;
    }
    if (wantUnlinkFavorite) {
      updatePayload.favorite_id = null;
    }

    if (Object.keys(updatePayload).length === 0) {
      res.status(400).json({
        error:
          'Request body must include at least one of: loggedAt, plannedFor, name, description, totalNutrition, ingredients, mealType, recipeId, photoStoragePaths, unlinkFavorite',
      });
      return;
    }

    // When meal content changes, set status to analyzing so UI shows re-analysis; async job will run after update
    const contentChanged = name !== undefined || description !== undefined || ingredients !== undefined;
    const shouldRunAnalysis = contentChanged && skipAnalysis !== true;
    // syncFavoriteTemplate only runs after async analysis; if analysis is skipped, template sync is ignored.
    const runSyncFavoriteTemplate = shouldRunAnalysis && wantSyncFavoriteTemplate;
    if (shouldRunAnalysis) {
      updatePayload.analysis_status = 'analyzing';
    }

    // Re-run icon selection when name or description changes (unless client skips for lightweight edits)
    if (
      (name !== undefined || description !== undefined) &&
      skipIconSelection !== true
    ) {
      try {
        const displayName = name ?? (existingLog as { name?: string }).name ?? '';
        const displayDesc = description ?? (existingLog as { description?: string }).description ?? '';
        updatePayload.icon = await iconSelectionService.selectIcon(displayName, displayDesc, {
          userId: req.user!.id,
          route: 'logs/patch',
        });
      } catch (iconError) {
        console.error('[PATCH logs/:id] Icon selection failed, keeping existing icon:', iconError);
      }
    }

    const { data: updatedLog, error: updateError } = await supabaseAdmin
      .from('meal_logs')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', req.user!.id)
      .select()
      .single();

    if (updateError) {
      console.error('Database error:', updateError);
      throw updateError;
    }

    // When meal content changed, re-run nutrition analysis (async job also sets status to 'analyzing' on start)
    if (shouldRunAnalysis && updatedLog) {
      const desc = (description ?? (updatedLog as { description?: string }).description) || '';
      const summary: MealSummary = {
        name: (name ?? (updatedLog as { name?: string }).name) || '',
        description: desc,
        questionSummary: '',
        ingredients: ((ingredients ?? (updatedLog as { ingredients?: unknown[] }).ingredients) || []).map((ing: any) => ({
          name: ing.name,
          servingAmount: ing.servingAmount,
          servingUnit: ing.servingUnit,
          servingSizeGrams: ing.servingSizeGrams ?? 0,
          provenance: ing.provenance ?? { source: 'llm_estimate' as const, confidence: 'medium' as const },
        })),
        questions: [],
        assumptions: [],
      };
      setImmediate(() => {
        processNutritionAnalysisAsync(id, req.user!.id, desc, summary, summary, {
          syncFavoriteTemplate: runSyncFavoriteTemplate,
        }).catch(err => {
          console.error('[PATCH logs/:id] Failed to start async nutrition analysis:', err);
        });
      });
    }

    posthog.capture({
      distinctId: req.user!.id,
      event: 'meal log updated',
      properties: {
        meal_log_id: id,
        fields_updated: Object.keys(updatePayload),
      },
    });

    res.json({
      message: 'Meal log updated successfully',
      data: updatedLog
    });
  } catch (error) {
    console.error('Error updating meal log:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    posthog.captureException(error, req.user?.id);
    res.status(500).json({
      error: 'Failed to update meal log',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete a meal log
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({ 
        error: 'Missing meal log ID' 
      });
      return;
    }

    // First, verify the log belongs to the authenticated user
    const { data: existingLog, error: fetchError } = await supabaseAdmin
      .from('meal_logs')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        res.status(404).json({ 
          error: 'Meal log not found' 
        });
        return;
      }
      throw fetchError;
    }

    if (existingLog.user_id !== req.user!.id) {
      res.status(403).json({ 
        error: 'Unauthorized to delete this meal log' 
      });
      return;
    }

    // Delete the meal log
    const { error: deleteError } = await supabaseAdmin
      .from('meal_logs')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user!.id); // Double-check user ownership

    if (deleteError) {
      console.error('Database error:', deleteError);
      throw deleteError;
    }

    posthog.capture({
      distinctId: req.user!.id,
      event: 'meal log deleted',
      properties: {
        meal_log_id: id,
      },
    });

    res.json({
      message: 'Meal log deleted successfully',
      id: id
    });
  } catch (error) {
    console.error('Error deleting meal log:', error);
    posthog.captureException(error, req.user?.id);
    res.status(500).json({
      error: 'Failed to delete meal log',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 