import OpenAI from 'openai';
import { PromptTemplate } from '@langchain/core/prompts';
import {
  createTrackedOpenAIResponse,
  newLlmRequestGroupId,
  type LlmOwnerContext,
} from '../ai/openaiResponses';
import type { ResponseFormatTextJSONSchemaConfig } from 'openai/resources/responses/responses';
import {
  extractFirstJson,
  extractResponsesOutputText,
  getRefusalFromResponse,
  zodResponsesTextFormat,
} from '../ai/structuredOutput';
import { UserProfile } from '../types/userProfile';
import {
  PlannerMealSlot,
  PlannerReplaceResponse,
  PlannerReplaceResponseSchema,
  PlannerSuggestionsResponse,
  PlannerSuggestionsResponseSchema,
  PlannerWeekDay,
  PlannerWeekMeal,
  PlannerWeekResponse,
  PlannerWeekResponseSchema,
} from '../types/planner';
import { prompts, type PromptKey } from '../prompts';
import { StoredRecipe } from '../types/recipe';
import { RecipeSearchMatch, RecipeSourceService } from './recipeSourceService';

type PlannerSuggestionArgs = {
  prompt: string;
  profile: UserProfile | null;
  mealType?: PlannerMealSlot;
  date?: string;
  userId: string;
};

type PlannerWeekArgs = {
  prompt: string;
  profile: UserProfile | null;
  startDate?: string;
  maxDays: number;
  userId: string;
};

type PlannerReplaceArgs = {
  prompt: string;
  profile: UserProfile | null;
  targetDate: string;
  targetSlot: PlannerMealSlot;
  currentMeal: PlannerWeekMeal;
  currentPlan?: PlannerWeekDay[];
  userId: string;
};

