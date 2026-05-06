import { prompts } from '../prompts';
import OpenAI from 'openai';
import { createTrackedOpenAIResponse, newLlmRequestGroupId } from '../ai/openaiResponses';
import {
  extractResponsesOutputText,
  getRefusalFromResponse,
  parseModelJsonWithSchema,
  zodResponsesTextFormat,
} from '../ai/structuredOutput';
import { LlmRecipeParseResultSchema, RecipeEnrichmentLlmSchema } from '../types/recipeLlm';
import { z } from 'zod';
import {
  AllergenSchema,
  DietaryFlagSchema,
  RecipeCategorySchema,
  RecipeCostTierSchema,
  RecipeDifficultySchema,
  RecipeEquipmentSchema,
  StoredRecipe,
} from '../types/recipe';
import { RecipeRepository } from './recipeRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedRecipeDocument = {
  title: string;
  summary?: string | null;
  imageUrl?: string | null;
  authorName?: string | null;
  yieldText?: string | null;
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  totalTimeMinutes?: number | null;
  ingredients: Array<{ text: string; name?: string; amount?: number; unit?: string }>;
  instructions: Array<{ text: string; position?: number }>;
  nutrition?: { calories?: number; protein?: number; carbohydrates?: number; fat?: number } | null;
  tags: string[];
  mealTypes: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'>;
  ingredientNames: string[];
};

/** Shape of a curated recipe JSON file (matches SeedRecipe from seedRecipes.ts). */
export const CuratedRecipeSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  yieldText: z.string().min(1),
  servings: z.number().positive(),
  servingUnit: z.string().min(1),
  prepTimeMinutes: z.number().int().nonnegative().optional(),
  cookTimeMinutes: z.number().int().nonnegative().optional(),
  totalTimeMinutes: z.number().int().nonnegative().optional(),
  mealTypes: z.array(z.enum(['breakfast', 'lunch', 'dinner', 'snack'])).min(1),
  tags: z.array(z.string().min(1)).min(1),
  searchAliases: z.array(z.string().min(1)).default([]),
  ingredients: z
    .array(
      z.object({
        text: z.string().min(1),
        name: z.string().optional(),
        amount: z.number().nonnegative().optional(),
        unit: z.string().optional(),
        amountInGrams: z.number().nonnegative().optional(),
        notes: z.string().optional(),
        pantryCategory: z.string().optional(),
        optional: z.boolean().optional(),
      })
    )
    .min(1),
  instructions: z
    .array(
      z.object({
        title: z.string().optional(),
        text: z.string().min(1),
        position: z.number().int().positive().optional(),
      })
    )
    .min(1),
  nutrition: z
    .object({
      calories: z.number().nonnegative().optional(),
      protein: z.number().nonnegative().optional(),
      carbohydrates: z.number().nonnegative().optional(),
      fat: z.number().nonnegative().optional(),
      fiber: z.number().nonnegative().optional(),
      sugar: z.number().nonnegative().optional(),
      sodium: z.number().nonnegative().optional(),
      saturatedFat: z.number().nonnegative().optional(),
      potassium: z.number().nonnegative().optional(),
      cholesterol: z.number().nonnegative().optional(),
      calcium: z.number().nonnegative().optional(),
      iron: z.number().nonnegative().optional(),
      vitaminA: z.number().nonnegative().optional(),
      vitaminC: z.number().nonnegative().optional(),
      vitaminD: z.number().nonnegative().optional(),
      magnesium: z.number().nonnegative().optional(),
    })
    .optional(),
  dietaryFlags: z.array(DietaryFlagSchema).default([]),
  allergens: z.array(AllergenSchema).default([]),
  cuisine: z.string().optional(),
  difficulty: RecipeDifficultySchema.optional(),
  categories: z.array(RecipeCategorySchema).default([]),
  estimatedCostTier: RecipeCostTierSchema.optional(),
  equipmentNeeded: z.array(RecipeEquipmentSchema).default([]),
  imageUrl: z.string().url().optional(),
  authorName: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});

export type CuratedRecipe = z.infer<typeof CuratedRecipeSchema>;


// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RecipeCurationService {
  private llmClient: OpenAI;
  private enrichmentPromptTemplate: string;
  private modelName: string;

  constructor(private recipeRepository: RecipeRepository = new RecipeRepository()) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is required');
    this.llmClient = new OpenAI({ apiKey });
    this.modelName = process.env.OPENAI_PLANNER_MODEL_NAME || process.env.OPENAI_SUMMARY_MODEL_NAME || 'gpt-5-mini';

    this.enrichmentPromptTemplate = prompts.recipeEnrichment;
  }

  // =========================================================================
  // Fetch & Parse
  // =========================================================================

  async fetchAndParse(url: string): Promise<ParsedRecipeDocument> {
    const canonicalUrl = normalizeUrl(url);

    // Strategy 1: Direct HTML fetch → JSON-LD parsing
    const directHtml = await fetchHtmlDirect(canonicalUrl);
    if (directHtml) {
      const jsonLdResult = parseJsonLd(directHtml, canonicalUrl);
      if (jsonLdResult) {
        validateParsedRecipe(jsonLdResult, canonicalUrl);
        return jsonLdResult;
      }
      // Direct HTML worked but no JSON-LD — try LLM on the HTML
      const llmResult = await this.parseWithLlm(directHtml, canonicalUrl, 'html', {
        userId: null,
        route: 'recipe/curation/fetch',
      });
      if (llmResult) {
        validateParsedRecipe(llmResult, canonicalUrl);
        return llmResult;
      }
    }

    // Strategy 2: Jina mirror requesting HTML — some sites only serve to headless browsers
    const jinaHtml = await fetchViaJina(canonicalUrl, 'html');
    if (jinaHtml) {
      const jsonLdResult = parseJsonLd(jinaHtml, canonicalUrl);
      if (jsonLdResult) {
        validateParsedRecipe(jsonLdResult, canonicalUrl);
        return jsonLdResult;
      }
    }

    // Strategy 3: Jina mirror returning markdown — always readable, use LLM to extract
    const jinaMarkdown = await fetchViaJina(canonicalUrl, 'markdown');
    if (jinaMarkdown) {
      const llmResult = await this.parseWithLlm(jinaMarkdown, canonicalUrl, 'markdown', {
        userId: null,
        route: 'recipe/curation/fetch',
      });
      if (llmResult) {
        validateParsedRecipe(llmResult, canonicalUrl);
        return llmResult;
      }
    }

    throw new Error(
      `Could not parse recipe from ${canonicalUrl} — all fetch strategies failed. ` +
      'The page may not contain a recipe, or the site blocks all automated access.'
    );
  }

  // =========================================================================
  // Enrich
  // =========================================================================

  async enrich(
    parsed: ParsedRecipeDocument,
    sourceUrl: string,
    llm?: { userId: string | null; route: string }
  ): Promise<CuratedRecipe> {
    const prompt = this.buildEnrichmentPrompt(parsed);

    const response = await createTrackedOpenAIResponse(
      this.llmClient,
      {
        model: this.modelName,
        input: prompt,
        max_output_tokens: 16000,
        text: { format: zodResponsesTextFormat(RecipeEnrichmentLlmSchema, 'recipe_enrichment', { strict: false }) },
      } as OpenAI.Responses.ResponseCreateParams,
      {
        userId: llm?.userId ?? null,
        route: llm?.route ?? 'recipe/curation/enrich',
        tag: 'recipe_curation_enrich',
        promptKey: 'recipeEnrichment',
        requestGroupId: newLlmRequestGroupId(),
        attemptIndex: 0,
      }
    );

    const text = extractResponsesOutputText(response);

    if (!text) {
      // Debug: log the full response shape to diagnose extraction issues
      const keys = Object.keys(response || {});
      const status = (response as any)?.status;
      const incompleteDetails = (response as any)?.incomplete_details;
      console.error('[enrich] Empty response text. Response keys:', keys.join(', '));
      console.error('[enrich] status:', status, 'incomplete_details:', JSON.stringify(incompleteDetails));
      if ((response as any)?.output) {
        console.error('[enrich] output type:', typeof (response as any).output, 'length:', Array.isArray((response as any).output) ? (response as any).output.length : 'n/a');
        console.error('[enrich] output[0]:', JSON.stringify((response as any).output?.[0])?.slice(0, 500));
      }
    }

    const refusal = getRefusalFromResponse(response);
    if (refusal) {
      throw new Error(`LLM enrichment refused: ${refusal}`);
    }
    if (!text.trim()) {
      throw new Error(`LLM enrichment returned no JSON (text length=${text.length}, status=${(response as any)?.status})`);
    }

    const enrichment = parseModelJsonWithSchema(text, RecipeEnrichmentLlmSchema);
    return this.mergeEnrichment(parsed, enrichment as Record<string, unknown>, sourceUrl);
  }

  // =========================================================================
  // Commit
  // =========================================================================

  async commitToDatabase(recipe: CuratedRecipe): Promise<StoredRecipe> {
    const ingredientNames = Array.from(
      new Set([
        ...recipe.ingredients.map((i) => (i.name || '').toLowerCase().trim()).filter(Boolean),
        ...recipe.searchAliases.map((a) => a.toLowerCase().trim()).filter(Boolean),
      ])
    );

    return this.recipeRepository.upsert({
      slug: recipe.slug,
      sourceKey: 'internal',
      sourceName: 'Nomlog',
      originalUrl: recipe.sourceUrl ?? null,
      title: recipe.title,
      summary: recipe.summary,
      imageUrl: recipe.imageUrl ?? null,
      authorName: recipe.authorName ?? null,
      yieldText: recipe.yieldText,
      servings: recipe.servings,
      servingUnit: recipe.servingUnit,
      prepTimeMinutes: recipe.prepTimeMinutes ?? null,
      cookTimeMinutes: recipe.cookTimeMinutes ?? null,
      totalTimeMinutes: recipe.totalTimeMinutes ?? null,
      mealTypes: recipe.mealTypes,
      ingredientNames,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      nutrition: recipe.nutrition ?? null,
      tags: recipe.tags,
      dietaryFlags: recipe.dietaryFlags,
      allergens: recipe.allergens,
      cuisine: recipe.cuisine ?? null,
      difficulty: recipe.difficulty ?? null,
      categories: recipe.categories,
      estimatedCostTier: recipe.estimatedCostTier ?? null,
      equipmentNeeded: recipe.equipmentNeeded,
    });
  }

  // =========================================================================
  // Private: LLM Parsing
  // =========================================================================

  private async parseWithLlm(
    content: string,
    canonicalUrl: string,
    contentType: 'html' | 'markdown' = 'html',
    llm?: { userId: string | null; route: string }
  ): Promise<ParsedRecipeDocument | null> {
    const maxLen = contentType === 'markdown' ? 15000 : 20000;
    const truncated = content.length > maxLen
      ? `${content.slice(0, maxLen)}\n${contentType === 'html' ? '<!-- truncated -->' : '<!-- content truncated -->'}`
      : content;

    const contentLabel = contentType === 'markdown'
      ? 'The content below is a markdown/text representation of a recipe page.'
      : 'The content below is raw HTML from a recipe page.';

    const prompt = [
      `Extract one recipe from the provided content and return only valid JSON.`,
      contentLabel,
      'If no recipe can be found, return: {"found":false}.',
      'If found, return: {"found":true,"recipe":{...}}.',
      'Recipe JSON schema:',
      JSON.stringify(
        {
          title: 'string',
          summary: 'string|null',
          imageUrl: 'string|null',
          authorName: 'string|null',
          yieldText: 'string|null',
          servings: 'number|null',
          prepTimeMinutes: 'number|null',
          cookTimeMinutes: 'number|null',
          totalTimeMinutes: 'number|null',
          ingredients: [{ text: 'string', name: 'string|null', amount: 'number|null', unit: 'string|null' }],
          instructions: [{ text: 'string', position: 'number|null' }],
          nutrition: { calories: 'number|null', protein: 'number|null', carbohydrates: 'number|null', fat: 'number|null' },
          tags: ['string'],
          mealTypes: ['breakfast|lunch|dinner|snack'],
          ingredientNames: ['string'],
        },
        null,
        2
      ),
      `URL: ${canonicalUrl}`,
      `${contentType === 'markdown' ? 'Content' : 'HTML'}:`,
      truncated,
    ].join('\n');

    try {
      const response = await createTrackedOpenAIResponse(
        this.llmClient,
        {
          model: this.modelName,
          input: prompt,
          max_output_tokens: 2000,
          text: { format: zodResponsesTextFormat(LlmRecipeParseResultSchema, 'recipe_llm_parse', { strict: false }) },
        } as OpenAI.Responses.ResponseCreateParams,
        {
          userId: llm?.userId ?? null,
          route: llm?.route ?? 'recipe/curation/parse',
          tag: 'recipe_curation_parse',
          requestGroupId: newLlmRequestGroupId(),
          attemptIndex: 0,
        }
      );

      const refusal = getRefusalFromResponse(response);
      if (refusal) return null;
      const text = extractResponsesOutputText(response);
      if (!text.trim()) return null;

      const parsed = parseModelJsonWithSchema(text, LlmRecipeParseResultSchema);
      if (!parsed.found) return null;

      return normalizeLlmRecipe(parsed.recipe, canonicalUrl);
    } catch (error) {
      console.warn('[recipeCurationService] LLM parse failed:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private buildEnrichmentPrompt(parsed: ParsedRecipeDocument): string {
    const recipeData = JSON.stringify(
      {
        title: parsed.title,
        summary: parsed.summary,
        servings: parsed.servings,
        yieldText: parsed.yieldText,
        prepTimeMinutes: parsed.prepTimeMinutes,
        cookTimeMinutes: parsed.cookTimeMinutes,
        totalTimeMinutes: parsed.totalTimeMinutes,
        ingredients: parsed.ingredients.map((i) => ({ text: i.text, name: i.name, amount: i.amount, unit: i.unit })),
        instructions: parsed.instructions.map((i) => ({ text: i.text, position: i.position })),
        nutrition: parsed.nutrition,
        tags: parsed.tags,
        mealTypes: parsed.mealTypes,
      },
      null,
      2
    );

    const prompt = this.enrichmentPromptTemplate
      .replace('{dietaryFlags}', DietaryFlagSchema.options.join(', '))
      .replace('{allergens}', AllergenSchema.options.join(', '))
      .replace('{categories}', RecipeCategorySchema.options.join(', '))
      .replace('{equipment}', RecipeEquipmentSchema.options.join(', '));

    return `${prompt}\n\n## Recipe to Enrich\n\n${recipeData}`;
  }

  private mergeEnrichment(
    parsed: ParsedRecipeDocument,
    enrichment: Record<string, unknown>,
    sourceUrl: string
  ): CuratedRecipe {
    const slug = asString(enrichment.slug) || slugify(parsed.title);
    const enrichedIngredientMap = new Map<string, Record<string, unknown>>();
    if (Array.isArray(enrichment.ingredients)) {
      for (const item of enrichment.ingredients) {
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const key = asString(record.originalText);
          if (key) enrichedIngredientMap.set(key.toLowerCase().trim(), record);
        }
      }
    }

    const mergedIngredients = parsed.ingredients.map((original) => {
      const enriched = enrichedIngredientMap.get(original.text.toLowerCase().trim());
      return {
        text: original.text,
        name: original.name || extractIngredientName(original.text),
        amount: original.amount,
        unit: original.unit,
        amountInGrams: enriched ? toPositiveNumber(enriched.amountInGrams) : undefined,
        pantryCategory: enriched ? asString(enriched.pantryCategory) || undefined : undefined,
        optional: enriched ? (enriched.optional === true ? true : undefined) : undefined,
      };
    });

    const enrichedNutrition = asRecord(enrichment.nutrition);
    const nutrition = enrichedNutrition
      ? {
          calories: toPositiveNumber(enrichedNutrition.calories),
          protein: toPositiveNumber(enrichedNutrition.protein),
          carbohydrates: toPositiveNumber(enrichedNutrition.carbohydrates),
          fat: toPositiveNumber(enrichedNutrition.fat),
          fiber: toPositiveNumber(enrichedNutrition.fiber),
          sugar: toPositiveNumber(enrichedNutrition.sugar),
          sodium: toPositiveNumber(enrichedNutrition.sodium),
          saturatedFat: toPositiveNumber(enrichedNutrition.saturatedFat),
          potassium: toPositiveNumber(enrichedNutrition.potassium),
          cholesterol: toPositiveNumber(enrichedNutrition.cholesterol),
          calcium: toPositiveNumber(enrichedNutrition.calcium),
          iron: toPositiveNumber(enrichedNutrition.iron),
          vitaminA: toPositiveNumber(enrichedNutrition.vitaminA),
          vitaminC: toPositiveNumber(enrichedNutrition.vitaminC),
          vitaminD: toPositiveNumber(enrichedNutrition.vitaminD),
          magnesium: toPositiveNumber(enrichedNutrition.magnesium),
        }
      : parsed.nutrition
        ? { ...parsed.nutrition }
        : undefined;

    const raw: unknown = {
      slug,
      title: parsed.title,
      summary: parsed.summary || `${parsed.title}.`,
      imageUrl: parsed.imageUrl ?? undefined,
      authorName: parsed.authorName ?? undefined,
      sourceUrl,
      yieldText: parsed.yieldText || `${parsed.servings || 1} serving${(parsed.servings || 1) > 1 ? 's' : ''}`,
      servings: parsed.servings || 1,
      servingUnit: asString(enrichment.servingUnit) || 'serving',
      prepTimeMinutes: parsed.prepTimeMinutes ?? undefined,
      cookTimeMinutes: parsed.cookTimeMinutes ?? undefined,
      totalTimeMinutes: parsed.totalTimeMinutes ?? undefined,
      mealTypes: parsed.mealTypes.length ? parsed.mealTypes : ['dinner'],
      tags: parsed.tags.length ? parsed.tags : [parsed.title.toLowerCase()],
      searchAliases: asStringArray(enrichment.searchAliases),
      ingredients: mergedIngredients,
      instructions: normalizeEnrichedSteps(enrichment.steps) ?? parsed.instructions,
      nutrition,
      dietaryFlags: asStringArray(enrichment.dietaryFlags),
      allergens: asStringArray(enrichment.allergens),
      cuisine: asString(enrichment.cuisine) || undefined,
      difficulty: asString(enrichment.difficulty) || undefined,
      categories: asStringArray(enrichment.categories),
      estimatedCostTier: asString(enrichment.estimatedCostTier) || undefined,
      equipmentNeeded: asStringArray(enrichment.equipmentNeeded),
    };

    return CuratedRecipeSchema.parse(raw);
  }
}

