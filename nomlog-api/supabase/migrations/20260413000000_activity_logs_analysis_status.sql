-- Async calorie burn analysis for activity logs (mirrors meal_logs.analysis_status).

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS analysis_status analysis_status_type NOT NULL DEFAULT 'completed';

COMMENT ON COLUMN activity_logs.analysis_status IS
  'Burn estimate state: pending until async analysis completes; HealthKit creates may use completed when calories are known.';

CREATE INDEX IF NOT EXISTS activity_logs_analysis_status_idx ON activity_logs(analysis_status);
