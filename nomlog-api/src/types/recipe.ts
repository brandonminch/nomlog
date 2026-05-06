import { z } from 'zod';

export const RecipeSourceKeySchema = z.enum([
  'internal',
  'user_import',
  'allrecipes',
  'foodnetwork',
  'seriouseats',
  'simplyrecipes',
  'spoonacular',
]);

export type RecipeSourceKey = z.infer<typeof RecipeSourceKeySchema>;

export const RecipeMealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type RecipeMealType = z.infer<typeof RecipeMealTypeSchema>;

/** Controlled vocabulary for dietary classification. */
export const DietaryFlagSchema = z.enum([
  'vegetarian',
  'vegan',
  'pescatarian',
  'gluten_free',
  'dairy_free',
  'keto',
  'paleo',
  'whole30',
  'low_fodmap',
  'nut_free',
  'soy_free',
  'egg_free',
  'sugar_free',
  'low_sodium',
  'high_protein',
  'low_carb',
  'high_fiber',
  'mediterranean',
]);
export type DietaryFlag = z.infer<typeof DietaryFlagSchema>;

/** Top-9 US allergens + common extras. */
export const AllergenSchema = z.enum([
  'dairy',
  'eggs',
  'fish',
  'shellfish',
  'tree_nuts',
  'peanuts',
  'wheat',
  'soy',
  'sesame',
  'gluten',
  'sulfites',
  'mustard',
]);
export type Allergen = z.infer<typeof AllergenSchema>;

export const RecipeDifficultySchema = z.enum(['easy', 'medium', 'advanced']);
export type RecipeDifficulty = z.infer<typeof RecipeDifficultySchema>;

export const RecipeCostTierSchema = z.enum(['budget', 'moderate', 'premium']);
export type RecipeCostTier = z.infer<typeof RecipeCostTierSchema>;

/** Structured categories for recipe classification. */
export const RecipeCategorySchema = z.enum([
  'bowl',
  'salad',
  'soup',
  'stew',
  'sandwich',
  'wrap',
  'stir_fry',
  'sheet_pan',
  'one_pot',
  'skillet',
  'casserole',
  'slow_cooker',
  'instant_pot',
  'smoothie',
  'baked',
  'grilled',
  'raw',
  'meal_prep',
  'batch_cook',
  'appetizer',
  'side_dish',
  'dessert',
]);
export type RecipeCategory = z.infer<typeof RecipeCategorySchema>;

/** Equipment a recipe requires. */
export const RecipeEquipmentSchema = z.enum([
  'oven',
  'stovetop',
  'blender',
  'air_fryer',
  'slow_cooker',
  'instant_pot',
  'grill',
  'sheet_pan',
  'skillet',
  'food_processor',
  'microwave',
  'no_cook',
]);
export type RecipeEquipment = z.infer<typeof RecipeEquipmentSchema>;

/** Interaction types for recipe engagement tracking. */
export const RecipeInteractionTypeSchema = z.enum([
  'viewed',
  'saved',
  'cooked',
  'rated',
  'skipped',
]);
export type RecipeInteractionType = z.infer<typeof RecipeInteractionTypeSchema>;

export const RecipeIngredientSchema = z.object({
  text: z.string().min(1),
  name: z.string().optional(),
  amount: z.number().nonnegative().optional(),
  unit: z.string().optional(),
  amountInGrams: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  pantryCategory: z.string().optional(),
  optional: z.boolean().optional(),
});

export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeInstructionStepSchema = z.object({
  title: z.string().optional(),
  text: z.string().min(1),
  position: z.number().int().positive().optional(),
});

export type RecipeInstructionStep = z.infer<typeof RecipeInstructionStepSchema>;

/**
 * Full per-serving nutrition aligned with the NutritionSchema used in meal_logs.
 * The four macro fields (calories, protein, carbohydrates, fat) are the baseline;
 * micronutrient fields are optional so existing/scraped recipes degrade gracefully.
 */
export const RecipeNutritionSchema = z.object({
  // --- Macros (baseline) ---
  calories: z.number().nonnegative().optional(),
  protein: z.number().nonnegative().optional(),
  carbohydrates: z.number().nonnegative().optional(),
  fat: z.number().nonnegative().optional(),
  // --- Extended micros (mirrors NutritionSchema from nutrition.ts) ---
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
});

export type RecipeNutrition = z.infer<typeof RecipeNutritionSchema>;

export const StoredRecipeSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  sourceKey: RecipeSourceKeySchema,
  sourceName: z.string().min(1),
  originalUrl: z.string().url().optional().nullable(),
  savedByUserId: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  summary: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  authorName: z.string().optional().nullable(),
  yieldText: z.string().optional().nullable(),
  servings: z.number().positive().optional().nullable(),
  servingUnit: z.string().optional().nullable(),
  prepTimeMinutes: z.number().int().nonnegative().optional().nullable(),
  cookTimeMinutes: z.number().int().nonnegative().optional().nullable(),
  totalTimeMinutes: z.number().int().nonnegative().optional().nullable(),
  mealTypes: z.array(RecipeMealTypeSchema).default([]),
  ingredientNames: z.array(z.string()).default([]),
  ingredients: z.array(RecipeIngredientSchema),
  instructions: z.array(RecipeInstructionStepSchema),
  nutrition: RecipeNutritionSchema.optional().nullable(),
  tags: z.array(z.string()).default([]),
  dietaryFlags: z.array(DietaryFlagSchema).default([]),
  allergens: z.array(AllergenSchema).default([]),
  cuisine: z.string().optional().nullable(),
  difficulty: RecipeDifficultySchema.optional().nullable(),
  categories: z.array(RecipeCategorySchema).default([]),
  estimatedCostTier: RecipeCostTierSchema.optional().nullable(),
  equipmentNeeded: z.array(RecipeEquipmentSchema).default([]),
  fetchedAt: z.string(),
});

export type StoredRecipe = z.infer<typeof StoredRecipeSchema>;

export const RecipeDetailResponseSchema = z.object({
  recipe: StoredRecipeSchema,
});

export type RecipeDetailResponse = z.infer<typeof RecipeDetailResponseSchema>;

export const RecipeInteractionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  recipeId: z.string().uuid(),
  interactionType: RecipeInteractionTypeSchema,
  rating: z.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().optional().nullable(),
  createdAt: z.string(),
});

export type RecipeInteraction = z.infer<typeof RecipeInteractionSchema>;
