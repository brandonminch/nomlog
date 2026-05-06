-- Migration: Add biological sex, activity level, and nutrition targets to user_profiles

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS biological_sex TEXT,
ADD COLUMN IF NOT EXISTS activity_level TEXT,
ADD COLUMN IF NOT EXISTS tdee_kcal NUMERIC,
ADD COLUMN IF NOT EXISTS target_calories_kcal NUMERIC,
ADD COLUMN IF NOT EXISTS target_protein_g NUMERIC,
ADD COLUMN IF NOT EXISTS target_carb_g NUMERIC,
ADD COLUMN IF NOT EXISTS target_fat_g NUMERIC;

COMMENT ON COLUMN user_profiles.biological_sex IS 'Biological sex used for BMR calculation: male, female, or prefer_not_to_say (averaged)';
COMMENT ON COLUMN user_profiles.activity_level IS 'Activity multiplier key: sedentary, light, moderate, very, extra';
COMMENT ON COLUMN user_profiles.tdee_kcal IS 'Estimated total daily energy expenditure in kilocalories';
COMMENT ON COLUMN user_profiles.target_calories_kcal IS 'Daily calorie target in kilocalories after applying goal-based offset';
COMMENT ON COLUMN user_profiles.target_protein_g IS 'Daily protein target in grams';
COMMENT ON COLUMN user_profiles.target_carb_g IS 'Daily carbohydrate target in grams';
COMMENT ON COLUMN user_profiles.target_fat_g IS 'Daily fat target in grams';

