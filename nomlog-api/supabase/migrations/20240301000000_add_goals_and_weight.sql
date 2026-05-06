-- Migration: Add daily nutrition goals and weight tracking to user_profiles table
-- This allows users to track their daily calorie and macro targets, as well as their current weight

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS daily_calorie_goal NUMERIC;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS daily_protein_goal NUMERIC;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS daily_carb_goal NUMERIC;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS daily_fat_goal NUMERIC;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS weight NUMERIC;

-- Add comments to document the units
COMMENT ON COLUMN user_profiles.daily_calorie_goal IS 'Daily calorie target in calories';
COMMENT ON COLUMN user_profiles.daily_protein_goal IS 'Daily protein target in grams';
COMMENT ON COLUMN user_profiles.daily_carb_goal IS 'Daily carbohydrate target in grams';
COMMENT ON COLUMN user_profiles.daily_fat_goal IS 'Daily fat target in grams';
COMMENT ON COLUMN user_profiles.weight IS 'Current weight in pounds (lbs)';
