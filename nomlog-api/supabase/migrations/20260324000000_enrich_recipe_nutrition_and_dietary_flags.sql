-- P0: Align recipe nutrition with full 16-nutrient schema used in meal_logs
-- and add structured dietary/allergen classification columns.

-- ============================================================
-- 1. Expand the nutrition JSONB to include micronutrients.
--    Existing rows keep their current JSONB values; the application
--    layer treats missing keys as null/unknown.
--    No ALTER needed — the JSONB column already accepts any shape.
--    We document the expected schema here for clarity:
--
--    nutrition: {
--      calories, fat, protein, carbohydrates,       (existing)
--      fiber, sugar, sodium, saturatedFat,           (new)
--      potassium, cholesterol, calcium, iron,        (new)
--      vitaminA, vitaminC, vitaminD, magnesium       (new)
--    }
-- ============================================================

-- ============================================================
-- 2. Add structured dietary flags and allergen columns.
-- ============================================================

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS dietary_flags JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS allergens JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS cuisine TEXT,
  ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'advanced'));

-- GIN indexes for containment queries (@> operator):
--   e.g. WHERE dietary_flags @> '["vegan"]'
CREATE INDEX IF NOT EXISTS recipes_dietary_flags_idx ON recipes USING GIN (dietary_flags);
CREATE INDEX IF NOT EXISTS recipes_allergens_idx ON recipes USING GIN (allergens);

-- B-tree for equality/range on cuisine and difficulty:
CREATE INDEX IF NOT EXISTS recipes_cuisine_idx ON recipes (cuisine);
CREATE INDEX IF NOT EXISTS recipes_difficulty_idx ON recipes (difficulty);

-- ============================================================
-- Controlled vocabulary reference (enforced at application layer):
--
-- dietary_flags:
--   vegetarian, vegan, pescatarian, gluten_free, dairy_free,
--   keto, paleo, whole30, low_fodmap, nut_free, soy_free,
--   egg_free, sugar_free, low_sodium, high_protein, low_carb,
--   high_fiber, mediterranean
--
-- allergens (Top-9 US allergens + common extras):
--   dairy, eggs, fish, shellfish, tree_nuts, peanuts,
--   wheat, soy, sesame, gluten, sulfites, mustard
-- ============================================================
