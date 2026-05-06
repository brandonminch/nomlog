-- Support multiple meal photos per log (up to 4 in app).
-- Keep the existing single-column for backward compatibility.

ALTER TABLE meal_logs
  ADD COLUMN IF NOT EXISTS photo_storage_paths TEXT[];

COMMENT ON COLUMN meal_logs.photo_storage_paths IS
  'Supabase Storage object paths for attached meal photos (max 4), e.g. {userId}/{file}.jpg';

CREATE INDEX IF NOT EXISTS meal_logs_photo_storage_paths_gin_idx
  ON meal_logs USING GIN (photo_storage_paths);