// ---------------------------------------------------------------------------
// HTML Fetch
// ---------------------------------------------------------------------------

/**
 * Direct HTML fetch with a browser-like User-Agent.
 * Returns null if blocked or failed (does NOT throw).
 */
async function fetchHtmlDirect(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        console.warn(`[fetch] Direct fetch returned ${response.status} for ${url}`);
        return null;
      }

      const html = await response.text();
      if (looksBlocked(html)) {
        console.warn(`[fetch] Direct fetch looks blocked for ${url}`);
        return null;
      }

      return html;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn(`[fetch] Direct fetch error for ${url}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Fetch content via Jina reader proxy.
 * mode='html' requests the original HTML (preserves JSON-LD).
 * mode='markdown' requests a clean markdown rendering (always readable).
 */
async function fetchViaJina(url: string, mode: 'html' | 'markdown'): Promise<string | null> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'NomlogRecipeImporter/1.0 (+https://nomlog.app)',
      };

      if (mode === 'html') {
        // Ask Jina to return original HTML
        headers['Accept'] = 'text/html';
        headers['X-Return-Format'] = 'html';
      } else {
        // Default Jina behavior: clean markdown
        headers['Accept'] = 'text/plain';
        headers['X-Return-Format'] = 'markdown';
      }

      const response = await fetch(jinaUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        console.warn(`[fetch] Jina (${mode}) returned ${response.status} for ${url}`);
        return null;
      }

      const body = await response.text();
      if (!body || body.trim().length < 100) {
        console.warn(`[fetch] Jina (${mode}) returned very short content for ${url}`);
        return null;
      }

      return body.trim();
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn(`[fetch] Jina (${mode}) error for ${url}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

function looksBlocked(html: string): boolean {
  const lower = (html || '').toLowerCase();
  return (
    lower.includes('access denied') ||
    lower.includes('captcha') ||
    lower.includes('cf-chl') ||
    lower.includes('attention required') ||
    lower.includes('verify you are human')
  );
}

// ---------------------------------------------------------------------------
// JSON-LD Parsing
// ---------------------------------------------------------------------------

function parseJsonLd(html: string, canonicalUrl: string): ParsedRecipeDocument | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html))) {
    if (match[1]) blocks.push(match[1].trim());
  }

  for (const block of blocks) {
    const json = decodeHtmlEntities(block.replace(/^\uFEFF/, '').trim());
    try {
      const parsed = JSON.parse(json);
      const recipe = findRecipeNode(parsed);
      if (recipe) return mapJsonLdToDocument(recipe, canonicalUrl);
    } catch {
      continue;
    }
  }
  return null;
}

