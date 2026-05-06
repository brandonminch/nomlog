import { z } from 'zod';
import { RecipeSourceKeySchema } from './recipe';

export const PlannerMealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type PlannerMealSlot = z.infer<typeof PlannerMealSlotSchema>;

export const PlannerSuggestionNutritionSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbohydrates: z.number().nonnegative(),
  fat: z.number().nonnegative(),
});

export const PlannerRecipeMetaSchema = z.object({
  recipeId: z.string().uuid(),
  sourceKey: RecipeSourceKeySchema,
  sourceName: z.string().min(1),
  slug: z.string().min(1),
  imageUrl: z.string().url().optional().nullable(),
  yieldText: z.string().optional().nullable(),
  totalTimeMinutes: z.number().int().nonnegative().optional().nullable(),
});

export const PlannerSuggestionOptionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  whyItFits: z.string().min(1),
  mealType: PlannerMealSlotSchema.optional(),
  prepTimeMinutes: z.number().int().nonnegative().optional(),
  nutrition: PlannerSuggestionNutritionSchema,
  recipe: PlannerRecipeMetaSchema.optional(),
});

export const PlannerSuggestionsResponseSchema = z.object({
  personalizationNote: z.string().min(1),
  canPersonalize: z.boolean(),
  missingProfileFields: z.array(z.string()).default([]),
  options: z.array(PlannerSuggestionOptionSchema).max(4),
});

export type PlannerSuggestionOption = z.infer<typeof PlannerSuggestionOptionSchema>;
export type PlannerSuggestionsResponse = z.infer<typeof PlannerSuggestionsResponseSchema>;

export const PlannerSuggestionsRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  mealType: PlannerMealSlotSchema.optional(),
  date: z.string().datetime().optional(),
});

export type PlannerSuggestionsRequest = z.infer<typeof PlannerSuggestionsRequestSchema>;

export const PlannerWeekMealSchema = PlannerSuggestionOptionSchema.extend({
  slot: PlannerMealSlotSchema,
});

export const PlannerWeekDaySchema = z.object({
  date: z.string(),
  label: z.string(),
  meals: z.array(PlannerWeekMealSchema).min(1),
});

export const PlannerWeekResponseSchema = z.object({
  personalizationNote: z.string().min(1),
  canPersonalize: z.boolean(),
  missingProfileFields: z.array(z.string()).default([]),
  days: z.array(PlannerWeekDaySchema).min(1).max(7),
});

export const PlannerWeekRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  startDate: z.string().datetime().optional(),
  maxDays: z.number().int().min(1).max(7).default(7),
});

export type PlannerWeekMeal = z.infer<typeof PlannerWeekMealSchema>;
export type PlannerWeekDay = z.infer<typeof PlannerWeekDaySchema>;
export type PlannerWeekResponse = z.infer<typeof PlannerWeekResponseSchema>;
export type PlannerWeekRequest = z.infer<typeof PlannerWeekRequestSchema>;

export const PlannerReplaceRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  targetDate: z.string(),
  targetSlot: PlannerMealSlotSchema,
  currentMeal: PlannerWeekMealSchema,
  currentPlan: z.array(PlannerWeekDaySchema).min(1).max(7).optional(),
});

export const PlannerReplaceResponseSchema = z.object({
  note: z.string().min(1),
  targetDate: z.string(),
  targetSlot: PlannerMealSlotSchema,
  replacement: PlannerWeekMealSchema,
});

export type PlannerReplaceRequest = z.infer<typeof PlannerReplaceRequestSchema>;
export type PlannerReplaceResponse = z.infer<typeof PlannerReplaceResponseSchema>;
