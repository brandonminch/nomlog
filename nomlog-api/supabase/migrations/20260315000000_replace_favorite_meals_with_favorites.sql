-- Replace favorite_meals junction table with full favorites snapshot table.
-- Run this after 20260314000000_add_favorite_meals.sql (which created favorite_meals).

DROP TABLE IF EXISTS favorite_meals;

CREATE TABLE favorites (
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

CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON favorites(user_id);

DROP TRIGGER IF EXISTS update_favorites_updated_at ON favorites;
CREATE TRIGGER update_favorites_updated_at
  BEFORE UPDATE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only access their own favorites" ON favorites;
CREATE POLICY "Users can only access their own favorites"
  ON favorites
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE meal_logs
  ADD COLUMN IF NOT EXISTS favorite_id UUID REFERENCES favorites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meal_logs_favorite_id_idx ON meal_logs(favorite_id);
