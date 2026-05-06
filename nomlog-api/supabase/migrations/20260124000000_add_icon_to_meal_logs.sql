-- Migration: Add icon column to meal_logs table
-- This column stores the Lucide icon name for the meal (e.g., pizza, coffee, utensils)
-- Defaults to utensils if not set

ALTER TABLE meal_logs 
ADD COLUMN IF NOT EXISTS icon TEXT;

COMMENT ON COLUMN meal_logs.icon IS 'Lucide icon name for the meal (e.g., pizza, coffee, utensils). Defaults to utensils if not set.';
