import OpenAI from 'openai';
import { createTrackedOpenAIResponse, newLlmRequestGroupId } from '../ai/openaiResponses';
import {
  extractResponsesOutputText,
  getRefusalFromResponse,
  parseModelJsonWithSchema,
  zodResponsesTextFormat,
} from '../ai/structuredOutput';
import { LlmRecipeParseResultSchema } from '../types/recipeLlm';
import { StoredRecipe } from '../types/recipe';
import { RecipeRepository } from './recipeRepository';

type ImportRecipeFromPromptArgs = {
  prompt: string;
  userId: string;
};

type ParsedRecipeDocument = {
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
  nutrition?: {
    calories?: number;
    protein?: number;
    carbohydrates?: number;
    fat?: number;
  } | null;
  tags: string[];
  mealTypes: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'>;
  ingredientNames: string[];
};

export class RecipeUrlImportService {
  private readonly llmClient: OpenAI | null;

  constructor(private readonly recipeRepository: RecipeRepository = new RecipeRepository()) {
    this.llmClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  }

  async importFromPrompt(args: ImportRecipeFromPromptArgs): Promise<StoredRecipe | null> {
    const extractedUrl = extractFirstUrl(args.prompt);
    if (!extractedUrl) return null;

    const { originalUrl, slug } = normalizeRecipeUrl(extractedUrl);
    const existing = await this.recipeRepository.getBySlug(slug);
    if (existing) return existing;

    const html = await fetchRecipeHtml(originalUrl);
    let parsedRecipe = parseRecipeFromHtml(html, originalUrl);
    if (!parsedRecipe) {
      parsedRecipe = await this.parseRecipeWithLlm(html, originalUrl, args.userId);
    }
    if (!parsedRecipe) return null;

    const sourceName = deriveSourceName(originalUrl);
    const sourceKey = deriveSourceKey(originalUrl);

    return this.recipeRepository.upsert({
      slug,
      sourceKey,
      sourceName,
      originalUrl,
      savedByUserId: args.userId,
      title: parsedRecipe.title,
      summary: parsedRecipe.summary ?? null,
      imageUrl: parsedRecipe.imageUrl ?? null,
      authorName: parsedRecipe.authorName ?? null,
      yieldText: parsedRecipe.yieldText ?? null,
      servings: parsedRecipe.servings ?? null,
      prepTimeMinutes: parsedRecipe.prepTimeMinutes ?? null,
      cookTimeMinutes: parsedRecipe.cookTimeMinutes ?? null,
      totalTimeMinutes: parsedRecipe.totalTimeMinutes ?? null,
      mealTypes: parsedRecipe.mealTypes,
      ingredients: parsedRecipe.ingredients,
      instructions: parsedRecipe.instructions,
      nutrition: parsedRecipe.nutrition ?? null,
      tags: parsedRecipe.tags,
      ingredientNames: parsedRecipe.ingredientNames,
    });
  }

