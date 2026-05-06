import type { RecipeDbRow, RecipeFormState } from "@/lib/recipes/types"

function jsonCell(value: unknown, fallback: unknown): string {
  try {
    return JSON.stringify(value ?? fallback, null, 2)
  } catch {
    return JSON.stringify(fallback, null, 2)
  }
}

export function recipeRowToFormState(row: RecipeDbRow): RecipeFormState {
  return {
    sourceKey: row.source_key ?? "",
    sourceName: row.source_name ?? "",
    originalUrl: row.original_url ?? "",
    canonicalUrl: row.canonical_url ?? "",
    savedByUserId: row.saved_by_user_id ?? "",
    title: row.title ?? "",
    summary: row.summary ?? "",
    imageUrl: row.image_url ?? "",
    authorName: row.author_name ?? "",
    yieldText: row.yield_text ?? "",
    servings: row.servings != null ? String(row.servings) : "",
    servingUnit: row.serving_unit ?? "",
    prepTimeMinutes:
      row.prep_time_minutes != null ? String(row.prep_time_minutes) : "",
    cookTimeMinutes:
      row.cook_time_minutes != null ? String(row.cook_time_minutes) : "",
    totalTimeMinutes:
      row.total_time_minutes != null ? String(row.total_time_minutes) : "",
    cuisine: row.cuisine ?? "",
    difficulty: row.difficulty ?? "",
    estimatedCostTier: row.estimated_cost_tier ?? "",
    mealTypesJson: jsonCell(row.meal_types, []),
    ingredientNamesJson: jsonCell(row.ingredient_names, []),
    ingredientsJson: jsonCell(row.ingredients, []),
    instructionsJson: jsonCell(row.instructions, []),
    nutritionJson: jsonCell(row.nutrition, null),
    tagsJson: jsonCell(row.tags, []),
    dietaryFlagsJson: jsonCell(row.dietary_flags, []),
    allergensJson: jsonCell(row.allergens, []),
    categoriesJson: jsonCell(row.categories, []),
    equipmentNeededJson: jsonCell(row.equipment_needed, []),
  }
}
