ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS original_url TEXT,
  ADD COLUMN IF NOT EXISTS saved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS recipes_saved_by_user_id_idx ON recipes(saved_by_user_id);