export class MealPlanningService {
  private client: OpenAI;
  private suggestionsPromptTemplate: PromptTemplate;
  private weekPromptTemplate: PromptTemplate;
  private replacePromptTemplate: PromptTemplate;
  private recipeSourceService: RecipeSourceService;
  private modelName: string;
  private debugLogsEnabled: boolean;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables');
    }

    this.modelName = process.env.OPENAI_PLANNER_MODEL_NAME || process.env.OPENAI_SUMMARY_MODEL_NAME || 'gpt-5-mini';
    this.debugLogsEnabled = (process.env.OPENAI_DEBUG_LOGS || '').toLowerCase() === 'true';
    this.client = new OpenAI({ apiKey });
    this.recipeSourceService = new RecipeSourceService();

    this.suggestionsPromptTemplate = PromptTemplate.fromTemplate(prompts.mealPlannerSuggestions);
    this.weekPromptTemplate = PromptTemplate.fromTemplate(prompts.mealPlannerWeek);
    this.replacePromptTemplate = PromptTemplate.fromTemplate(prompts.mealPlannerReplace);
  }

  async suggestMeals(args: PlannerSuggestionArgs): Promise<PlannerSuggestionsResponse> {
    const recipeMatches = await this.recipeSourceService.searchRecipeMatches({
      prompt: args.prompt,
      mealType: args.mealType,
      maxResults: 8,
      userId: args.userId,
    });
    const recipeCandidates = recipeMatches.map((match) => match.recipe);
    this.logPlannerRecipeSummary('suggestions:candidates', recipeCandidates, {
      prompt: args.prompt,
      mealType: args.mealType || null,
    });

    const response = this.buildGroundedSuggestionsResponse(args, recipeMatches);
    this.logPlannerResponseHydration('suggestions:grounded', response.options);
    return PlannerSuggestionsResponseSchema.parse(response);
  }

  async planWeek(args: PlannerWeekArgs): Promise<PlannerWeekResponse> {
    const recipeCandidates = await this.recipeSourceService.searchRecipes({
      prompt: `${args.prompt} breakfast lunch dinner`,
      maxResults: 18,
      userId: args.userId,
    });
    this.logPlannerRecipeSummary('week:candidates', recipeCandidates, {
      prompt: args.prompt,
      startDate: args.startDate || null,
      maxDays: args.maxDays,
    });
    const prompt = await this.weekPromptTemplate.format({
      userPrompt: args.prompt,
      profileContext: this.buildProfileContext(args.profile),
      plannerContext: this.buildWeekPlannerContext(args.startDate, args.maxDays),
      recipeContext: this.buildRecipeContext(recipeCandidates),
    });

    const text = await this.generateResponseText(prompt, {
      userId: args.userId,
      route: 'planner/week',
      promptKey: 'mealPlannerWeek',
      structuredFormat: zodResponsesTextFormat(PlannerWeekResponseSchema, 'planner_week', { strict: false }),
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse((text || '').trim());
    } catch {
      const jsonContent = extractFirstJson(text);
      if (!jsonContent) {
        throw new Error('Failed to extract planner week JSON from the response');
      }
      parsed = JSON.parse(jsonContent);
    }
    const normalized = this.normalizeWeekResponse(parsed, args.profile, args.startDate, args.maxDays);
    const validated = PlannerWeekResponseSchema.parse(normalized);
    const days = validated.days.map((day) => ({
      ...day,
      label: this.stripUrls(day.label),
      meals: day.meals.map((meal) =>
        this.hydratePlannerRecipeFields(
          {
            ...meal,
            name: this.stripUrls(meal.name),
            description: this.stripUrls(meal.description),
            whyItFits: this.stripUrls(meal.whyItFits),
          },
          recipeCandidates
        )
      ),
    }));
    this.logPlannerResponseHydration(
      'week:hydrated',
      days.flatMap((day) => day.meals)
    );

    return {
      ...validated,
      personalizationNote: this.stripUrls(validated.personalizationNote),
      days,
    };
  }

  async replaceWeekMeal(args: PlannerReplaceArgs): Promise<PlannerReplaceResponse> {
    const recipeCandidates = await this.recipeSourceService.searchRecipes({
      prompt: `${args.prompt} ${args.targetSlot} ${args.currentMeal.name}`,
      mealType: args.targetSlot,
      maxResults: 8,
      userId: args.userId,
    });
    this.logPlannerRecipeSummary('replace:candidates', recipeCandidates, {
      prompt: args.prompt,
      targetDate: args.targetDate,
      targetSlot: args.targetSlot,
      currentMeal: args.currentMeal.name,
    });
    const prompt = await this.replacePromptTemplate.format({
      userPrompt: args.prompt,
      profileContext: this.buildProfileContext(args.profile),
      plannerContext: this.buildReplacePlannerContext(args.targetDate, args.targetSlot),
      currentMealContext: JSON.stringify(args.currentMeal, null, 2),
      currentPlanContext: this.buildCurrentPlanSummary(args.currentPlan, args.targetDate, args.targetSlot),
      recipeContext: this.buildRecipeContext(recipeCandidates),
    });

    const text = await this.generateResponseText(prompt, {
      userId: args.userId,
      route: 'planner/replace',
      promptKey: 'mealPlannerReplace',
      structuredFormat: zodResponsesTextFormat(PlannerReplaceResponseSchema, 'planner_replace', { strict: false }),
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse((text || '').trim());
    } catch {
      const jsonContent = extractFirstJson(text);
      if (!jsonContent) {
        throw new Error('Failed to extract planner replacement JSON from the response');
      }
      parsed = JSON.parse(jsonContent);
    }
    const normalized = this.normalizeReplaceResponse(parsed, args);
    const validated = PlannerReplaceResponseSchema.parse(normalized);
    const replacement = this.hydratePlannerRecipeFields(
      {
        ...validated.replacement,
        name: this.stripUrls(validated.replacement.name),
        description: this.stripUrls(validated.replacement.description),
        whyItFits: this.stripUrls(validated.replacement.whyItFits),
      },
      recipeCandidates
    );
    this.logPlannerResponseHydration('replace:hydrated', [replacement]);

    return {
      ...validated,
      note: this.stripUrls(validated.note),
      replacement,
    };
  }

  private buildProfileContext(profile: UserProfile | null): string {
    if (!profile) {
      return 'No user profile was found. Suggestions should stay generic and explain that personalization is limited.';
    }

    const lines = [
      `display_name: ${profile.display_name || 'unknown'}`,
      `primary_goal: ${profile.primary_goal || 'unknown'}`,
      `daily_calorie_goal: ${profile.daily_calorie_goal ?? 'unknown'}`,
      `daily_protein_goal: ${profile.daily_protein_goal ?? 'unknown'}`,
      `daily_carb_goal: ${profile.daily_carb_goal ?? 'unknown'}`,
      `daily_fat_goal: ${profile.daily_fat_goal ?? 'unknown'}`,
      `activity_level: ${profile.activity_level || 'unknown'}`,
      `timezone: ${profile.timezone || 'unknown'}`,
    ];

    const missingFields = this.getMissingProfileFields(profile);

    if (missingFields.length > 0) {
      lines.push(`missing_fields: ${missingFields.join(', ')}`);
      lines.push('If important fields are missing, set canPersonalize to false and explain the limitation briefly.');
    }

    return lines.join('\n');
  }

  private buildSingleMealPlannerContext(mealType?: PlannerMealSlot, date?: string): string {
    const lines = [
      `requested_meal_type: ${mealType || 'unspecified'}`,
      `requested_date: ${date || 'unspecified'}`,
      'Return practical options for a single upcoming meal.',
    ];

    return lines.join('\n');
  }

  private buildWeekPlannerContext(startDate?: string, maxDays?: number): string {
    const lines = [
      `requested_start_date: ${startDate || 'unspecified'}`,
      `max_days: ${maxDays ?? 7}`,
      'Return a structured weekly plan with 1 to 7 days maximum.',
    ];

    return lines.join('\n');
  }

  private buildReplacePlannerContext(targetDate: string, targetSlot: PlannerMealSlot): string {
    return [
      `target_date: ${targetDate}`,
      `target_slot: ${targetSlot}`,
      'Return a replacement for exactly one planned weekly meal slot.',
    ].join('\n');
  }

  private buildCurrentPlanSummary(
    currentPlan: PlannerWeekDay[] | undefined,
    targetDate: string,
    targetSlot: PlannerMealSlot
  ): string {
    if (!currentPlan?.length) {
      return 'No current plan summary was provided.';
    }

    return currentPlan
      .map((day) => {
        const prefix = day.date === targetDate ? '[target day]' : '[other day]';
        const meals = day.meals
          .map((meal) => {
            const marker = day.date === targetDate && meal.slot === targetSlot ? ' (replace this)' : '';
            return `${meal.slot}: ${meal.name}${marker}`;
          })
          .join('; ');
        return `${prefix} ${day.date} ${day.label}: ${meals}`;
      })
      .join('\n');
  }

  private buildRecipeContext(recipes: StoredRecipe[]): string {
    if (!recipes.length) {
      return [
        'No recipe candidates were retrieved from designated sources.',
        'You may still return practical planner output, but omit the recipe field when no real source is available.',
      ].join('\n');
    }

    return [
      'Recipe candidates from designated web sources:',
      JSON.stringify(
        recipes.map((recipe) => ({
          recipeId: recipe.id,
          title: recipe.title,
          sourceKey: recipe.sourceKey,
          sourceName: recipe.sourceName,
          slug: recipe.slug,
          summary: recipe.summary,
          prepTimeMinutes: recipe.prepTimeMinutes,
          totalTimeMinutes: recipe.totalTimeMinutes,
          nutrition: recipe.nutrition,
          yieldText: recipe.yieldText,
          tags: recipe.tags,
        })),
        null,
        2
      ),
      'If recipe candidates are present, prefer those recipes and include a recipe object with the matching recipeId and source metadata for each meal you return.',
    ].join('\n');
  }

  private buildGroundedSuggestionsResponse(
    args: PlannerSuggestionArgs,
    matches: RecipeSearchMatch[]
  ): PlannerSuggestionsResponse {
    const missingProfileFields = this.getMissingProfileFields(args.profile);
    const viableMatches = matches.filter((match) => match.quality !== 'weak');

    if (!viableMatches.length) {
      return {
        personalizationNote: this.buildNoRecipeMatchMessage(args),
        canPersonalize: missingProfileFields.length === 0,
        missingProfileFields,
        options: [],
      };
    }

    const options = viableMatches
      .slice(0, 4)
      .map((match) => this.buildSuggestionOptionFromMatch(match, args));

    return {
      personalizationNote: this.buildGroundedSuggestionIntro(args, options.length, missingProfileFields.length > 0),
      canPersonalize: missingProfileFields.length === 0,
      missingProfileFields,
      options,
    };
  }

  private buildSuggestionOptionFromMatch(
    match: RecipeSearchMatch,
    args: PlannerSuggestionArgs
  ): PlannerSuggestionsResponse['options'][number] {
    const recipe = match.recipe;
    const totalTime = recipe.totalTimeMinutes ?? recipe.prepTimeMinutes ?? undefined;
    const mealType = args.mealType || recipe.mealTypes[0] || undefined;
    const description = this.buildSuggestionDescription(recipe);
    const whyItFits = this.buildSuggestionWhyItFits(match, args);

    return {
      name: recipe.title,
      description,
      whyItFits,
      mealType,
      prepTimeMinutes: totalTime,
      nutrition: {
        calories: recipe.nutrition?.calories ?? 0,
        protein: recipe.nutrition?.protein ?? 0,
        carbohydrates: recipe.nutrition?.carbohydrates ?? 0,
        fat: recipe.nutrition?.fat ?? 0,
      },
      recipe: {
        recipeId: recipe.id,
        sourceKey: recipe.sourceKey,
        sourceName: recipe.sourceName,
        slug: recipe.slug,
        imageUrl: recipe.imageUrl ?? undefined,
        yieldText: recipe.yieldText ?? undefined,
        totalTimeMinutes: recipe.totalTimeMinutes ?? recipe.prepTimeMinutes ?? undefined,
      },
    };
  }

  private buildSuggestionDescription(recipe: StoredRecipe): string {
    if (recipe.summary && recipe.summary.trim()) {
      return recipe.summary.trim();
    }

    const ingredientPreview = recipe.ingredients
      .slice(0, 3)
      .map((ingredient) => ingredient.name || ingredient.text)
      .filter(Boolean)
      .join(', ');

    if (ingredientPreview) {
      return `Built around ${ingredientPreview}.`;
    }

    return 'A curated recipe from your current Nomlog catalog.';
  }

  private buildSuggestionWhyItFits(
    match: RecipeSearchMatch,
    args: PlannerSuggestionArgs
  ): string {
    const recipe = match.recipe;
    const parts: string[] = [];
    const normalizedPrompt = args.prompt.toLowerCase();
    const protein = recipe.nutrition?.protein;
    const carbs = recipe.nutrition?.carbohydrates;
    const fat = recipe.nutrition?.fat;
    const calories = recipe.nutrition?.calories;
    const totalTime = recipe.totalTimeMinutes ?? recipe.prepTimeMinutes;

    if (match.matchedTerms.length > 0) {
      parts.push(`it matches ${match.matchedTerms.slice(0, 2).join(', ')}`);
    }

    if (
      /\bhigh(?:\s+in)?[\s-]?protein\b/.test(normalizedPrompt) &&
      typeof protein === 'number' &&
      protein > 0
    ) {
      parts.push(`it delivers about ${Math.round(protein)}g of protein`);
    }

    const maxCarbs = this.extractMaxCarbsFromPrompt(args.prompt);
    const wantsLowCarb = /\blow[\s-]?carb\b/.test(normalizedPrompt);
    if (typeof carbs === 'number' && (wantsLowCarb || typeof maxCarbs === 'number')) {
      if (typeof maxCarbs === 'number' && carbs <= maxCarbs) {
        parts.push(`it keeps carbs under about ${maxCarbs}g`);
      } else if (wantsLowCarb) {
        parts.push(`it has relatively low carbs`);
      }
    }

    const maxFat = this.extractMaxFatFromPrompt(args.prompt);
    const wantsLowFat = /\blow[\s-]?fat\b/.test(normalizedPrompt);
    if (typeof fat === 'number' && (wantsLowFat || typeof maxFat === 'number')) {
      if (typeof maxFat === 'number' && fat <= maxFat) {
        parts.push(`it keeps fat under about ${maxFat}g`);
      } else if (wantsLowFat) {
        parts.push(`it has relatively low fat`);
      }
    }

    const maxCalories = this.extractMaxCaloriesFromPrompt(args.prompt);
    const wantsLowCalories = /\blow[\s-]?calorie/.test(normalizedPrompt);
    if (typeof calories === 'number' && (wantsLowCalories || typeof maxCalories === 'number')) {
      if (typeof maxCalories === 'number' && calories <= maxCalories) {
        parts.push(`it stays within about ${maxCalories} calories`);
      } else if (wantsLowCalories) {
        parts.push(`it has relatively lower calories`);
      }
    }

    if (/\bketo\b|\bketogenic\b/.test(normalizedPrompt) && typeof carbs === 'number' && typeof fat === 'number') {
      if (carbs <= 50 && fat >= 20) {
        parts.push('it matches keto-ish macros (lower carbs, higher fat)');
      } else {
        parts.push('it fits a keto-ish direction (macro-friendly)');
      }
    }
    const maxMinutes = this.extractMaxMinutesFromPrompt(args.prompt);
    if (typeof maxMinutes === 'number' && typeof totalTime === 'number' && totalTime <= maxMinutes) {
      parts.push(`it stays within about ${maxMinutes} minutes`);
    } else if (typeof totalTime === 'number') {
      parts.push(`it comes together in about ${totalTime} minutes`);
    }

    if (args.mealType) {
      parts.push(`it works well for ${args.mealType}`);
    }

    if (parts.length === 0) {
      parts.push('it is one of the closest matches currently in your recipe catalog');
    }

    const sentence = parts.join(', ');
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
  }

  private buildGroundedSuggestionIntro(
    args: PlannerSuggestionArgs,
    optionCount: number,
    hasMissingProfileFields: boolean
  ): string {
    const mealTypeText = args.mealType || 'meal';
    const personalizationSuffix = hasMissingProfileFields
      ? ' Personalization is still a bit limited until your nutrition targets are fully set.'
      : '';

    return `I found ${optionCount} curated ${mealTypeText} ${optionCount === 1 ? 'recipe' : 'recipes'} from your current catalog.${personalizationSuffix}`;
  }

  private buildNoRecipeMatchMessage(args: PlannerSuggestionArgs): string {
    const mealTypeText = args.mealType ? ` for ${args.mealType}` : '';
    return `I don't have a close recipe match${mealTypeText} in your curated catalog yet, but I'm always expanding it.`;
  }

  private extractMaxMinutesFromPrompt(prompt: string): number | undefined {
    const normalized = prompt.toLowerCase();
    const match =
      normalized.match(/\bunder\s+(\d+)\s*(?:minutes?|mins?)\b/) ||
      normalized.match(/\bin\s+(\d+)\s*(?:minutes?|mins?)\b/) ||
      normalized.match(/\b(\d+)\s*(?:minutes?|mins?)\s+or\s+less\b/);

    return match ? Number(match[1]) : undefined;
  }

  private extractMaxCarbsFromPrompt(prompt: string): number | undefined {
    const normalized = prompt.toLowerCase();
    const match =
      normalized.match(/\b(?:under|<=|less than)\s*(\d+)\s*(?:g|grams?)?\s*carb(?:s)?\b/) ||
      normalized.match(/\bcarb(?:s)?\s*(?:under|<=|less than)\s*(\d+)\s*(?:g|grams?)?\b/) ||
      normalized.match(/\b(\d+)\s*(?:g|grams?)?\s*carb(?:s)?\s*(?:or\s*less)\b/);

    return match ? Number(match[1]) : undefined;
  }

  private extractMaxFatFromPrompt(prompt: string): number | undefined {
    const normalized = prompt.toLowerCase();
    const match =
      normalized.match(/\b(?:under|<=|less than)\s*(\d+)\s*(?:g|grams?)?\s*fat\b/) ||
      normalized.match(/\bfat\s*(?:under|<=|less than)\s*(\d+)\s*(?:g|grams?)?\b/) ||
      normalized.match(/\b(\d+)\s*(?:g|grams?)?\s*fat\s*(?:or\s*less)\b/);

    return match ? Number(match[1]) : undefined;
  }

  private extractMaxCaloriesFromPrompt(prompt: string): number | undefined {
    const normalized = prompt.toLowerCase();
    const match =
      normalized.match(/\b(?:under|<=|less than)\s*(\d+)\s*(?:k?cal(?:ories)?|kcal)\b/) ||
      normalized.match(/\b(\d+)\s*(?:k?cal(?:ories)?|kcal)\s*(?:or\s*less)?\b/);

    return match ? Number(match[1]) : undefined;
  }

  private getMissingProfileFields(profile: UserProfile | null): string[] {
    if (!profile) {
      return [
        'daily calorie goal',
        'daily protein goal',
        'daily carb goal',
        'daily fat goal',
        'activity level',
        'primary goal',
      ];
    }

    const missingFields: string[] = [];
    if (profile.daily_calorie_goal == null) missingFields.push('daily calorie goal');
    if (profile.daily_protein_goal == null) missingFields.push('daily protein goal');
    if (profile.daily_carb_goal == null) missingFields.push('daily carb goal');
    if (profile.daily_fat_goal == null) missingFields.push('daily fat goal');
    if (profile.activity_level == null) missingFields.push('activity level');
    if (profile.primary_goal == null) missingFields.push('primary goal');
    return missingFields;
  }

  private hydratePlannerRecipeFields<T extends { name: string; prepTimeMinutes?: number | null; recipe?: {
    recipeId: string;
    sourceKey: string;
    sourceName: string;
    slug: string;
    imageUrl?: string | null;
    yieldText?: string | null;
    totalTimeMinutes?: number | null;
  } }>(item: T, candidates: StoredRecipe[]): T {
    const matchedRecipe =
      (item.recipe && candidates.find((candidate) => candidate.id === item.recipe?.recipeId)) ||
      this.matchRecipeByName(item.name, candidates);

    if (!matchedRecipe) {
      return {
        ...item,
        recipe: undefined,
      };
    }

    return {
      ...item,
      prepTimeMinutes:
        item.prepTimeMinutes ?? matchedRecipe.prepTimeMinutes ?? matchedRecipe.totalTimeMinutes ?? undefined,
      recipe: {
        recipeId: matchedRecipe.id,
        sourceKey: matchedRecipe.sourceKey,
        sourceName: matchedRecipe.sourceName,
        slug: matchedRecipe.slug,
        imageUrl: matchedRecipe.imageUrl ?? undefined,
        yieldText: matchedRecipe.yieldText ?? undefined,
        totalTimeMinutes: matchedRecipe.totalTimeMinutes ?? matchedRecipe.prepTimeMinutes ?? undefined,
      },
    };
  }

  private matchRecipeByName(name: string, candidates: StoredRecipe[]): StoredRecipe | null {
    const normalizedName = this.normalizeComparableText(name);
    if (!normalizedName) return null;

    for (const candidate of candidates) {
      const candidateName = this.normalizeComparableText(candidate.title);
      if (!candidateName) continue;
      if (candidateName === normalizedName) return candidate;
      if (candidateName.includes(normalizedName) || normalizedName.includes(candidateName)) return candidate;
    }

    return null;
  }

  private normalizeComparableText(value: string): string {
    return (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private logPlannerRecipeSummary(event: string, recipes: StoredRecipe[], context: Record<string, unknown>) {
    if (!this.debugLogsEnabled) return;
    console.log(`[mealPlanningService] ${event}`, {
      ...context,
      recipeCount: recipes.length,
      recipes: recipes.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        source: recipe.sourceName,
      })),
    });
  }

  private logPlannerResponseHydration(
    event: string,
    meals: Array<{ name: string; recipe?: { recipeId: string; sourceName: string } }>
  ) {
    if (!this.debugLogsEnabled) return;
    console.log(`[mealPlanningService] ${event}`, {
      mealCount: meals.length,
      sourceBackedMealCount: meals.filter((meal) => !!meal.recipe?.recipeId).length,
      meals: meals.map((meal) => ({
        name: meal.name,
        recipeId: meal.recipe?.recipeId || null,
        sourceName: meal.recipe?.sourceName || null,
      })),
    });
  }

  private normalizeWeekResponse(
    raw: unknown,
    profile: UserProfile | null,
    startDate?: string,
    maxDays: number = 7
  ): unknown {
    const missingProfileFields = this.getMissingProfileFields(profile);
    const fallbackEnvelope = {
      personalizationNote:
        missingProfileFields.length > 0
          ? 'Here is a simple weekly plan. Personalization is limited until your nutrition targets are fully set.'
          : 'Here is a weekly meal plan shaped around your current nutrition goals.',
      canPersonalize: missingProfileFields.length === 0,
      missingProfileFields,
    };

    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        return {
          ...fallbackEnvelope,
          days: this.buildFallbackWeekDays(startDate, maxDays),
        };
      }
      return {
        ...fallbackEnvelope,
        days: raw,
      };
    }

    if (raw && typeof raw === 'object') {
      const candidate = raw as Record<string, unknown>;
      const days = candidate.days;
      if (Array.isArray(days) && days.length > 0) {
        return {
          ...fallbackEnvelope,
          ...candidate,
          days,
        };
      }

      if (Array.isArray(candidate.plan) && candidate.plan.length > 0) {
        return {
          ...fallbackEnvelope,
          ...candidate,
          days: candidate.plan,
        };
      }

      return {
        ...fallbackEnvelope,
        ...candidate,
        days: this.buildFallbackWeekDays(startDate, maxDays),
      };
    }

    return {
      ...fallbackEnvelope,
      days: this.buildFallbackWeekDays(startDate, maxDays),
    };
  }

  private normalizeReplaceResponse(raw: unknown, args: PlannerReplaceArgs): unknown {
    const fallbackReplacement = {
      ...args.currentMeal,
      slot: args.targetSlot,
      mealType: args.targetSlot,
      name: `${args.currentMeal.name} variation`,
      whyItFits: 'This keeps the same meal slot covered while giving you a different option.',
    };

    if (raw && typeof raw === 'object') {
      const candidate = raw as Record<string, unknown>;
      const replacement =
        candidate.replacement && typeof candidate.replacement === 'object'
          ? {
              ...fallbackReplacement,
              ...(candidate.replacement as Record<string, unknown>),
              slot: args.targetSlot,
              mealType: args.targetSlot,
            }
          : fallbackReplacement;

      return {
        note:
          typeof candidate.note === 'string' && candidate.note.trim().length > 0
            ? candidate.note
            : 'Here is another option for that slot.',
        targetDate: args.targetDate,
        targetSlot: args.targetSlot,
        replacement,
      };
    }

    return {
      note: 'Here is another option for that slot.',
      targetDate: args.targetDate,
      targetSlot: args.targetSlot,
      replacement: fallbackReplacement,
    };
  }

  private buildFallbackWeekDays(startDate?: string, maxDays: number = 7): Array<{
    date: string;
    label: string;
    meals: Array<{
      slot: PlannerMealSlot;
      name: string;
      description: string;
      whyItFits: string;
      mealType: PlannerMealSlot;
      prepTimeMinutes: number;
      nutrition: {
        calories: number;
        protein: number;
        carbohydrates: number;
        fat: number;
      };
    }>;
  }> {
    const baseDate = startDate ? new Date(startDate) : new Date();
    const dayLabels = ['Today', 'Tomorrow'];
    const fallbackMeals: Array<{
      slot: PlannerMealSlot;
      name: string;
      description: string;
      whyItFits: string;
      mealType: PlannerMealSlot;
      prepTimeMinutes: number;
      nutrition: {
        calories: number;
        protein: number;
        carbohydrates: number;
        fat: number;
      };
    }> = [
      {
        slot: 'breakfast',
        mealType: 'breakfast',
        name: 'Greek yogurt protein bowl',
        description: 'Greek yogurt with berries, granola, and chia seeds.',
        whyItFits: 'High protein and quick to prepare.',
        prepTimeMinutes: 5,
        nutrition: { calories: 420, protein: 32, carbohydrates: 38, fat: 14 },
      },
      {
        slot: 'lunch',
        mealType: 'lunch',
        name: 'Chicken rice bowl',
        description: 'Grilled chicken, rice, roasted vegetables, and a light sauce.',
        whyItFits: 'Balanced, easy to portion, and good for meal prep.',
        prepTimeMinutes: 20,
        nutrition: { calories: 620, protein: 42, carbohydrates: 58, fat: 18 },
      },
      {
        slot: 'dinner',
        mealType: 'dinner',
        name: 'Salmon potatoes and broccoli',
        description: 'Baked salmon with roasted potatoes and steamed broccoli.',
        whyItFits: 'Protein-forward dinner with simple ingredients.',
        prepTimeMinutes: 30,
        nutrition: { calories: 680, protein: 44, carbohydrates: 46, fat: 26 },
      },
    ];

    return Array.from({ length: Math.max(1, Math.min(maxDays, 7)) }, (_, index) => {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + index);
      const dateKey = date.toISOString().slice(0, 10);

      return {
        date: dateKey,
        label: dayLabels[index] || date.toLocaleDateString('en-US', { weekday: 'long' }),
        meals: fallbackMeals,
      };
    });
  }

  private async generateResponseText(
    input: string,
    llm: LlmOwnerContext & { promptKey: PromptKey; structuredFormat: ResponseFormatTextJSONSchemaConfig }
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      model: this.modelName,
      input,
      max_output_tokens: 1200,
      reasoning: { effort: 'low' },
      text: { format: llm.structuredFormat },
    };

    const requestGroupId = newLlmRequestGroupId();

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await createTrackedOpenAIResponse(
          this.client,
          payload as OpenAI.Responses.ResponseCreateParams,
          {
            userId: llm.userId,
            route: llm.route,
            tag: 'openai_planner',
            promptKey: llm.promptKey,
            requestGroupId,
            attemptIndex: attempt,
          }
        );
        const refusal = getRefusalFromResponse(response);
        if (refusal) {
          throw new Error(`Meal planner refused: ${refusal}`);
        }
        const text = extractResponsesOutputText(response);

        if (this.debugLogsEnabled) {
          console.log('[mealPlanningService] raw response text:', JSON.stringify(text));
        }

        return text;
      } catch (error: any) {
        const status = error?.status || error?.response?.status;
        const message = (error?.message || error?.response?.data?.error?.message || '').toString();
        console.warn('[mealPlanningService] response error', { attempt: attempt + 1, status, message });

        if (status !== 400) throw error;

        if (/reasoning\.effort|Unsupported parameter: 'reasoning\.effort'/i.test(message) && (payload as any).reasoning) {
          delete (payload as any).reasoning;
          continue;
        }
        if (/Unsupported parameter: 'max_output_tokens'/i.test(message) && Object.prototype.hasOwnProperty.call(payload, 'max_output_tokens')) {
          delete (payload as any).max_output_tokens;
          continue;
        }
        if (/(Unsupported parameter: 'text'|text\.format)/i.test(message) && (payload as any).text) {
          delete (payload as any).text;
          continue;
        }

        throw error;
      }
    }

    throw new Error('Failed to generate planner response after removing unsupported parameters');
  }

  private stripUrls(text: string): string {
    const input = (text || '').toString();
    let out = input.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1');
    out = out.replace(/\bhttps?:\/\/[^\s)]+/gi, '');
    out = out.replace(/\bwww\.[^\s)]+/gi, '');
    out = out.replace(/\s{2,}/g, ' ').trim();
    out = out.replace(/[|\-–—,:;]+\s*$/g, '').trim();
    return out;
  }
}
