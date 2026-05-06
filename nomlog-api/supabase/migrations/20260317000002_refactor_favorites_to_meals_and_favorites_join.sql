-- Refactor favorites from snapshot rows into:
-- - meals: canonical saved meals
-- - favorites: join table referencing meals
--
-- NOTE: This migration intentionally drops existing favorites data.

-- 1) Drop existing FK from meal_logs.favorite_id -> favorites(id) (snapshot table)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'meal_logs'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_name = 'meal_logs_favorite_id_fkey'
  ) THEN
    ALTER TABLE meal_logs DROP CONSTRAINT meal_logs_favorite_id_fkey;
  END IF;
END$$;

-- 2) Drop old favorites snapshot table (and any dependent objects)
DROP TABLE IF EXISTS favorites CASCADE;

-- 3) Create meals table (saved meal definitions)
CREATE TABLE IF NOT EXISTS meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  total_nutrition JSONB,
  ingredients JSONB NOT NULL DEFAULT '[]',
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS meals_user_id_idx ON meals(user_id);

DROP TRIGGER IF EXISTS update_meals_updated_at ON meals;
CREATE TRIGGER update_meals_updated_at
  BEFORE UPDATE ON meals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can only access their own meals" ON meals;
CREATE POLICY "Users can only access their own meals"
  ON meals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) Re-create favorites as join table (favorite instances)
CREATE TABLE IF NOT EXISTS favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_id UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, meal_id)
);

CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON favorites(user_id);
CREATE INDEX IF NOT EXISTS favorites_meal_id_idx ON favorites(meal_id);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can only access their own favorites" ON favorites;
CREATE POLICY "Users can only access their own favorites"
  ON favorites
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Since we intentionally drop existing favorites data, clear any legacy favorite_id
-- values on meal_logs before re-adding the FK constraint.
UPDATE meal_logs SET favorite_id = NULL WHERE favorite_id IS NOT NULL;

-- 5) Re-add FK from meal_logs.favorite_id -> favorites(id) (now join rows)
ALTER TABLE meal_logs
  ADD CONSTRAINT meal_logs_favorite_id_fkey
  FOREIGN KEY (favorite_id)
  REFERENCES favorites(id)
  ON DELETE SET NULL;

-- Recreate index (name may already exist from earlier migrations)
CREATE INDEX IF NOT EXISTS meal_logs_favorite_id_idx ON meal_logs(favorite_id);

