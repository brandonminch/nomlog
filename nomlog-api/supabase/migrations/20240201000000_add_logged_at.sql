-- Migration: Add logged_at column to meal_logs table
-- This column allows users to specify when a meal was actually eaten,
-- separate from when the log was created in the system

ALTER TABLE meal_logs 
ADD COLUMN IF NOT EXISTS logged_at TIMESTAMP WITH TIME ZONE;

-- Add a comment to document the column
COMMENT ON COLUMN meal_logs.logged_at IS 'The timestamp when the meal was actually consumed, as specified by the user. If null, created_at is used.';
