-- Migration: Add meal_type column to meal_logs table
-- Used to tag meals as breakfast, lunch, dinner, or snack for grouping (instead of inferring from time).
-- Existing rows stay NULL and continue to be bucketed by logged_at in the app.

ALTER TABLE meal_logs
ADD COLUMN IF NOT EXISTS meal_type TEXT;

ALTER TABLE meal_logs
DROP CONSTRAINT IF EXISTS meal_logs_meal_type_check;

ALTER TABLE meal_logs
ADD CONSTRAINT meal_logs_meal_type_check
CHECK (meal_type IS NULL OR meal_type IN ('breakfast', 'lunch', 'dinner', 'snack'));

COMMENT ON COLUMN meal_logs.meal_type IS 'Meal tag: breakfast, lunch, dinner, or snack. Used for grouping. NULL for legacy logs.';