function findRecipeNode(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  const node = value as Record<string, unknown>;
  const types = normalizeTypeField(node['@type']);
  if (types.includes('recipe')) return node;
  if (Array.isArray(node['@graph'])) return findRecipeNode(node['@graph']);
  return null;
}

function normalizeTypeField(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).toLowerCase());
  return [String(value).toLowerCase()];
}

function mapJsonLdToDocument(recipe: Record<string, unknown>, canonicalUrl: string): ParsedRecipeDocument | null {
  const title = asString(recipe.name);
  if (!title) return null;

  const ingredientLines = asStringArray(recipe.recipeIngredient);
  const ingredients = ingredientLines.map((text) => ({ text, name: extractIngredientName(text) }));

  const instructions = extractInstructions(recipe.recipeInstructions);
  if (!instructions.length) instructions.push({ text: 'Follow source instructions.', position: 1 });

  const summary = cleanSummary(asString(recipe.description), ingredientLines) || `Imported from ${deriveSourceName(canonicalUrl)}.`;

  const nutritionBlock = asRecord(recipe.nutrition);
  const nutrition = nutritionBlock
    ? {
        calories: toNutritionNumber(nutritionBlock.calories),
        protein: toNutritionNumber(nutritionBlock.proteinContent),
        carbohydrates: toNutritionNumber(nutritionBlock.carbohydrateContent),
        fat: toNutritionNumber(nutritionBlock.fatContent),
      }
    : null;

  const mealTypes = inferMealTypes([
    asString(recipe.recipeCategory) || '',
    ...asStringArray(recipe.recipeCategory),
    ...asStringArray(recipe.keywords),
  ]);

  const tags = Array.from(
    new Set(
      [...asStringArray(recipe.recipeCategory), ...asStringArray(recipe.keywords), asString(recipe.recipeCuisine)]
        .map(cleanTag)
        .filter(Boolean) as string[]
    )
  );

  const ingredientNames = Array.from(new Set(ingredients.map((i) => i.name?.toLowerCase().trim() || '').filter(Boolean)));

  return {
    title,
    summary,
    imageUrl: extractImageUrl(recipe.image),
    authorName: extractAuthorName(recipe.author),
    yieldText: asString(recipe.recipeYield) || null,
    servings: toNumber(recipe.recipeYield),
    prepTimeMinutes: parseIsoDuration(asString(recipe.prepTime)),
    cookTimeMinutes: parseIsoDuration(asString(recipe.cookTime)),
    totalTimeMinutes: parseIsoDuration(asString(recipe.totalTime)),
    ingredients,
    instructions,
    nutrition,
    tags,
    mealTypes,
    ingredientNames,
  };
}