  private async parseRecipeWithLlm(
    html: string,
    canonicalUrl: string,
    userId: string
  ): Promise<ParsedRecipeDocument | null> {
    if (!this.llmClient) return null;

    const sanitizedHtml = truncateForLlm(html, 20000);
    const sourceName = deriveSourceName(canonicalUrl);
    const prompt = [
      'Extract one recipe from the provided HTML and return only valid JSON.',
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
      `Canonical URL: ${canonicalUrl}`,
      `Fallback source name: ${sourceName}`,
      'HTML:',
      sanitizedHtml,
    ].join('\n');

    try {
      const response = await createTrackedOpenAIResponse(
        this.llmClient,
        {
          model: process.env.OPENAI_PLANNER_MODEL_NAME || process.env.OPENAI_SUMMARY_MODEL_NAME || 'gpt-5-mini',
          input: prompt,
          max_output_tokens: 1200,
          reasoning: { effort: 'low' },
          text: { format: zodResponsesTextFormat(LlmRecipeParseResultSchema, 'recipe_url_import_parse', { strict: false }) },
        } as OpenAI.Responses.ResponseCreateParams,
        {
          userId,
          route: 'recipe/url-import',
          tag: 'recipe_url_import_parse',
          requestGroupId: newLlmRequestGroupId(),
          attemptIndex: 0,
        }
      );

      if (getRefusalFromResponse(response)) return null;
      const text = extractResponsesOutputText(response);
      if (!text.trim()) return null;

      const parsed = parseModelJsonWithSchema(text, LlmRecipeParseResultSchema);
      if (!parsed.found) return null;
      return normalizeLlmRecipe(parsed.recipe, canonicalUrl);
    } catch (error) {
      console.warn('[recipeUrlImportService] llm parse failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

async function fetchRecipeHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'NomlogRecipeImporter/1.0 (+https://nomlog.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (response.ok) {
      const html = await response.text();
      if (!looksBlockedHtml(html)) {
        return html;
      }
    }

    // Fallback for anti-bot protected pages (e.g. 403 or blocked content).
    const fallback = await fetchViaJinaMirror(url, controller.signal);
    if (fallback) return fallback;

    throw new Error(`Recipe import fetch failed with status ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaJinaMirror(url: string, signal: AbortSignal): Promise<string | null> {
  const stripped = url.replace(/^https?:\/\//i, '');
  const mirrorUrl = `https://r.jina.ai/http://${stripped}`;
  try {
    const response = await fetch(mirrorUrl, {
      method: 'GET',
      redirect: 'follow',
      signal,
      headers: {
        'User-Agent': 'NomlogRecipeImporter/1.0 (+https://nomlog.app)',
        Accept: 'text/plain,text/markdown,text/html',
      },
    });

    if (!response.ok) return null;
    const body = await response.text();
    return body.trim() ? body : null;
  } catch {
    return null;
  }
}

function looksBlockedHtml(html: string): boolean {
  const normalized = (html || '').toLowerCase();
  return (
    normalized.includes('access denied') ||
    normalized.includes('captcha') ||
    normalized.includes('cf-chl') ||
    normalized.includes('attention required') ||
    normalized.includes('verify you are human')
  );
}

function parseRecipeFromHtml(html: string, canonicalUrl: string): ParsedRecipeDocument | null {
  const jsonLdRecipe = parseRecipeFromJsonLd(html);
  if (!jsonLdRecipe) return null;

  const title = asString(jsonLdRecipe.name);
  if (!title) return null;

  const ingredientLines = asStringArray(jsonLdRecipe.recipeIngredient);
  const ingredients = ingredientLines.map((text) => ({
    text,
    name: extractIngredientName(text),
  }));

  const instructions = extractInstructions(jsonLdRecipe.recipeInstructions);
  if (!instructions.length) {
    instructions.push({ text: 'Follow source instructions.', position: 1 });
  }

  const summary =
    summarizeDescription(asString(jsonLdRecipe.description), ingredientLines) ||
    `Imported from ${deriveSourceName(canonicalUrl)}.`;

  const nutritionBlock = asRecord(jsonLdRecipe.nutrition);
  const nutrition = nutritionBlock
    ? {
        calories: toNutritionNumber(nutritionBlock.calories),
        protein: toNutritionNumber(nutritionBlock.proteinContent),
        carbohydrates: toNutritionNumber(nutritionBlock.carbohydrateContent),
        fat: toNutritionNumber(nutritionBlock.fatContent),
      }
    : null;

  const mealTypes = inferMealTypes([
    asString(jsonLdRecipe.recipeCategory) || '',
    ...asStringArray(jsonLdRecipe.recipeCategory),
    ...asStringArray(jsonLdRecipe.keywords),
  ]);

  const tags = Array.from(
    new Set(
      [
        ...asStringArray(jsonLdRecipe.recipeCategory),
        ...asStringArray(jsonLdRecipe.keywords),
        asString(jsonLdRecipe.recipeCuisine),
      ]
        .map((value) => cleanTag(value))
        .filter(Boolean) as string[]
    )
  );

  const ingredientNames = Array.from(
    new Set(ingredients.map((ingredient) => ingredient.name?.toLowerCase().trim() || '').filter(Boolean))
  );

  return {
    title,
    summary,
    imageUrl: extractImageUrl(jsonLdRecipe.image),
    authorName: extractAuthorName(jsonLdRecipe.author),
    yieldText: asString(jsonLdRecipe.recipeYield) || null,
    servings: toNumber(jsonLdRecipe.recipeYield),
    prepTimeMinutes: parseIsoDurationMinutes(asString(jsonLdRecipe.prepTime)),
    cookTimeMinutes: parseIsoDurationMinutes(asString(jsonLdRecipe.cookTime)),
    totalTimeMinutes: parseIsoDurationMinutes(asString(jsonLdRecipe.totalTime)),
    ingredients,
    instructions,
    nutrition,
    tags,
    mealTypes,
    ingredientNames,
  };
}

function normalizeLlmRecipe(value: unknown, canonicalUrl: string): ParsedRecipeDocument | null {
  const record = asRecord(value);
  if (!record) return null;

  const title = asString(record.title);
  if (!title) return null;

  const ingredientsInput = Array.isArray(record.ingredients) ? record.ingredients : [];
  const ingredients: ParsedRecipeDocument['ingredients'] = [];
  for (const item of ingredientsInput) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) continue;
      ingredients.push({ text, name: extractIngredientName(text) });
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

  const instructionsInput = Array.isArray(record.instructions) ? record.instructions : [];
  const instructions: ParsedRecipeDocument['instructions'] = [];
  for (let idx = 0; idx < instructionsInput.length; idx++) {
    const item = instructionsInput[idx];
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) continue;
      instructions.push({ text, position: idx + 1 });
      continue;
    }

    const row = asRecord(item);
    if (!row) continue;
    const text = asString(row.text);
    if (!text) continue;
    instructions.push({
      text,
      position: toNumber(row.position) ?? idx + 1,
    });
  }

