import { z } from 'zod';
import { ClarifyingQuestionSchema, ProvenanceSchema } from './conversation';

export const MealSummaryIngredientSchema = z.object({
  name: z.string(),
  servingAmount: z.number(),
  servingUnit: z.string(),
  servingSizeGrams: z.number(),
  provenance: ProvenanceSchema,
});

export const MealSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  questionSummary: z.string().default(''),
  ingredients: z.array(MealSummaryIngredientSchema).default([]),
  questions: z.array(ClarifyingQuestionSchema).default([]),
  assumptions: z.array(z.string()).default([]),
});

export type MealSummary = z.infer<typeof MealSummarySchema>;



