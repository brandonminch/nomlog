import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { MealPlanningService } from '../services/mealPlanningService';
import { MealChatIntentClassifier, type MealChatIntent } from '../services/mealChatIntentClassifier';
import {
  PlannerReplaceRequestSchema,
  PlannerSuggestionsRequestSchema,
  PlannerWeekRequestSchema,
  type PlannerSuggestionsResponse,
  type PlannerWeekResponse,
  type PlannerWeekDay,
  type PlannerWeekMeal,
} from '../types/planner';
import { UserProfile } from '../types/userProfile';
import { LlmQuotaExceededError, replyIfLlmQuotaExceeded } from '../ai/openaiResponses';

const router = Router();
const mealPlanningService = new MealPlanningService();
const mealChatIntentClassifier = new MealChatIntentClassifier();

const MEAL_CHAT_GUARDRAIL_PREFIX = '__MEAL_CHAT_GUARDRAIL__:';

function buildPlannerSuggestionsGuardrail(message: string): PlannerSuggestionsResponse {
  return {
    personalizationNote: `${MEAL_CHAT_GUARDRAIL_PREFIX}${message}`,
    canPersonalize: false,
    missingProfileFields: [],
    options: [],
  };
}

function buildPlannerWeekGuardrail(message: string): PlannerWeekResponse {
  const todayKey = new Date().toISOString().slice(0, 10);

  const placeholderMeal: PlannerWeekMeal = {
    slot: 'dinner',
    mealType: 'dinner',
    name: 'Meal planning unavailable',
    description: 'Switch to the correct chat mode to get meal planning help.',
    whyItFits: 'Guardrail response',
    prepTimeMinutes: 0,
    nutrition: {
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
    },
  };

  const placeholderDay: PlannerWeekDay = {
    date: todayKey,
    label: 'Today',
    meals: [placeholderMeal],
  };

  return {
    personalizationNote: `${MEAL_CHAT_GUARDRAIL_PREFIX}${message}`,
    canPersonalize: false,
    missingProfileFields: [],
    days: [placeholderDay],
  };
}

async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data: profile, error } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (profile as UserProfile | null) ?? null;
}

router.post('/suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const validation = PlannerSuggestionsRequestSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid planner suggestion request',
        details: validation.error.errors,
      });
      return;
    }

    const { prompt, mealType, date } = validation.data;

    // Recipe URL import is temporarily disabled.
    // Keep planner suggestions flow unchanged while we revisit importer reliability.

    // Meal-chat guardrails: keep the plan-mode chat strictly meal-planning focused.
    // Fail-open behavior: if classification fails, proceed with existing planner behavior.
    const cannedOffTopic =
      'I can only help with planning meals in this chat. Try asking me what you should eat and I\'ll take it from there :)';
    const cannedLogMismatch =
      'I can only help with planning meals in this chat. Switch to Log mode for help with meal logging.';

    let intent: MealChatIntent = 'plan';
    try {
      intent = await mealChatIntentClassifier.classify(
        {
          mealDescription: prompt,
        },
        { userId: req.user!.id, route: 'planner/suggestions' }
      );
    } catch (e) {
      if (e instanceof LlmQuotaExceededError) throw e;
      console.warn('[planner/suggestions] mealChatIntentClassifier failed; proceeding with existing flow', {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    if (intent === 'off_topic') {
      res.json({ suggestions: buildPlannerSuggestionsGuardrail(cannedOffTopic) });
      return;
    }

    if (intent === 'log') {
      res.json({ suggestions: buildPlannerSuggestionsGuardrail(cannedLogMismatch) });
      return;
    }

    const profile = await fetchUserProfile(req.user!.id);

    const suggestions = await mealPlanningService.suggestMeals({
      prompt,
      mealType,
      date,
      profile,
      userId: req.user!.id,
    });

    res.json({ suggestions });
  } catch (error) {
    console.error('Failed to generate planner suggestions:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({
      error: 'Failed to generate planner suggestions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/week', requireAuth, async (req: Request, res: Response) => {
  try {
    const validation = PlannerWeekRequestSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid planner week request',
        details: validation.error.errors,
      });
      return;
    }

    const { prompt, startDate, maxDays } = validation.data;

    // Meal-chat guardrails: keep the plan-mode chat strictly meal-planning focused.
    // Fail-open behavior: if classification fails, proceed with existing planner behavior.
    const cannedOffTopic =
      'I can only help with planning meals in this chat. Try asking me what you should eat and I\'ll take it from there :)';
    const cannedLogMismatch =
      'I can only help with planning meals in this chat. Switch to Log mode for help with meal logging.';

    let intent: MealChatIntent = 'plan';
    try {
      intent = await mealChatIntentClassifier.classify(
        {
          mealDescription: prompt,
        },
        { userId: req.user!.id, route: 'planner/week' }
      );
    } catch (e) {
      if (e instanceof LlmQuotaExceededError) throw e;
      console.warn('[planner/week] mealChatIntentClassifier failed; proceeding with existing flow', {
        message: e instanceof Error ? e.message : String(e),
      });
    }

    if (intent === 'off_topic') {
      res.json({ weekPlan: buildPlannerWeekGuardrail(cannedOffTopic) });
      return;
    }

    if (intent === 'log') {
      res.json({ weekPlan: buildPlannerWeekGuardrail(cannedLogMismatch) });
      return;
    }

    const profile = await fetchUserProfile(req.user!.id);

    const weekPlan = await mealPlanningService.planWeek({
      prompt,
      startDate,
      maxDays,
      profile,
      userId: req.user!.id,
    });

    res.json({ weekPlan });
  } catch (error) {
    console.error('Failed to generate planner week:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({
      error: 'Failed to generate planner week',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/replace', requireAuth, async (req: Request, res: Response) => {
  try {
    const validation = PlannerReplaceRequestSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid planner replacement request',
        details: validation.error.errors,
      });
      return;
    }

    const profile = await fetchUserProfile(req.user!.id);
    const replacement = await mealPlanningService.replaceWeekMeal({
      ...validation.data,
      profile,
      userId: req.user!.id,
    });

    res.json({ replacement });
  } catch (error) {
    console.error('Failed to generate planner replacement:', error);
    if (replyIfLlmQuotaExceeded(res, error)) return;
    res.status(500).json({
      error: 'Failed to generate planner replacement',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