  if (!instructions.length) {
    instructions.push({ text: 'Follow source instructions.', position: 1 });
  }

  const nutritionInput = asRecord(record.nutrition);
  const nutrition = nutritionInput
    ? {
        calories: toNutritionNumber(nutritionInput.calories),
        protein: toNutritionNumber(nutritionInput.protein),
        carbohydrates: toNutritionNumber(nutritionInput.carbohydrates),
        fat: toNutritionNumber(nutritionInput.fat),
      }
    : null;

  const rawMealTypes = asStringArray(record.mealTypes);
  const mealTypes = normalizeMealTypes(rawMealTypes.length ? rawMealTypes : inferMealTypes(asStringArray(record.tags)));
  const tags = Array.from(new Set(asStringArray(record.tags).map((tag) => cleanTag(tag)).filter(Boolean) as string[]));
  const ingredientNames = Array.from(
    new Set(
      (asStringArray(record.ingredientNames).length ? asStringArray(record.ingredientNames) : ingredients.map((i) => i.name || ''))
        .map((name) => name.toLowerCase().trim())
        .filter(Boolean)
    )
  );

  return {
    title,
    summary: summarizeDescription(asString(record.summary), ingredients.map((i) => i.text)) || `Imported from ${deriveSourceName(canonicalUrl)}.`,
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

function parseRecipeFromJsonLd(html: string): Record<string, unknown> | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html))) {
    if (match[1]) blocks.push(match[1].trim());
  }

  for (const block of blocks) {
    const json = decodeHtmlEntities(stripUnsafeJson(block));
    try {
      const parsed = JSON.parse(json);
      const candidate = findRecipeNode(parsed);
      if (candidate) return candidate;
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
  const type = normalizeTypeField(node['@type']);
  if (type.includes('recipe')) return node;

  if (Array.isArray(node['@graph'])) {
    const fromGraph = findRecipeNode(node['@graph']);
    if (fromGraph) return fromGraph;
  }

  return null;
}

function normalizeTypeField(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).toLowerCase());
  return [String(value).toLowerCase()];
}

function extractInstructions(value: unknown): Array<{ text: string; position?: number }> {
  const steps: Array<{ text: string; position?: number }> = [];

  const pushStep = (text: string, position?: number) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    steps.push({ text: trimmed, position: position || undefined });
  };

  const visit = (node: unknown) => {
    if (!node) return;
    if (typeof node === 'string') {
      pushStep(node, steps.length + 1);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== 'object') return;

    const record = node as Record<string, unknown>;
    const type = normalizeTypeField(record['@type']);
    if (type.includes('howtostep')) {
      const text = asString(record.text) || asString(record.name) || '';
      pushStep(text, toNumber(record.position) || steps.length + 1);
      return;
    }

    if (type.includes('howtosection')) {
      visit(record.itemListElement);
      return;
    }

    const text = asString(record.text) || asString(record.name);
    if (text) {
      pushStep(text, toNumber(record.position) || steps.length + 1);
    }
  };

  visit(value);
  return steps.slice(0, 30);
}

