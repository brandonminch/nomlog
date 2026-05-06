-- Migration: Drop unused target_* columns from user_profiles now that
-- daily_*_goal fields are used as the canonical macro/calorie targets.

ALTER TABLE user_profiles
DROP COLUMN IF EXISTS target_calories_kcal,
DROP COLUMN IF EXISTS target_protein_g,
DROP COLUMN IF EXISTS target_carb_g,
DROP COLUMN IF EXISTS target_fat_g;