// ---------------------------------------------------------------------------
// Instruction Parsing
// ---------------------------------------------------------------------------

function extractInstructions(value: unknown): Array<{ text: string; position?: number }> {
  const raw: string[] = [];

  const visit = (node: unknown) => {
    if (!node) return;
    if (typeof node === 'string') {
      const trimmed = node.trim();
      if (trimmed) raw.push(trimmed);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const types = normalizeTypeField(record['@type']);
    if (types.includes('howtostep')) {
      const text = asString(record.text) || asString(record.name) || '';
      if (text.trim()) raw.push(text.trim());
      return;
    }
    if (types.includes('howtosection')) {
      visit(record.itemListElement);
      return;
    }
    const text = asString(record.text) || asString(record.name);
    if (text?.trim()) raw.push(text.trim());
  };

  visit(value);

  // Merge fragments that are comma-split continuations of the previous step.
  // A fragment is a continuation if it starts with a lowercase letter (i.e. it
  // was split mid-sentence) OR if the previous chunk has no terminal punctuation.
  const merged: string[] = [];
  for (const chunk of raw) {
    const startsLower = /^[a-z]/.test(chunk);
    const prevLacksPunct = merged.length > 0 && !/[.!?]$/.test(merged[merged.length - 1]);
    if (merged.length > 0 && (startsLower || prevLacksPunct)) {
      merged[merged.length - 1] += ', ' + chunk;
    } else {
      merged.push(chunk);
    }
  }

  return merged.slice(0, 30).map((text, i) => ({ text, position: i + 1 }));
}

// ---------------------------------------------------------------------------
// LLM Recipe Normalization
// ---------------------------------------------------------------------------

function normalizeLlmRecipe(value: unknown, canonicalUrl: string): ParsedRecipeDocument | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = asString(record.title);
  if (!title) return null;

  const ingredientsRaw = Array.isArray(record.ingredients) ? record.ingredients : [];
  const ingredients: ParsedRecipeDocument['ingredients'] = [];
  for (const item of ingredientsRaw) {
    if (typeof item === 'string') {
      if (item.trim()) ingredients.push({ text: item.trim(), name: extractIngredientName(item) });
      continue;
    }
    const row = asRecord(item);
    if (!row) continue;
    const text = asString(row.text);
    if (!text) continue;
    ingredients.push({
      text,
      name: asString(row.name) || extractIngredientName(text),
      amount: toNumber(row.amount) ?? undefined,
      unit: asString(row.unit) ?? undefined,
    });
  }
  if (!ingredients.length) return null;

  const instructionsRaw = Array.isArray(record.instructions) ? record.instructions : [];
  const instructions: ParsedRecipeDocument['instructions'] = [];
  for (let i = 0; i < instructionsRaw.length; i++) {
    const item = instructionsRaw[i];
    if (typeof item === 'string') {
      if (item.trim()) instructions.push({ text: item.trim(), position: i + 1 });
      continue;
    }
    const row = asRecord(item);
    if (!row) continue;
    const text = asString(row.text);
    if (!text) continue;
    instructions.push({ text, position: toNumber(row.position) ?? i + 1 });
  }
  if (!instructions.length) instructions.push({ text: 'Follow source instructions.', position: 1 });

  const nutritionRaw = asRecord(record.nutrition);
  const nutrition = nutritionRaw
    ? {
        calories: toNutritionNumber(nutritionRaw.calories),
        protein: toNutritionNumber(nutritionRaw.protein),
        carbohydrates: toNutritionNumber(nutritionRaw.carbohydrates),
        fat: toNutritionNumber(nutritionRaw.fat),
      }
    : null;

  const rawMealTypes = asStringArray(record.mealTypes);
  const mealTypes = normalizeMealTypes(rawMealTypes.length ? rawMealTypes : inferMealTypes(asStringArray(record.tags)));
  const tags = Array.from(new Set(asStringArray(record.tags).map(cleanTag).filter(Boolean) as string[]));
  const ingredientNames = Array.from(
    new Set(ingredients.map((i) => (i.name || '').toLowerCase().trim()).filter(Boolean))
  );

  return {
    title,
    summary: cleanSummary(asString(record.summary), ingredients.map((i) => i.text)) || `Imported from ${deriveSourceName(canonicalUrl)}.`,
    imageUrl: toUrlOrNull(asString(record.imageUrl)),
    authorName: asString(record.authorName),
    yieldText: asString(record.yieldText),
    servings: toNumber(record.servings),
    prepTimeMinutes: toMinutes(record.prepTimeMinutes),
    cookTimeMinutes: toMinutes(record.cookTimeMinutes),
    totalTimeMinutes: toMinutes(record.totalTimeMinutes),
    ingredients,
    instructions,
    nutrition,
    tags,
    mealTypes,
    ingredientNames,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates that a parsed recipe has enough substance to be worth enriching.
 * Throws a descriptive error if the content looks like junk, an index page,
 * or otherwise not a real recipe.
 */
function validateParsedRecipe(doc: ParsedRecipeDocument, url: string): void {
  const issues: string[] = [];

  if (!doc.title || doc.title.trim().length < 3) {
    issues.push('title is missing or too short');
  }

  if (!doc.ingredients || doc.ingredients.length < 2) {
    issues.push(`only ${doc.ingredients?.length ?? 0} ingredient(s) found (minimum 2)`);
  }

  if (!doc.instructions || doc.instructions.length < 1) {
    issues.push('no instructions found');
  }

  // Check that ingredients have actual text content, not just empty strings
  const meaningfulIngredients = (doc.ingredients || []).filter(
    (i) => i.text && i.text.trim().length > 2
  );
  if (meaningfulIngredients.length < 2) {
    issues.push('ingredients lack meaningful text content');
  }

  if (issues.length > 0) {
    throw new Error(
      `Parsed content from ${url} does not look like a valid recipe: ${issues.join('; ')}. ` +
      'The URL may point to a recipe index, blog post, or non-recipe page.'
    );
  }
}

function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = '';
  const dropParams = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref', 'ref_', 'source']);
  for (const key of Array.from(u.searchParams.keys())) {
    if (dropParams.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  return u.toString();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function extractIngredientName(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(cups?|tbsp|tablespoons?|tsp|teaspoons?|ounces?|oz|grams?|g|lbs?|pounds?|ml|liters?|pinch|dash|cloves?|medium|large|small|fresh|dried|ground|chopped|diced|sliced|minced)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(-3)
    .join(' ')
    .trim();
}

function cleanSummary(description: string | null, ingredients: string[]): string | null {
  const clean = (description || '').replace(/\s+/g, ' ').trim();
  if (clean) return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
  const preview = ingredients.slice(0, 3).join(', ');
  return preview ? `A recipe featuring ${preview}.` : null;
}

function inferMealTypes(values: string[]): Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> {
  const joined = values.join(' ').toLowerCase();
  const types: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = [];
  if (/\bbreakfast|brunch\b/.test(joined)) types.push('breakfast');
  if (/\blunch\b/.test(joined)) types.push('lunch');
  if (/\bdinner|supper|main\b/.test(joined)) types.push('dinner');
  if (/\bsnack|dessert|appetizer\b/.test(joined)) types.push('snack');
  return Array.from(new Set(types));
}

function normalizeMealTypes(values: string[]): Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> {
  const allowed = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
  return Array.from(new Set(values.map((v) => v.toLowerCase().trim()).filter((v) => allowed.has(v)))) as Array<
    'breakfast' | 'lunch' | 'dinner' | 'snack'
  >;
}

function extractImageUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return toUrlOrNull(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = extractImageUrl(item);
      if (result) return result;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return toUrlOrNull(asString(record.url) || asString(record.contentUrl));
  }
  return null;
}

function extractAuthorName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = extractAuthorName(item);
      if (name) return name;
    }
    return null;
  }
  if (typeof value === 'object') return asString((value as Record<string, unknown>).name) || null;
  return null;
}

