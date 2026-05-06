-- Drop legacy single-photo reference column (feature not shipped; no backwards compatibility needed).

DROP INDEX IF EXISTS meal_logs_photo_storage_path_idx;

ALTER TABLE meal_logs
  DROP COLUMN IF EXISTS photo_storage_path;
