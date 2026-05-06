-- P1 + P2: Add categories, cost tier, equipment, recipe embeddings,
-- and recipe_interactions table.

-- ============================================================
-- P1: Categories column for structured recipe classification
--     e.g. ["bowl", "one-pot", "meal-prep", "sheet-pan", "salad"]
-- ============================================================

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS recipes_categories_idx ON recipes USING GIN (categories);

-- ============================================================
-- P2: Cost tier and equipment metadata
-- ============================================================

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS estimated_cost_tier TEXT CHECK (estimated_cost_tier IN ('budget', 'moderate', 'premium')),
  ADD COLUMN IF NOT EXISTS equipment_needed JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS recipes_estimated_cost_tier_idx ON recipes (estimated_cost_tier);
CREATE INDEX IF NOT EXISTS recipes_equipment_needed_idx ON recipes USING GIN (equipment_needed);

-- ============================================================
-- P1: Recipe embeddings for semantic search (mirrors meal_log_embeddings)
-- ============================================================

CREATE TABLE IF NOT EXISTS recipe_embeddings (
  recipe_id UUID PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS recipe_embeddings_embedding_idx
ON recipe_embeddings
USING hnsw (embedding vector_cosine_ops);

ALTER TABLE recipe_embeddings ENABLE ROW LEVEL SECURITY;

-- Recipes are publicly readable by authenticated users (matches recipes RLS)
DROP POLICY IF EXISTS "Authenticated users can read recipe embeddings" ON recipe_embeddings;
CREATE POLICY "Authenticated users can read recipe embeddings"
  ON recipe_embeddings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- RPC function for semantic recipe search
CREATE OR REPLACE FUNCTION search_recipe_embeddings(
  p_query_embedding TEXT,
  p_threshold FLOAT DEFAULT 0.65,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  summary TEXT,
  meal_types JSONB,
  dietary_flags JSONB,
  allergens JSONB,
  cuisine TEXT,
  difficulty TEXT,
  categories JSONB,
  total_time_minutes INTEGER,
  nutrition JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_query_embedding vector(1536);
BEGIN
  v_query_embedding := p_query_embedding::vector(1536);

  RETURN QUERY
  SELECT
    r.id,
    r.title,
    r.summary,
    r.meal_types,
    r.dietary_flags,
    r.allergens,
    r.cuisine,
    r.difficulty,
    r.categories,
    r.total_time_minutes,
    r.nutrition,
    1 - (re.embedding <=> v_query_embedding)::FLOAT AS similarity
  FROM recipe_embeddings re
  JOIN recipes r ON re.recipe_id = r.id
  WHERE 1 - (re.embedding <=> v_query_embedding)::FLOAT >= p_threshold
  ORDER BY re.embedding <=> v_query_embedding
  LIMIT p_limit;
END;
$$;

-- ============================================================
-- P2: Recipe interactions table for tracking user engagement
-- ============================================================

CREATE TABLE IF NOT EXISTS recipe_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('viewed', 'saved', 'cooked', 'rated', 'skipped')),
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Fast lookups by user + recipe, and by recipe for aggregation
CREATE INDEX IF NOT EXISTS recipe_interactions_user_id_idx ON recipe_interactions (user_id);
CREATE INDEX IF NOT EXISTS recipe_interactions_recipe_id_idx ON recipe_interactions (recipe_id);
CREATE INDEX IF NOT EXISTS recipe_interactions_user_recipe_idx ON recipe_interactions (user_id, recipe_id);
CREATE INDEX IF NOT EXISTS recipe_interactions_type_idx ON recipe_interactions (interaction_type);

-- Prevent duplicate saves/ratings per user per recipe (but allow multiple views/cooks)
CREATE UNIQUE INDEX IF NOT EXISTS recipe_interactions_unique_saved_idx
  ON recipe_interactions (user_id, recipe_id)
  WHERE interaction_type = 'saved';

CREATE UNIQUE INDEX IF NOT EXISTS recipe_interactions_unique_rated_idx
  ON recipe_interactions (user_id, recipe_id)
  WHERE interaction_type = 'rated';

ALTER TABLE recipe_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own recipe interactions" ON recipe_interactions;
CREATE POLICY "Users can manage their own recipe interactions"
  ON recipe_interactions
  FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Controlled vocabulary reference (enforced at application layer):
--
-- categories:
--   bowl, salad, soup, stew, sandwich, wrap, stir_fry, sheet_pan,
--   one_pot, skillet, casserole, slow_cooker, instant_pot,
--   smoothie, baked, grilled, raw, meal_prep, batch_cook,
--   appetizer, side_dish, dessert
--
-- equipment_needed:
--   oven, stovetop, blender, air_fryer, slow_cooker,
--   instant_pot, grill, sheet_pan, skillet, food_processor,
--   microwave, no_cook
--
-- estimated_cost_tier:
--   budget    — most ingredients under ~$2/serving
--   moderate  — typical grocery cost ~$2-5/serving
--   premium   — specialty ingredients or >$5/serving
-- ============================================================
