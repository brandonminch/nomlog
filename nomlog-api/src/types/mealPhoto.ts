import { z } from 'zod';

export const MealPhotoAnalysisSchema = z.object({
  isMeal: z.boolean(),
  mealDescription: z.string(),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
  assumptions: z.array(z.string()).default([]),
  nonMealReason: z.string().nullable().optional(),
});

export type MealPhotoAnalysis = z.infer<typeof MealPhotoAnalysisSchema>;
