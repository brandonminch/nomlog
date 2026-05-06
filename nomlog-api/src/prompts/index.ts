import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Active version per prompt; change here when promoting a new `vN.txt`. */
export const PROMPT_VERSIONS = {
  nutritionAnalysis: 'v1',
  mealSummary: 'v1',
  mealPhotoSummary: 'v1',
  mealPlannerSuggestions: 'v1',
  mealPlannerWeek: 'v1',
  mealPlannerReplace: 'v1',
  activitySummary: 'v1',
  activityBurn: 'v1',
  recipeEnrichment: 'v1',
} as const;

export type PromptKey = keyof typeof PROMPT_VERSIONS;

export function promptVersionFor(key: PromptKey): string {
  return PROMPT_VERSIONS[key];
}

function load(dir: string, version: string): string {
  const filePath = join(__dirname, dir, `${version}.txt`);
  if (!existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`);
  }
  return readFileSync(filePath, 'utf-8');
}

export const prompts = {
  nutritionAnalysis: load('nutrition-analysis', PROMPT_VERSIONS.nutritionAnalysis),
  mealSummary: load('meal-summary', PROMPT_VERSIONS.mealSummary),
  mealPhotoSummary: load('meal-photo-summary', PROMPT_VERSIONS.mealPhotoSummary),
  mealPlannerSuggestions: load('meal-planner-suggestions', PROMPT_VERSIONS.mealPlannerSuggestions),
  mealPlannerWeek: load('meal-planner-week', PROMPT_VERSIONS.mealPlannerWeek),
  mealPlannerReplace: load('meal-planner-replace', PROMPT_VERSIONS.mealPlannerReplace),
  activitySummary: load('activity-summary', PROMPT_VERSIONS.activitySummary),
  activityBurn: load('activity-burn', PROMPT_VERSIONS.activityBurn),
  recipeEnrichment: load('recipe-enrichment', PROMPT_VERSIONS.recipeEnrichment),
} as const;
