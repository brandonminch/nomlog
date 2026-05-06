CREATE TABLE IF NOT EXISTS recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  image_url TEXT,
  author_name TEXT,
  yield_text TEXT,
  prep_time_minutes INTEGER,
  cook_time_minutes INTEGER,
  total_time_minutes INTEGER,
  ingredients JSONB NOT NULL DEFAULT '[]',
  instructions JSONB NOT NULL DEFAULT '[]',
  nutrition JSONB,
  tags JSONB NOT NULL DEFAULT '[]',
  content_hash TEXT,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS recipes_source_key_idx ON recipes(source_key);
CREATE INDEX IF NOT EXISTS recipes_fetched_at_idx ON recipes(fetched_at DESC);

DROP TRIGGER IF EXISTS update_recipes_updated_at ON recipes;
CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read recipes" ON recipes;
CREATE POLICY "Authenticated users can read recipes"
  ON recipes
  FOR SELECT
  USING (auth.role() = 'authenticated');

ALTER TABLE meal_logs
  ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meal_logs_recipe_id_idx ON meal_logs(recipe_id);
