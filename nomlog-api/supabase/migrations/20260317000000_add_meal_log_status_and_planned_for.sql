-- Add meal log status and planned_for time to support planned meals.
-- Planned meals should not count toward totals until explicitly converted to logged.

-- Enum for status (future-proof for more states later)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meal_log_status_type') THEN
    CREATE TYPE meal_log_status_type AS ENUM ('logged', 'planned');
  END IF;
END$$;

ALTER TABLE meal_logs
  ADD COLUMN IF NOT EXISTS status meal_log_status_type NOT NULL DEFAULT 'logged',
  ADD COLUMN IF NOT EXISTS planned_for TIMESTAMP WITH TIME ZONE;

-- Backfill existing rows (defensive; column default already covers future inserts)
UPDATE meal_logs SET status = 'logged' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS meal_logs_status_idx ON meal_logs(status);
CREATE INDEX IF NOT EXISTS meal_logs_planned_for_idx ON meal_logs(planned_for);

