import { PlannerMealSlot } from '../types/planner';
import { StoredRecipe } from '../types/recipe';
import { RecipeRepository } from './recipeRepository';
import { RecipeQueryShaper, type RecipeQueryShapingResponse } from './recipeQueryShaper';

type RecipeSearchArgs = {
  prompt: string;
  mealType?: PlannerMealSlot;
  maxResults?: number;
  /** For LLM query shaping + usage quotas */
  userId?: string;
};

export type RecipeMatchQuality = 'strong' | 'medium' | 'weak';

export type RecipeSearchMatch = {
  recipe: StoredRecipe;
  score: number;
  quality: RecipeMatchQuality;
  matchedTerms: string[];
  unmetTerms: string[];
};

type ParsedRecipeQuery = {
  normalizedPrompt: string;
  mealType?: PlannerMealSlot;
  maxMinutes?: number;
  wantsHighProtein: boolean;
  wantsQuick: boolean;
  wantsLowCarb?: boolean;
  maxCarbs?: number;
  wantsHighCarb?: boolean;
  wantsLowFat?: boolean;
  maxFat?: number;
  wantsLowCalories?: boolean;
  maxCalories?: number;
  ketoLike?: boolean;
  searchTokens: string[];
  desiredTerms: string[];
};

type RecipeSearchProvider = {
  search(args: RecipeSearchArgs, parsedQuery: ParsedRecipeQuery): Promise<StoredRecipe[]>;
};

const DEFAULT_MAX_RESULTS = 8;
const DEBUG_RECIPE_LOGS_ENABLED = (process.env.RECIPE_DEBUG_LOGS || process.env.OPENAI_DEBUG_LOGS || '').toLowerCase() === 'true';

class InternalCatalogProvider implements RecipeSearchProvider {
  constructor(private repository: RecipeRepository) {}

  async search(_args: RecipeSearchArgs, parsedQuery: ParsedRecipeQuery): Promise<StoredRecipe[]> {
    return this.repository.searchInternalCatalog({
      mealType: parsedQuery.mealType,
      maxResults: 100,
    });
  }
}

export class RecipeSourceService {
  private repository: RecipeRepository;
  private providers: RecipeSearchProvider[];
  private recipeQueryShaper: RecipeQueryShaper;

  constructor(repository: RecipeRepository = new RecipeRepository()) {
    // DB-only: external discovery/providers are intentionally not used for now.
    this.repository = repository;
    this.providers = [new InternalCatalogProvider(this.repository)];
    this.recipeQueryShaper = new RecipeQueryShaper();
  }

  async searchRecipes(args: RecipeSearchArgs): Promise<StoredRecipe[]> {
    const matches = await this.searchRecipeMatches(args);
    return matches.filter((match) => match.quality !== 'weak').map((match) => match.recipe);
  }

