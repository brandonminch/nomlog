-- Favorite templates (meals): store photo paths for parity with meal_logs (up to 4 user-owned paths).

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS photo_storage_paths TEXT[];

COMMENT ON COLUMN meals.photo_storage_paths IS
  'Supabase Storage object paths for meal template photos (same convention as meal_logs; max 4 in API).';

CREATE INDEX IF NOT EXISTS meals_photo_storage_paths_gin_idx
  ON meals USING GIN (photo_storage_paths);
