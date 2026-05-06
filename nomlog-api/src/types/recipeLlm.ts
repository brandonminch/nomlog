import { z } from 'zod';

/** Single ingredient line as returned by recipe-extraction LLM. */
const ParsedRecipeIngredientLlmSchema = z.object({
  text: z.string(),
  name: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

const ParsedRecipeInstructionLlmSchema = z.object({
  text: z.string(),
  position: z.number().nullable().optional(),
});

const ParsedRecipeNutritionLlmSchema = z
  .object({
    calories: z.number().nullable().optional(),
    protein: z.number().nullable().optional(),
    carbohydrates: z.number().nullable().optional(),
    fat: z.number().nullable().optional(),
  })
  .nullable()
  .optional();

/** Recipe body when `found` is true (matches ParsedRecipeDocument). */
export const ParsedRecipeDocumentLlmSchema = z.object({
  title: z.string(),
  summary: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  authorName: z.string().nullable().optional(),
  yieldText: z.string().nullable().optional(),
  servings: z.number().nullable().optional(),
  prepTimeMinutes: z.number().nullable().optional(),
  cookTimeMinutes: z.number().nullable().optional(),
  totalTimeMinutes: z.number().nullable().optional(),
  ingredients: z.array(ParsedRecipeIngredientLlmSchema),
  instructions: z.array(ParsedRecipeInstructionLlmSchema),
  nutrition: ParsedRecipeNutritionLlmSchema,
  tags: z.array(z.string()),
  mealTypes: z.array(z.enum(['breakfast', 'lunch', 'dinner', 'snack'])),
  ingredientNames: z.array(z.string()),
});

export const LlmRecipeParseResultSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    recipe: ParsedRecipeDocumentLlmSchema,
  }),
]);

export type LlmRecipeParseResult = z.infer<typeof LlmRecipeParseResultSchema>;

const EnrichmentIngredientRowSchema = z.object({
  originalText: z.string(),
  amountInGrams: z.number().optional(),
  pantryCategory: z.string().optional(),
  optional: z.boolean().optional(),
});

const EnrichmentNutritionSchema = z
  .object({
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbohydrates: z.number().optional(),
    fat: z.number().optional(),
    fiber: z.number().optional(),
    sugar: z.number().optional(),
    sodium: z.number().optional(),
    saturatedFat: z.number().optional(),
    potassium: z.number().optional(),
    cholesterol: z.number().optional(),
    calcium: z.number().optional(),
    iron: z.number().optional(),
    vitaminA: z.number().optional(),
    vitaminC: z.number().optional(),
    vitaminD: z.number().optional(),
    magnesium: z.number().optional(),
  })
  .optional();

const EnrichmentStepSchema = z.union([
  z.string(),
  z.object({
    text: z.string(),
    position: z.number().optional(),
  }),
]);

/**
 * Shape the enrichment LLM returns; consumed by mergeEnrichment in recipeCurationService.
 * Fields are optional where the merger applies defaults or parsed recipe data.
 */
export const RecipeEnrichmentLlmSchema = z.object({
  slug: z.string().optional(),
  servingUnit: z.string().optional(),
  searchAliases: z.array(z.string()).optional(),
  ingredients: z.array(EnrichmentIngredientRowSchema).optional(),
  nutrition: EnrichmentNutritionSchema,
  steps: z.array(EnrichmentStepSchema).optional(),
  dietaryFlags: z.array(z.string()).optional(),
  allergens: z.array(z.string()).optional(),
  cuisine: z.string().optional(),
  difficulty: z.string().optional(),
  categories: z.array(z.string()).optional(),
  estimatedCostTier: z.string().optional(),
  equipmentNeeded: z.array(z.string()).optional(),
});

export type RecipeEnrichmentLlm = z.infer<typeof RecipeEnrichmentLlmSchema>;