  async searchRecipeMatches(args: RecipeSearchArgs): Promise<RecipeSearchMatch[]> {
    const baselineParsedQuery = parseRecipeQuery(args);
    const shapedQuery = await this.recipeQueryShaper.shapeRecipeQuery(args);
    const parsedQuery = mergeParsedRecipeQuery(baselineParsedQuery, shapedQuery);

    debugRecipeLog('search:start', {
      prompt: args.prompt,
      mealType: args.mealType || null,
      parsedMealType: parsedQuery.mealType || null,
      desiredTerms: parsedQuery.desiredTerms,
      searchTokens: parsedQuery.searchTokens,
      maxMinutes: parsedQuery.maxMinutes ?? null,
      wantsHighProtein: parsedQuery.wantsHighProtein,
      maxResults: args.maxResults ?? DEFAULT_MAX_RESULTS,
      providers: this.providers.length,
    });

    const deduped = new Map<string, StoredRecipe>();
    const providerSummaries: Array<Record<string, unknown>> = [];

    for (const [index, provider] of this.providers.entries()) {
      try {
        const recipes = await provider.search(args, parsedQuery);
        providerSummaries.push({
          providerIndex: index,
          status: 'fulfilled',
          recipeCount: recipes.length,
        });

        for (const recipe of recipes) {
          deduped.set(recipe.id, recipe);
        }

        if (deduped.size >= (args.maxResults ?? DEFAULT_MAX_RESULTS)) {
          break;
        }
      } catch (error) {
        providerSummaries.push({
          providerIndex: index,
          status: 'rejected',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const ranked = Array.from(deduped.values())
      .map((recipe) => buildRecipeSearchMatch(recipe, parsedQuery))
      .sort((left, right) => right.score - left.score)
      .slice(0, args.maxResults ?? DEFAULT_MAX_RESULTS);

    debugRecipeLog('search:complete', {
      prompt: args.prompt,
      mealType: args.mealType || null,
      providerSummaries,
      dedupedRecipeCount: deduped.size,
      returnedRecipeCount: ranked.length,
      returnedRecipes: ranked.map((match) => ({
        id: match.recipe.id,
        title: match.recipe.title,
        source: match.recipe.sourceName,
        quality: match.quality,
        score: match.score,
      })),
    });

    return ranked;
  }

  async getRecipeById(id: string): Promise<StoredRecipe | null> {
    return this.repository.getById(id);
  }

  extractMaxMinutesFromPrompt(prompt: string): number | undefined {
    return extractMaxMinutesFromText(prompt);
  }
}

function mergeParsedRecipeQuery(
  baseline: ParsedRecipeQuery,
  shaped: RecipeQueryShapingResponse | null
): ParsedRecipeQuery {
  if (!shaped) return baseline;

  const merged: ParsedRecipeQuery = {
    ...baseline,
  };

  if (shaped.mealType != null) merged.mealType = shaped.mealType as PlannerMealSlot;
  if (typeof shaped.wantsHighProtein === 'boolean') merged.wantsHighProtein = shaped.wantsHighProtein;
  if (typeof shaped.wantsQuick === 'boolean') merged.wantsQuick = shaped.wantsQuick;
  if (typeof shaped.maxMinutes === 'number') merged.maxMinutes = shaped.maxMinutes;

  // Prefer the shaper's intent entirely for keyword-ish matching.
  // This prevents rule-based tokenization from polluting `desiredTerms` for prompts like "easy to prepare".
  if (Array.isArray(shaped.desiredTerms)) {
    merged.desiredTerms = shaped.desiredTerms;
    merged.searchTokens = shaped.desiredTerms;
  }

  if (typeof shaped.wantsLowCarb === 'boolean') merged.wantsLowCarb = shaped.wantsLowCarb;
  if (typeof shaped.maxCarbs === 'number') merged.maxCarbs = shaped.maxCarbs;
  if (typeof shaped.wantsHighCarb === 'boolean') merged.wantsHighCarb = shaped.wantsHighCarb;

  if (typeof shaped.wantsLowFat === 'boolean') merged.wantsLowFat = shaped.wantsLowFat;
  if (typeof shaped.maxFat === 'number') merged.maxFat = shaped.maxFat;

  if (typeof shaped.wantsLowCalories === 'boolean') merged.wantsLowCalories = shaped.wantsLowCalories;
  if (typeof shaped.maxCalories === 'number') merged.maxCalories = shaped.maxCalories;

  if (typeof shaped.ketoLike === 'boolean') merged.ketoLike = shaped.ketoLike;

  return merged;
}

function debugRecipeLog(event: string, details: Record<string, unknown>) {
  if (!DEBUG_RECIPE_LOGS_ENABLED) return;
  console.log(`[recipeSourceService] ${event}`, details);
}

function parseRecipeQuery(args: RecipeSearchArgs): ParsedRecipeQuery {
  const normalizedPrompt = cleanText(args.prompt.toLowerCase());
  const mealType = args.mealType || extractMealTypeFromText(normalizedPrompt);
  const maxMinutes = extractMaxMinutesFromText(normalizedPrompt);
  const wantsHighProtein = /\bhigh(?:\s+in)?[\s-]?protein\b/.test(normalizedPrompt);
  const wantsQuick = /\bquick\b|\bfast\b|\beasy\b/.test(normalizedPrompt) || typeof maxMinutes === 'number';

  const wantsLowCarb = /\blow[\s-]?carb\b/.test(normalizedPrompt);
  const wantsHighCarb = /\bhigh[\s-]?carb\b/.test(normalizedPrompt);
  const maxCarbs = extractMaxCarbsFromText(normalizedPrompt);

  const wantsLowFat = /\blow[\s-]?fat\b/.test(normalizedPrompt);
  const maxFat = extractMaxFatFromText(normalizedPrompt);

  const wantsLowCalories = /\blow[\s-]?calorie/.test(normalizedPrompt);
  const maxCalories = extractMaxCaloriesFromText(normalizedPrompt);

  const ketoLike = /\bketo\b|\bketogenic\b/.test(normalizedPrompt);

  const searchTokens = extractSearchTokens(normalizedPrompt);
  const desiredTerms = extractDesiredTerms(normalizedPrompt, searchTokens);

  return {
    normalizedPrompt,
    mealType,
    maxMinutes,
    wantsHighProtein,
    wantsQuick,
    wantsLowCarb: wantsLowCarb || (typeof maxCarbs === 'number' ? true : undefined),
    maxCarbs,
    wantsHighCarb,
    wantsLowFat: wantsLowFat || (typeof maxFat === 'number' ? true : undefined),
    maxFat,
    wantsLowCalories: wantsLowCalories || (typeof maxCalories === 'number' ? true : undefined),
    maxCalories,
    ketoLike,
    searchTokens,
    desiredTerms,
  };
}

function buildRecipeSearchMatch(recipe: StoredRecipe, query: ParsedRecipeQuery): RecipeSearchMatch {
  const recipeTitle = normalizeSearchText(recipe.title);
  const recipeSummary = normalizeSearchText(recipe.summary || '');
  const recipeTags = normalizeSearchText(recipe.tags.join(' '));
  const recipeIngredients = normalizeSearchText(
    [...recipe.ingredientNames, ...recipe.ingredients.map((ingredient) => ingredient.name || ingredient.text)].join(' ')
  );
  const recipeMealTypes = normalizeSearchText(recipe.mealTypes.join(' '));
  const recipeCategories = normalizeSearchText(recipe.categories.join(' '));
  const recipeDietaryFlags = normalizeSearchText(recipe.dietaryFlags.join(' '));
  const searchableText = normalizeSearchText(
    [
      recipe.title,
      recipe.summary || '',
      recipe.tags.join(' '),
      recipe.mealTypes.join(' '),
      recipe.ingredientNames.join(' '),
      recipe.categories.join(' '),
      recipe.dietaryFlags.join(' '),
      recipe.cuisine || '',
      recipe.equipmentNeeded.join(' '),
    ].join(' ')
  );

  let score = 0;
  const matchedTerms: string[] = [];
  const unmetTerms: string[] = [];

  for (const term of query.desiredTerms) {
    if (matchesSearchTerm(recipeIngredients, term) || matchesSearchTerm(recipeTitle, term) || matchesSearchTerm(recipeTags, term)) {
      matchedTerms.push(term);
      score += term.includes(' ') ? 10 : 8;
      continue;
    }
    unmetTerms.push(term);
    score -= 7;
  }

  for (const token of query.searchTokens) {
    if (matchedTerms.includes(token)) continue;
    if (matchesSearchTerm(recipeTitle, token)) {
      score += 4;
      continue;
    }
    if (matchesSearchTerm(recipeIngredients, token) || matchesSearchTerm(recipeTags, token) || matchesSearchTerm(recipeMealTypes, token) || matchesSearchTerm(recipeCategories, token) || matchesSearchTerm(recipeDietaryFlags, token)) {
      score += 3;
      continue;
    }
    if (matchesSearchTerm(recipeSummary, token) || matchesSearchTerm(searchableText, token)) {
      score += 1;
    }
  }

  if (query.mealType) {
    if (recipe.mealTypes.length === 0 || recipe.mealTypes.includes(query.mealType)) score += 5;
    else score -= 6;
  }

  // Protein intent + soft baseline.
  if (query.wantsHighProtein) {
    const protein = recipe.nutrition?.protein;
    if (typeof protein === 'number') {
      score += Math.min(protein / 6, 8);
      if (protein >= 30) score += 2;
      else if (protein >= 20) score += 1;
      else score -= 4;
    }
  } else if (typeof recipe.nutrition?.protein === 'number') {
    score += Math.min(recipe.nutrition.protein / 15, 3);
  }

  // Macro/diet intent scoring: soft preferences.
  const carbs = recipe.nutrition?.carbohydrates;
  const fat = recipe.nutrition?.fat;
  const calories = recipe.nutrition?.calories;

  if (typeof carbs === 'number') {
    if (query.wantsLowCarb) {
      if (typeof query.maxCarbs === 'number') {
        if (carbs <= query.maxCarbs) score += 7;
        else if (carbs <= query.maxCarbs + 15) score -= 1;
        else score -= 6;
      } else {
        if (carbs <= 30) score += 6;
        else if (carbs <= 50) score += 3;
        else score -= 3;
      }
    }

    if (query.wantsHighCarb) {
      if (carbs >= 80) score += 5;
      else if (carbs >= 50) score += 2;
      else score -= 1;
    }
  }

  if (typeof fat === 'number') {
    if (query.wantsLowFat) {
      if (typeof query.maxFat === 'number') {
        if (fat <= query.maxFat) score += 6;
        else if (fat <= query.maxFat + 5) score -= 1;
        else score -= 5;
      } else {
        if (fat <= 15) score += 5;
        else if (fat <= 25) score += 2;
        else score -= 3;
      }
    }
  }

  if (typeof calories === 'number') {
    if (query.wantsLowCalories || typeof query.maxCalories === 'number') {
      const cap = typeof query.maxCalories === 'number' ? query.maxCalories : 500;
      if (calories <= cap) score += 6;
      else if (calories <= cap + 100) score -= 1;
      else score -= 5;
    }
  }

  if (query.ketoLike) {
    if (typeof carbs === 'number') {
      if (carbs <= 50) score += 3;
      else if (carbs <= 80) score += 1;
      else score -= 2;
    }
    if (typeof fat === 'number') {
      if (fat >= 20) score += 3;
      else if (fat >= 10) score += 1;
      else score -= 1;
    }

    if (matchesSearchTerm(recipeTags, 'keto')) score += 2;
    if (matchesSearchTerm(recipeTags, 'low carb')) score += 2;
  }

  // Time/quickness intent.
  const totalTime = recipe.totalTimeMinutes ?? recipe.prepTimeMinutes;
  if (typeof query.maxMinutes === 'number' && typeof totalTime === 'number') {
    if (totalTime <= query.maxMinutes) score += 6;
    else if (totalTime <= query.maxMinutes + 10) score -= 2;
    else score -= 8;
  } else if (query.wantsQuick && typeof totalTime === 'number') {
    if (totalTime <= 20) score += 4;
    else if (totalTime <= 30) score += 2;
  }

  const quality = determineMatchQuality({
    score,
    desiredTermCount: query.desiredTerms.length,
    matchedDesiredTermCount: matchedTerms.length,
    totalTimeMinutes: totalTime,
    maxMinutes: query.maxMinutes,
  });

  return {
    recipe,
    score,
    quality,
    matchedTerms,
    unmetTerms,
  };
}

function determineMatchQuality(args: {
  score: number;
  desiredTermCount: number;
  matchedDesiredTermCount: number;
  totalTimeMinutes?: number | null;
  maxMinutes?: number;
}): RecipeMatchQuality {
  if (args.desiredTermCount > 0 && args.matchedDesiredTermCount === 0) {
    // Desired terms mismatching is normally a weak signal, but for soft nutrition/time intents
    // we still want to return useful results if the overall score is strong.
    return args.score >= 10 ? 'medium' : 'weak';
  }

  if (
    typeof args.maxMinutes === 'number' &&
    typeof args.totalTimeMinutes === 'number' &&
    args.totalTimeMinutes > args.maxMinutes + 10
  ) {
    return 'weak';
  }

  if (args.score >= 14 && (args.desiredTermCount === 0 || args.matchedDesiredTermCount === args.desiredTermCount)) {
    return 'strong';
  }

  if (args.score >= 6 && (args.desiredTermCount === 0 || args.matchedDesiredTermCount > 0)) {
    return 'medium';
  }

  return 'weak';
}

function extractMaxMinutesFromText(text: string): number | undefined {
  const normalized = text.toLowerCase();
  const match =
    normalized.match(/\bunder\s+(\d+)\s*(?:minutes?|mins?)\b/) ||
    normalized.match(/\bin\s+(\d+)\s*(?:minutes?|mins?)\b/) ||
    normalized.match(/\b(\d+)\s*(?:minutes?|mins?)\s+or\s+less\b/);

  return match ? Number(match[1]) : undefined;
}

function extractDesiredTerms(text: string, searchTokens: string[]): string[] {
  const desiredTerms: string[] = [];
  const explicitMatches = text.matchAll(
    /\b(?:with|including|include|contains?|containing|made with|using|featuring)\s+([a-z][a-z\s-]{1,40}?)(?=\b(?:under|over|in|for|that|which|recipe|recipes|dinner|lunch|breakfast|snack|high protein|low carb|low fat|calorie|calories|keto|quick|fast|easy)\b|[,.]|$)/g
  );

  for (const match of explicitMatches) {
    const phrase = normalizeSearchText(match[1] || '');
    if (phrase && !desiredTerms.includes(phrase)) {
      desiredTerms.push(phrase);
    }
  }

  for (const token of searchTokens) {
    if (!desiredTerms.includes(token)) {
      desiredTerms.push(token);
    }
  }

  return desiredTerms;
}

function extractSearchTokens(text: string): string[] {
  return Array.from(tokenize(stripMealTypeWords(text))).filter((token) => !SEARCH_STOP_WORDS.has(token));
}

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      // Prevent numeric caps (e.g. "500") from becoming "desired terms" and causing weak matches.
      .filter((token) => !/^\d+$/.test(token))
  );
}

function normalizeSearchText(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesSearchTerm(searchableText: string, term: string): boolean {
  if (!searchableText || !term) return false;
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return false;
  return searchableText.includes(normalizedTerm);
}

const SEARCH_STOP_WORDS = new Set([
  'want',
  'wants',
  'something',
  'some',
  'give',
  'ideas',
  'idea',
  'recipe',
  'recipes',
  'meal',
  'meals',
  'tonight',
  'today',
  'please',
  'make',
  'made',
  'prepare',
  'preparing',
  'cook',
  'cooking',
  'good',
  'best',
  'food',
  'foods',
  'have',
  'having',
  'with',
  'using',
  'include',
  'including',
  'contains',
  'containing',
  'featuring',
  'need',
  'needs',
  'like',
  'would',
  'could',
  'maybe',
  'just',
  'under',
  'over',
  'into',
  'within',
  'minutes',
  'minute',
  'mins',
  'min',
  'high',
  'protein',
  'keto',
  'ketogenic',
  'low',
  'carb',
  'carbs',
  'fat',
  'calorie',
  'calories',
  'grams',
  'gram',
  'carbohydrate',
  'carbohydrates',
  'quick',
  'fast',
  'easy',
  'tonights',
]);

function extractMaxCarbsFromText(text: string): number | undefined {
  const normalized = text.toLowerCase();
  const match =
    normalized.match(/\b(?:under|<=|less than)\s*(\d+)\s*(?:g|grams?)?\s*carb(?:s)?\b/) ||
    normalized.match(/\bcarb(?:s)?\s*(?:under|<=|less than)\s*(\d+)\s*(?:g|grams?)?\b/) ||
    normalized.match(/\b(\d+)\s*(?:g|grams?)?\s*carb(?:s)?\s*(?:or\s*less)\b/);

  return match ? Number(match[1]) : undefined;
}

function extractMaxFatFromText(text: string): number | undefined {
  const normalized = text.toLowerCase();
  const match =
    normalized.match(/\b(?:under|<=|less than)\s*(\d+)\s*(?:g|grams?)?\s*fat\b/) ||
    normalized.match(/\bfat\s*(?:under|<=|less than)\s*(\d+)\s*(?:g|grams?)?\b/) ||
    normalized.match(/\b(\d+)\s*(?:g|grams?)?\s*fat\s*(?:or\s*less)\b/);

  return match ? Number(match[1]) : undefined;
}

function extractMaxCaloriesFromText(text: string): number | undefined {
  const normalized = text.toLowerCase();
  const match =
    normalized.match(/\b(?:under|<=|less than)\s*(\d+)\s*(?:k?calories?|kcal)\b/) ||
    normalized.match(/\b(\d+)\s*(?:k?calories?|kcal)\s*(?:or\s*less)?\b/);

  return match ? Number(match[1]) : undefined;
}

function cleanText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function extractMealTypeFromText(text: string): PlannerMealSlot | undefined {
  const normalized = text.trim().toLowerCase();
  if (/\bbreakfasts?\b|\bbrunch(?:es)?\b/.test(normalized)) return 'breakfast';
  if (/\blunch(?:es)?\b/.test(normalized)) return 'lunch';
  if (/\bdinners?\b|\bsuppers?\b/.test(normalized)) return 'dinner';
  if (/\bsnacks?\b/.test(normalized)) return 'snack';
  return undefined;
}

function stripMealTypeWords(text: string): string {
  return text
    .replace(/\bbreakfasts?\b/gi, ' ')
    .replace(/\bbrunch(?:es)?\b/gi, ' ')
    .replace(/\blunch(?:es)?\b/gi, ' ')
    .replace(/\bdinners?\b/gi, ' ')
    .replace(/\bsuppers?\b/gi, ' ')
    .replace(/\bsnacks?\b/gi, ' ');
}

export const recipeSourceServiceInternals = {
  extractMaxMinutesFromText,
  parseRecipeQuery,
  buildRecipeSearchMatch,
  extractDesiredTerms,
};

