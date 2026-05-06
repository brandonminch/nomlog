import OpenAI from 'openai';
import { createTrackedOpenAIResponse, newLlmRequestGroupId } from '../ai/openaiResponses';
import {
  extractResponsesOutputText,
  getRefusalFromResponse,
  parseModelJsonWithSchema,
  zodResponsesTextFormat,
} from '../ai/structuredOutput';
import { z } from 'zod';
import { StoredRecipeSchema } from '../types/recipe';
import { PlannerMealSlotSchema, type PlannerMealSlot } from '../types/planner';

type RecipeSearchArgs = {
  prompt: string;
  mealType?: PlannerMealSlot;
  maxResults?: number;
  userId?: string;
};

const PlannerQueryShapingResponseSchema = z.object({
  mealType: PlannerMealSlotSchema.optional(),

  // Nutrition intent signals.
  wantsHighProtein: z.boolean().optional(),

  // "easy/quick/fast" style intent.
  wantsQuick: z.boolean().optional(),

  // Explicit time budget when present (examples: "under 30 minutes").
  maxMinutes: z.number().int().nonnegative().optional(),

  // Keyword-ish terms that should be present in the recipe to satisfy the user.
  // This should usually be empty for macro-only prompts so we don't hard-fail quality.
  desiredTerms: z.array(z.string().min(1)),

  // Macro/diet intent expansion (soft signals; not strict filtering).
  wantsLowCarb: z.boolean().optional(),
  maxCarbs: z.number().int().nonnegative().optional(),
  wantsHighCarb: z.boolean().optional(),

  wantsLowFat: z.boolean().optional(),
  maxFat: z.number().int().nonnegative().optional(),

  wantsLowCalories: z.boolean().optional(),
  maxCalories: z.number().int().nonnegative().optional(),

  // "Keto-ish" / shorthand diet intent; keep soft heuristics downstream.
  ketoLike: z.boolean().optional(),
});

export type RecipeQueryShapingResponse = z.infer<typeof PlannerQueryShapingResponseSchema>;

function describeZodType(zodType: z.ZodTypeAny, depth: number): unknown {
  if (depth > 4) return { type: 'complex' };

  const typeName = (zodType as any)?._def?.typeName || zodType.constructor.name;

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum': {
      const values = (zodType as any)?._def?.values;
      return { type: 'enum', values: Array.isArray(values) ? values : values ? [String(values)] : [] };
    }
    case 'ZodNativeEnum': {
      const values = (zodType as any)?._def?.values;
      return { type: 'nativeEnum', values: values ? Object.values(values) : [] };
    }
    case 'ZodArray': {
      const itemType = (zodType as any)?._def?.type;
      return { type: 'array', items: describeZodType(itemType, depth + 1) };
    }
    case 'ZodDefault': {
      const innerType = (zodType as any)?._def?.innerType;
      return { type: 'default', inner: describeZodType(innerType, depth + 1) };
    }
    case 'ZodOptional': {
      const innerType = (zodType as any)?._def?.innerType;
      return { type: 'optional', inner: describeZodType(innerType, depth + 1) };
    }
    case 'ZodNullable': {
      const innerType = (zodType as any)?._def?.innerType;
      return { type: 'nullable', inner: describeZodType(innerType, depth + 1) };
    }
    case 'ZodObject': {
      const shapeFn = (zodType as any)?._def?.shape;
      const shape = typeof shapeFn === 'function' ? shapeFn() : shapeFn || {};
      const keys = Object.keys(shape);
      return {
        type: 'object',
        keys: keys.slice(0, 50),
        // Keep this compact; downstream only needs top-level and nested field names.
        fields: keys.slice(0, 25).reduce((acc, key) => {
          acc[key] = describeZodType(shape[key], depth + 1);
          return acc;
        }, {} as Record<string, unknown>),
      };
    }
    default: {
      return { type: typeName || 'unknown' };
    }
  }
}

function buildStoredRecipeSchemaContract(): unknown {
  const shapeFn = (StoredRecipeSchema as any)?._def?.shape;
  const shape = typeof shapeFn === 'function' ? shapeFn() : shapeFn || {};
  const keys = Object.keys(shape);

  return {
    model: 'StoredRecipe',
    description: 'The authoritative recipe entity shape used in Nomlog. You only need this to understand what structured fields exist.',
    fields: keys.reduce((acc, key) => {
      acc[key] = describeZodType(shape[key], 0);
      return acc;
    }, {} as Record<string, unknown>),
  };
}

export class RecipeQueryShaper {
  private client: OpenAI | null;
  private modelName: string;
  private debugLogsEnabled: boolean;
  private storedRecipeSchemaContract: unknown;

