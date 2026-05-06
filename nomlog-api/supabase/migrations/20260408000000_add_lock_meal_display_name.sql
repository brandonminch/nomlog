-- Preserve client-set meal name when async nutrition analysis completes
ALTER TABLE meal_logs
ADD COLUMN IF NOT EXISTS lock_meal_display_name BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN meal_logs.lock_meal_display_name IS
  'When true, async nutrition analysis must not overwrite meal_logs.name (user customized title before log).';
