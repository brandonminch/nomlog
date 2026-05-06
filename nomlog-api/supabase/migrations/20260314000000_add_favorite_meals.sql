-- Favorite meals: user can mark meal_logs as favorites for quick re-logging in chat
CREATE TABLE IF NOT EXISTS favorite_meals (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_log_id UUID NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (user_id, meal_log_id)
);

CREATE INDEX IF NOT EXISTS favorite_meals_user_id_idx ON favorite_meals(user_id);
CREATE INDEX IF NOT EXISTS favorite_meals_meal_log_id_idx ON favorite_meals(meal_log_id);

ALTER TABLE favorite_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only access their own favorite meals" ON favorite_meals;
CREATE POLICY "Users can only access their own favorite meals"
  ON favorite_meals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
