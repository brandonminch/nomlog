ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS servings INTEGER,
  ADD COLUMN IF NOT EXISTS serving_unit TEXT,
  ADD COLUMN IF NOT EXISTS meal_types JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ingredient_names JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS recipes_meal_types_idx ON recipes USING GIN (meal_types);
CREATE INDEX IF NOT EXISTS recipes_ingredient_names_idx ON recipes USING GIN (ingredient_names);
