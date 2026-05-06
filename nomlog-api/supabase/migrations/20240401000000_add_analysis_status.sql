-- Add analysis status and make nutrition fields nullable for async analysis
-- This allows meals to be saved immediately with conversation summary, then nutrition calculated async

-- Create enum for analysis status
CREATE TYPE analysis_status_type AS ENUM ('pending', 'analyzing', 'completed', 'failed');

-- Add analysis_status column with default 'pending'
ALTER TABLE meal_logs ADD COLUMN analysis_status analysis_status_type DEFAULT 'pending' NOT NULL;

-- Add original_description to store raw user input
ALTER TABLE meal_logs ADD COLUMN original_description TEXT;

-- Make nutrition fields nullable (will be populated during async analysis)
ALTER TABLE meal_logs ALTER COLUMN total_nutrition DROP NOT NULL;
ALTER TABLE meal_logs ALTER COLUMN ingredients DROP NOT NULL;
ALTER TABLE meal_logs ALTER COLUMN name DROP NOT NULL;

-- Add index on analysis_status for querying pending analyses
CREATE INDEX meal_logs_analysis_status_idx ON meal_logs(analysis_status);

-- Update existing records to have 'completed' status (they already have nutrition data)
UPDATE meal_logs SET analysis_status = 'completed' WHERE total_nutrition IS NOT NULL;



