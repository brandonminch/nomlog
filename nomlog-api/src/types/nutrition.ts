import { z } from 'zod';

export const IngredientSchema = z.object({
  name: z.string(),
  servingAmount: z.number(),
  servingUnit: z.string(),
  servingSizeGrams: z.number(),
  nutrition: z.object({
    calories: z.number(),
    fat: z.number(),
    protein: z.number(),
    carbohydrates: z.number(),
    fiber: z.number(),
    sugar: z.number(),
    sodium: z.number(),
    saturatedFat: z.number(),
    potassium: z.number(),
    cholesterol: z.number(),
    calcium: z.number(),
    iron: z.number(),
    vitaminA: z.number(),
    vitaminC: z.number(),
    vitaminD: z.number(),
    magnesium: z.number()
  })
});

export const NutritionSchema = z.object({
  name: z.string(),
  description: z.string(),
  totalNutrition: z.object({
    calories: z.number(),
    fat: z.number(),
    protein: z.number(),
    carbohydrates: z.number(),
    fiber: z.number(),
    sugar: z.number(),
    sodium: z.number(),
    saturatedFat: z.number(),
    potassium: z.number(),
    cholesterol: z.number(),
    calcium: z.number(),
    iron: z.number(),
    vitaminA: z.number(),
    vitaminC: z.number(),
    vitaminD: z.number(),
    magnesium: z.number()
  }),
  ingredients: z.array(IngredientSchema)
});

export type NutritionData = z.infer<typeof NutritionSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>; 