  constructor() {
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    this.client = apiKey ? new OpenAI({ apiKey }) : null;

    this.modelName = process.env.OPENAI_RECIPE_QUERY_SHAPER_MODEL_NAME || 'gpt-5-mini';
    this.debugLogsEnabled = (process.env.OPENAI_DEBUG_LOGS || '').toLowerCase() === 'true';
    this.storedRecipeSchemaContract = buildStoredRecipeSchemaContract();
  }

  async shapeRecipeQuery(args: RecipeSearchArgs): Promise<RecipeQueryShapingResponse | null> {
    if (!this.client) return null;

    const prompt = this.buildShaperPrompt({
      userPrompt: args.prompt,
      externalMealType: args.mealType ?? null,
      storedRecipeSchemaContract: this.storedRecipeSchemaContract,
    });

    const input = prompt;
    const payload: Record<string, unknown> = {
      model: this.modelName,
      input,
      max_output_tokens: 550,
      text: { format: zodResponsesTextFormat(PlannerQueryShapingResponseSchema, 'recipe_query_shape', { strict: false }) },
    };

    const requestGroupId = newLlmRequestGroupId();
    const llmUserId = args.userId ?? null;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await createTrackedOpenAIResponse(
          this.client,
          payload as OpenAI.Responses.ResponseCreateParams,
          {
            userId: llmUserId,
            route: 'recipe/query-shaper',
            tag: 'recipe_query_shaper',
            requestGroupId,
            attemptIndex: attempt,
          }
        );
        if (getRefusalFromResponse(response)) return null;
        const text = extractResponsesOutputText(response);
        try {
          return parseModelJsonWithSchema(text, PlannerQueryShapingResponseSchema);
        } catch {
          return null;
        }
      } catch (error: any) {
        const status = error?.status || error?.response?.status;
        const message = (error?.message || error?.response?.data?.error?.message || '').toString();

        if (this.debugLogsEnabled) {
          console.warn('[recipeQueryShaper] response error', { attempt: attempt + 1, status, message });
        }

        // If OpenAI rejects parameters, attempt removal like other services do.
        if (status === 400) {
          if (/Unsupported parameter/i.test(message)) continue;
        }

        return null;
      }
    }

    return null;
  }

  private buildShaperPrompt(input: {
    userPrompt: string;
    externalMealType: PlannerMealSlot | null;
    storedRecipeSchemaContract: unknown;
  }): string {
    const { userPrompt, externalMealType, storedRecipeSchemaContract } = input;

    // Important: the model must output strict JSON only.
    return [
      'You are Nomlog’s recipe query shaper.',
      'Your job is to convert a natural-language meal-planning prompt into structured intent fields that the backend recipe ranker can use.',
      '',
      'Rules:',
      '- Return JSON only (no markdown, no commentary).',
      '- Output must validate against the provided JSON schema.',
      '- If the user prompt includes “high in protein” (or similar), set `wantsHighProtein=true`.',
      '- If the user prompt includes “easy to prepare”, “easy”, “quick”, or “fast”, set `wantsQuick=true`.',
      '- Only set `maxMinutes` when the user explicitly provides a time budget (e.g. “under 30 minutes”, “in 20 min”).',
      '- Set `desiredTerms` to ingredient/tag-ish keywords only when they are explicitly present.',
      '- For macro-only prompts (protein/low-carb/low-fat/calories/diet shorthand without specific ingredients), prefer `desiredTerms: []`.',
      '- Never include verbs like “prepare”, “cooking”, or “make” in `desiredTerms`.',
      '- Always include `desiredTerms` in the output JSON (it may be an empty array).',
      '',
      'Meal type input:',
      externalMealType ? `- Explicit mealType from UI: ${externalMealType}` : '- Explicit mealType from UI: none (infer from prompt).',
      '',
      'Authoritative recipe schema contract (for field availability context):',
      JSON.stringify(storedRecipeSchemaContract, null, 2),
      '',
      'Output JSON schema:',
      JSON.stringify(
        {
          mealType: 'breakfast|lunch|dinner|snack (optional)',
          wantsHighProtein: 'boolean (optional)',
          wantsQuick: 'boolean (optional)',
          maxMinutes: 'integer minutes (optional)',
          desiredTerms: 'string[] keywords (always present; prefer empty for macro-only prompts)',
          wantsLowCarb: 'boolean (optional)',
          maxCarbs: 'integer grams (optional)',
          wantsHighCarb: 'boolean (optional)',
          wantsLowFat: 'boolean (optional)',
          maxFat: 'integer grams (optional)',
          wantsLowCalories: 'boolean (optional)',
          maxCalories: 'integer calories cap (optional)',
          ketoLike: 'boolean (optional)',
        },
        null,
        2
      ),
      '',
      'User prompt:',
      userPrompt,
    ].join('\n');
  }
}