function deriveSourceName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    const parts = host.split('.');
    const domain = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return 'Unknown';
  }
}

function parseIsoDuration(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if (!match) return null;
  const total = Number(match[1] || 0) * 60 + Number(match[2] || 0);
  return total > 0 ? total : null;
}

function cleanTag(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? (Number.isFinite(Number(match[0])) ? Number(match[0]) : null) : null;
}

function toPositiveNumber(value: unknown): number | undefined {
  const n = toNumber(value);
  return typeof n === 'number' && n >= 0 ? n : undefined;
}

function toNutritionNumber(value: unknown): number | undefined {
  const n = toNumber(value);
  return typeof n === 'number' && n >= 0 ? n : undefined;
}

function toMinutes(value: unknown): number | null {
  const n = toNumber(value);
  return typeof n === 'number' && n >= 0 ? Math.round(n) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

function normalizeEnrichedSteps(value: unknown): Array<{ text: string; position: number }> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const steps = value
    .map((item, i) => {
      if (typeof item === 'string') return { text: item.trim(), position: i + 1 };
      if (item && typeof item === 'object') {
        const text = typeof (item as Record<string, unknown>).text === 'string'
          ? ((item as Record<string, unknown>).text as string).trim()
          : '';
        const position = typeof (item as Record<string, unknown>).position === 'number'
          ? (item as Record<string, unknown>).position as number
          : i + 1;
        return text ? { text, position } : null;
      }
      return null;
    })
    .filter((s): s is { text: string; position: number } => s !== null);
  return steps.length > 0 ? steps : null;
}

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
  const single = asString(value);
  return single ? [single] : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toUrlOrNull(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).toString(); } catch { return null; }
}
