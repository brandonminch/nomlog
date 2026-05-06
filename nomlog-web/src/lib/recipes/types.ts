/** Row shape from `recipes` table (Supabase / PostgREST). */
export type RecipeDbRow = {
  id: string
  source_key: string
  source_name: string
  canonical_url: string
  original_url: string | null
  saved_by_user_id: string | null
  title: string
  summary: string | null
  image_url: string | null
  author_name: string | null
  yield_text: string | null
  servings: number | null
  serving_unit: string | null
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  total_time_minutes: number | null
  meal_types: unknown
  ingredient_names: unknown
  ingredients: unknown
  instructions: unknown
  nutrition: unknown
  tags: unknown
  dietary_flags: unknown
  allergens: unknown
  cuisine: string | null
  difficulty: string | null
  categories: unknown
  estimated_cost_tier: string | null
  equipment_needed: unknown
  content_hash: string | null
  fetched_at: string
  created_at: string
  updated_at: string
}

/** Client form: scalars as strings for controlled inputs; JSON columns as formatted strings. */
export type RecipeFormState = {
  sourceKey: string
  sourceName: string
  originalUrl: string
  canonicalUrl: string
  savedByUserId: string
  title: string
  summary: string
  imageUrl: string
  authorName: string
  yieldText: string
  servings: string
  servingUnit: string
  prepTimeMinutes: string
  cookTimeMinutes: string
  totalTimeMinutes: string
  cuisine: string
  difficulty: string
  estimatedCostTier: string
  mealTypesJson: string
  ingredientNamesJson: string
  ingredientsJson: string
  instructionsJson: string
  nutritionJson: string
  tagsJson: string
  dietaryFlagsJson: string
  allergensJson: string
  categoriesJson: string
  equipmentNeededJson: string
}
