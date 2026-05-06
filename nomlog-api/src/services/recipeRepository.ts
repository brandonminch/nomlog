import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase';
import {
  Allergen,
  DietaryFlag,
  RecipeCategory,
  RecipeCostTier,
  RecipeDifficulty,
  RecipeEquipment,
  RecipeIngredient,
  RecipeInstructionStep,
  RecipeInteraction,
  RecipeInteractionSchema,
  RecipeInteractionType,
  RecipeMealType,
  RecipeNutrition,
  RecipeSourceKey,
  StoredRecipe,
  StoredRecipeSchema,
} from '../types/recipe';

type UpsertRecipeInput = {
  sourceKey: RecipeSourceKey;
  sourceName: string;
  slug: string;
  originalUrl?: string | null;
  savedByUserId?: string | null;
  title: string;
  summary?: string | null;
  imageUrl?: string | null;
  authorName?: string | null;
  yieldText?: string | null;
  servings?: number | null;
  servingUnit?: string | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  totalTimeMinutes?: number | null;
  mealTypes?: RecipeMealType[];
  ingredients: RecipeIngredient[];
  instructions: RecipeInstructionStep[];
  nutrition?: RecipeNutrition | null;
  tags?: string[];
  ingredientNames?: string[];
  dietaryFlags?: DietaryFlag[];
  allergens?: Allergen[];
  cuisine?: string | null;
  difficulty?: RecipeDifficulty | null;
  categories?: RecipeCategory[];
  estimatedCostTier?: RecipeCostTier | null;
  equipmentNeeded?: RecipeEquipment[];
};

type RecipeRow = {
  id: string;
  slug: string;
  source_key: RecipeSourceKey;
  source_name: string;
  original_url: string | null;
  saved_by_user_id: string | null;
  title: string;
  summary: string | null;
  image_url: string | null;
  author_name: string | null;
  yield_text: string | null;
  servings: number | null;
  serving_unit: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  meal_types: RecipeMealType[] | null;
  ingredient_names: string[] | null;
  ingredients: RecipeIngredient[];
  instructions: RecipeInstructionStep[];
  nutrition: RecipeNutrition | null;
  tags: string[] | null;
  dietary_flags: DietaryFlag[] | null;
  allergens: Allergen[] | null;
  cuisine: string | null;
  difficulty: RecipeDifficulty | null;
  categories: RecipeCategory[] | null;
  estimated_cost_tier: RecipeCostTier | null;
  equipment_needed: RecipeEquipment[] | null;
  fetched_at: string;
};

export class RecipeRepository {
  private readonly baseSelect =
    'id, slug, source_key, source_name, original_url, saved_by_user_id, title, summary, image_url, author_name, yield_text, servings, serving_unit, prep_time_minutes, cook_time_minutes, total_time_minutes, meal_types, ingredient_names, ingredients, instructions, nutrition, tags, dietary_flags, allergens, cuisine, difficulty, categories, estimated_cost_tier, equipment_needed, fetched_at';

  async getById(id: string): Promise<StoredRecipe | null> {
    const { data, error } = await supabaseAdmin
      .from('recipes')
      .select(this.baseSelect)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? this.mapRow(data as RecipeRow) : null;
  }

  async getBySlug(slug: string): Promise<StoredRecipe | null> {
    const { data, error } = await supabaseAdmin
      .from('recipes')
      .select(this.baseSelect)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    return data ? this.mapRow(data as RecipeRow) : null;
  }

