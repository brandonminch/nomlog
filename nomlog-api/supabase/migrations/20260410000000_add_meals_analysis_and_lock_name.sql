-- Favorite templates (meals): analysis lifecycle + optional locked display name (parity with meal_logs)

ALTER TABLE meals
ADD COLUMN IF NOT EXISTS analysis_status analysis_status_type NOT NULL DEFAULT 'completed';

ALTER TABLE meals
ADD COLUMN IF NOT EXISTS lock_meal_display_name BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN meals.analysis_status IS
  'Async nutrition analysis state for saved templates; mirrors meal_logs.analysis_status.';

COMMENT ON COLUMN meals.lock_meal_display_name IS
  'When true, async nutrition analysis must not overwrite meals.name (user customized title).';

CREATE INDEX IF NOT EXISTS meals_analysis_status_idx ON meals(analysis_status);

-- Realtime for template analysis completion in the app (idempotent for local resets)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE meals;
  END IF;
END$$;
