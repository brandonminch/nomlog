import { z } from 'zod';

export const ClarifyingQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(['portion', 'brand', 'prep', 'misc']),
  // OpenAI strict structured outputs: `.optional()` must be paired with `.nullable()`.
  options: z.array(z.string()).nullable().optional(),
});

export const ProvenanceSchema = z.object({
  source: z.enum(['llm_estimate']),
  id: z.string().nullable().optional(),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
});

export const IngredientWithProvSchema = z.object({
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
    magnesium: z.number(),
  }),
  provenance: ProvenanceSchema.default({ source: 'llm_estimate', confidence: 'medium' }),
});

export const ConversationAnalysisSchema = z.object({
  name: z.string(),
  description: z.string(),
  questionSummary: z.string().default(''),
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
    magnesium: z.number(),
  }),
  ingredients: z.array(IngredientWithProvSchema),
  questions: z.array(ClarifyingQuestionSchema).default([]),
  assumptions: z.array(z.string()).default([]),
});

export type ConversationAnalysis = z.infer<typeof ConversationAnalysisSchema>;
export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;