  async upsert(input: UpsertRecipeInput): Promise<StoredRecipe> {
    const normalizedTags = Array.from(new Set((input.tags || []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 24);
    const normalizedMealTypes = Array.from(new Set((input.mealTypes || []).filter(Boolean)));
    const normalizedDietaryFlags = Array.from(new Set((input.dietaryFlags || []).filter(Boolean)));
    const normalizedAllergens = Array.from(new Set((input.allergens || []).filter(Boolean)));
    const normalizedCategories = Array.from(new Set((input.categories || []).filter(Boolean)));
    const normalizedEquipment = Array.from(new Set((input.equipmentNeeded || []).filter(Boolean)));
    const normalizedIngredientNames = Array.from(
      new Set(
        (input.ingredientNames || input.ingredients.map((ingredient) => ingredient.name || ''))
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean)
      )
    );
    const payload = {
      slug: input.slug,
      source_key: input.sourceKey,
      source_name: input.sourceName,
      original_url: input.originalUrl ?? null,
      saved_by_user_id: input.savedByUserId ?? null,
      title: input.title,
      summary: input.summary ?? null,
      image_url: input.imageUrl ?? null,
      author_name: input.authorName ?? null,
      yield_text: input.yieldText ?? null,
      servings: input.servings ?? null,
      serving_unit: input.servingUnit ?? null,
      prep_time_minutes: input.prepTimeMinutes ?? null,
      cook_time_minutes: input.cookTimeMinutes ?? null,
      total_time_minutes: input.totalTimeMinutes ?? null,
      meal_types: normalizedMealTypes,
      ingredient_names: normalizedIngredientNames,
      ingredients: input.ingredients,
      instructions: input.instructions,
      nutrition: input.nutrition ?? null,
      tags: normalizedTags,
      dietary_flags: normalizedDietaryFlags,
      allergens: normalizedAllergens,
      cuisine: input.cuisine ?? null,
      difficulty: input.difficulty ?? null,
      categories: normalizedCategories,
      estimated_cost_tier: input.estimatedCostTier ?? null,
      equipment_needed: normalizedEquipment,
      content_hash: this.computeContentHash({
        title: input.title,
        summary: input.summary ?? null,
        servings: input.servings ?? null,
        servingUnit: input.servingUnit ?? null,
        mealTypes: normalizedMealTypes,
        ingredientNames: normalizedIngredientNames,
        ingredients: input.ingredients,
        instructions: input.instructions,
        nutrition: input.nutrition ?? null,
      }),
      fetched_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('recipes')
      .upsert(payload, { onConflict: 'slug' })
      .select(this.baseSelect)
      .single();

    if (error) throw error;
    return this.mapRow(data as RecipeRow);
  }

  async searchInternalCatalog(args: {
    mealType?: RecipeMealType;
    maxResults?: number;
  }): Promise<StoredRecipe[]> {
    const query = supabaseAdmin
      .from('recipes')
      .select(this.baseSelect)
      .in('source_key', ['internal', 'user_import'])
      .order('title', { ascending: true })
      .limit(Math.max(args.maxResults ?? 50, 20));

    const { data, error } = await query;
    if (error) throw error;

    const recipes = (data || []).map((row) => this.mapRow(row as RecipeRow));

    if (!args.mealType) {
      return recipes;
    }

    return recipes.filter((recipe) => recipe.mealTypes.length === 0 || recipe.mealTypes.includes(args.mealType!));
  }

  async listAll(opts?: { sourceKey?: string; limit?: number; offset?: number }): Promise<StoredRecipe[]> {
    let query = supabaseAdmin
      .from('recipes')
      .select(this.baseSelect)
      .order('title', { ascending: true })
      .limit(opts?.limit ?? 500);

    if (opts?.offset) query = query.range(opts.offset, opts.offset + (opts?.limit ?? 500) - 1);
    if (opts?.sourceKey) query = query.eq('source_key', opts.sourceKey);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => this.mapRow(row as RecipeRow));
  }

  isFresh(recipe: StoredRecipe, maxAgeHours: number): boolean {
    const fetchedAt = new Date(recipe.fetchedAt).getTime();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    return Number.isFinite(fetchedAt) && Date.now() - fetchedAt <= maxAgeMs;
  }

  private mapRow(row: RecipeRow): StoredRecipe {
    return StoredRecipeSchema.parse({
      id: row.id,
      slug: row.slug,
      sourceKey: row.source_key,
      sourceName: row.source_name,
      originalUrl: row.original_url,
      savedByUserId: row.saved_by_user_id,
      title: row.title,
      summary: row.summary,
      imageUrl: row.image_url,
      authorName: row.author_name,
      yieldText: row.yield_text,
      servings: row.servings,
      servingUnit: row.serving_unit,
      prepTimeMinutes: row.prep_time_minutes,
      cookTimeMinutes: row.cook_time_minutes,
      totalTimeMinutes: row.total_time_minutes,
      mealTypes: row.meal_types || [],
      ingredientNames: row.ingredient_names || [],
      ingredients: row.ingredients || [],
      instructions: row.instructions || [],
      nutrition: row.nutrition,
      tags: row.tags || [],
      dietaryFlags: row.dietary_flags || [],
      allergens: row.allergens || [],
      cuisine: row.cuisine,
      difficulty: row.difficulty,
      categories: row.categories || [],
      estimatedCostTier: row.estimated_cost_tier,
      equipmentNeeded: row.equipment_needed || [],
      fetchedAt: row.fetched_at,
    });
  }

  private computeContentHash(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}

// ============================================================
// Recipe Interactions
// ============================================================

type InteractionRow = {
  id: string;
  user_id: string;
  recipe_id: string;
  interaction_type: RecipeInteractionType;
  rating: number | null;
  notes: string | null;
  created_at: string;
};

type RecordInteractionInput = {
  userId: string;
  recipeId: string;
  interactionType: RecipeInteractionType;
  rating?: number | null;
  notes?: string | null;
};

export class RecipeInteractionRepository {
  async record(input: RecordInteractionInput): Promise<RecipeInteraction> {
    const payload = {
      user_id: input.userId,
      recipe_id: input.recipeId,
      interaction_type: input.interactionType,
      rating: input.rating ?? null,
      notes: input.notes ?? null,
    };

    // For 'saved' and 'rated', upsert to enforce uniqueness
    if (input.interactionType === 'saved' || input.interactionType === 'rated') {
      const { data, error } = await supabaseAdmin
        .from('recipe_interactions')
        .upsert(payload, {
          onConflict: 'user_id, recipe_id',
          ignoreDuplicates: input.interactionType === 'saved',
        })
        .select('*')
        .single();

      if (error) throw error;
      return this.mapRow(data as InteractionRow);
    }

    const { data, error } = await supabaseAdmin
      .from('recipe_interactions')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return this.mapRow(data as InteractionRow);
  }

  async removeInteraction(userId: string, recipeId: string, interactionType: RecipeInteractionType): Promise<void> {
    const { error } = await supabaseAdmin
      .from('recipe_interactions')
      .delete()
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)
      .eq('interaction_type', interactionType);

    if (error) throw error;
  }

  async getUserInteractions(userId: string, recipeId: string): Promise<RecipeInteraction[]> {
    const { data, error } = await supabaseAdmin
      .from('recipe_interactions')
      .select('*')
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => this.mapRow(row as InteractionRow));
  }

  async getRecipeAggregates(recipeId: string): Promise<{
    viewCount: number;
    cookCount: number;
    saveCount: number;
    averageRating: number | null;
    ratingCount: number;
  }> {
    const { data, error } = await supabaseAdmin
      .from('recipe_interactions')
      .select('interaction_type, rating')
      .eq('recipe_id', recipeId);

    if (error) throw error;

    const rows = data || [];
    const viewCount = rows.filter((r) => r.interaction_type === 'viewed').length;
    const cookCount = rows.filter((r) => r.interaction_type === 'cooked').length;
    const saveCount = rows.filter((r) => r.interaction_type === 'saved').length;
    const ratings = rows.filter((r) => r.interaction_type === 'rated' && r.rating != null).map((r) => r.rating as number);
    const averageRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;

    return { viewCount, cookCount, saveCount, averageRating, ratingCount: ratings.length };
  }

  private mapRow(row: InteractionRow): RecipeInteraction {
    return RecipeInteractionSchema.parse({
      id: row.id,
      userId: row.user_id,
      recipeId: row.recipe_id,
      interactionType: row.interaction_type,
      rating: row.rating,
      notes: row.notes,
      createdAt: row.created_at,
    });
  }
}
