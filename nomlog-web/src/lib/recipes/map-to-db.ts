import type { RecipeFormState } from "@/lib/recipes/types"

function parseJsonField<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error(`Invalid JSON in ${label}`)
  }
}

function optInt(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  if (Number.isNaN(n)) throw new Error(`Invalid integer: ${s}`)
  return n
}

function optUuid(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuid.test(t)) throw new Error(`Invalid UUID for saved by user: ${t}`)
  return t
}

/** Build snake_case payload for `recipes.update`. */
export function formStateToUpdatePayload(form: RecipeFormState) {
  const title = form.title.trim()
  const canonicalUrl = form.canonicalUrl.trim()
  const sourceKey = form.sourceKey.trim()
  const sourceName = form.sourceName.trim()

  if (!title) throw new Error("Title is required")
  if (!canonicalUrl) throw new Error("Canonical URL is required")
  if (!sourceKey) throw new Error("Source key is required")
  if (!sourceName) throw new Error("Source name is required")

  const meal_types = parseJsonField<unknown[]>(form.mealTypesJson, "meal types")
  const ingredient_names = parseJsonField<unknown[]>(
    form.ingredientNamesJson,
    "ingredient names"
  )
  const ingredients = parseJsonField<unknown[]>(
    form.ingredientsJson,
    "ingredients"
  )
  const instructions = parseJsonField<unknown[]>(
    form.instructionsJson,
    "instructions"
  )
  const nutritionTrim = form.nutritionJson.trim()
  let nutrition: Record<string, unknown> | null = null
  if (nutritionTrim) {
    try {
      const parsed = JSON.parse(nutritionTrim) as unknown
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        nutrition = parsed as Record<string, unknown>
      } else if (parsed !== null) {
        throw new Error("Nutrition must be a JSON object or null")
      }
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error("Invalid JSON in nutrition")
      throw e
    }
  }
  const tags = parseJsonField<unknown[]>(form.tagsJson, "tags")
  const dietary_flags = parseJsonField<unknown[]>(
    form.dietaryFlagsJson,
    "dietary flags"
  )
  const allergens = parseJsonField<unknown[]>(form.allergensJson, "allergens")
  const categories = parseJsonField<unknown[]>(form.categoriesJson, "categories")
  const equipment_needed = parseJsonField<unknown[]>(
    form.equipmentNeededJson,
    "equipment needed"
  )

  return {
    source_key: sourceKey,
    source_name: sourceName,
    original_url: form.originalUrl.trim() || null,
    canonical_url: canonicalUrl,
    saved_by_user_id: optUuid(form.savedByUserId),
    title,
    summary: form.summary.trim() || null,
    image_url: form.imageUrl.trim() || null,
    author_name: form.authorName.trim() || null,
    yield_text: form.yieldText.trim() || null,
    servings: optInt(form.servings),
    serving_unit: form.servingUnit.trim() || null,
    prep_time_minutes: optInt(form.prepTimeMinutes),
    cook_time_minutes: optInt(form.cookTimeMinutes),
    total_time_minutes: optInt(form.totalTimeMinutes),
    meal_types,
    ingredient_names,
    ingredients,
    instructions,
    nutrition,
    tags,
    dietary_flags,
    allergens,
    cuisine: form.cuisine.trim() || null,
    difficulty: form.difficulty.trim() || null,
    categories,
    estimated_cost_tier: form.estimatedCostTier.trim() || null,
    equipment_needed,
  }
}
