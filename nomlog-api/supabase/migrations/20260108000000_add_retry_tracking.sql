-- Add retry tracking for failed meal log analyses
-- This allows us to track how many times an analysis has been retried
-- and mark logs as failed_max_retries after 3 attempts

-- Add 'failed_max_retries' to the analysis_status enum
ALTER TYPE analysis_status_type ADD VALUE IF NOT EXISTS 'failed_max_retries';

-- Add retry_count column to track number of retry attempts
ALTER TABLE meal_logs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0 NOT NULL;

-- Add index on retry_count for querying
CREATE INDEX IF NOT EXISTS meal_logs_retry_count_idx ON meal_logs(retry_count);

-- Add index on analysis_status and retry_count together for efficient querying
CREATE INDEX IF NOT EXISTS meal_logs_analysis_status_retry_count_idx ON meal_logs(analysis_status, retry_count);