function inferMealTypes(values: string[]): Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> {
  const joined = values.join(' ').toLowerCase();
  const types: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = [];
  if (/\bbreakfast|brunch\b/.test(joined)) types.push('breakfast');
  if (/\blunch\b/.test(joined)) types.push('lunch');
  if (/\bdinner|supper|main\b/.test(joined)) types.push('dinner');
  if (/\bsnack|dessert\b/.test(joined)) types.push('snack');
  return Array.from(new Set(types));
}

function normalizeMealTypes(values: string[]): Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> {
  const allowed = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
  return Array.from(new Set(values.map((value) => value.toLowerCase().trim()).filter((value) => allowed.has(value)))) as Array<
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
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return asString(record.name) || null;
  }
  return null;
}

function extractIngredientName(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|ounces?|oz|grams?|g|lbs?|pounds?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(-3)
    .join(' ')
    .trim();
}

function summarizeDescription(description: string | null, ingredients: string[]): string | null {
  const cleanDescription = (description || '').replace(/\s+/g, ' ').trim();
  if (cleanDescription) {
    return cleanDescription.length > 220 ? `${cleanDescription.slice(0, 217)}...` : cleanDescription;
  }
  const preview = ingredients.slice(0, 3).join(', ');
  if (!preview) return null;
  return `Imported recipe featuring ${preview}.`;
}

function parseIsoDurationMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}

function toNutritionNumber(value: unknown): number | undefined {
  const parsed = toNumber(value);
  return typeof parsed === 'number' && parsed >= 0 ? parsed : undefined;
}

function toMinutes(value: unknown): number | null {
  const parsed = toNumber(value);
  if (typeof parsed !== 'number' || parsed < 0) return null;
  return Math.round(parsed);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : asString((item as Record<string, unknown>)?.name) || ''))
      .filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toUrlOrNull(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/\bhttps?:\/\/[^\s<>"')]+/i);
  return match ? match[0] : null;
}

function normalizeRecipeUrl(url: string): { originalUrl: string; slug: string } {
  const original = new URL(url).toString();
  const canonical = new URL(original);
  canonical.hash = '';

  const dropParams = new Set([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'ref',
    'ref_',
    'source',
  ]);

  for (const key of Array.from(canonical.searchParams.keys())) {
    if (dropParams.has(key.toLowerCase())) {
      canonical.searchParams.delete(key);
    }
  }

  // Derive a slug from the source domain + last path segment
  const host = canonical.hostname.replace(/^www\./i, '').split('.')[0];
  const pathSegments = canonical.pathname.split('/').filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] ?? '';
  const rawSlug = `${host}-${lastSegment}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  return {
    originalUrl: original,
    slug: rawSlug || host,
  };
}

function deriveSourceName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./i, '');
  const parts = host.split('.');
  const domain = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function deriveSourceKey(url: string): 'internal' | 'user_import' | 'allrecipes' | 'foodnetwork' | 'seriouseats' | 'simplyrecipes' | 'spoonacular' {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes('allrecipes')) return 'allrecipes';
  if (host.includes('foodnetwork')) return 'foodnetwork';
  if (host.includes('seriouseats')) return 'seriouseats';
  if (host.includes('simplyrecipes')) return 'simplyrecipes';
  if (host.includes('spoonacular')) return 'spoonacular';
  return 'user_import';
}

function cleanTag(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function stripUnsafeJson(value: string): string {
  return value.replace(/^\uFEFF/, '').trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function truncateForLlm(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n<!-- truncated -->`;
}

export const recipeUrlImportServiceInternals = {
  extractFirstUrl,
  normalizeRecipeUrl,
  parseRecipeFromHtml,
  normalizeLlmRecipe,
  deriveSourceName,
  deriveSourceKey,
};
