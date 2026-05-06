-- Store a reference to an uploaded meal photo (Supabase Storage object path).
-- The app uploads to storage bucket `meal-photos` and sends `photoPath` to the API.

ALTER TABLE meal_logs
  ADD COLUMN IF NOT EXISTS photo_storage_path TEXT;

COMMENT ON COLUMN meal_logs.photo_storage_path IS
  'Supabase Storage object path for an attached meal photo, e.g. {userId}/{file}.jpg';

CREATE INDEX IF NOT EXISTS meal_logs_photo_storage_path_idx
  ON meal_logs(photo_storage_path);
