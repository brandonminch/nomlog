-- Migration: Add physical stats fields for conversational onboarding (CO-004)
-- Normalized storage in SI units plus unit preferences for display.

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS age_years INTEGER,
ADD COLUMN IF NOT EXISTS height_cm NUMERIC,
ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,
ADD COLUMN IF NOT EXISTS preferred_height_unit TEXT,
ADD COLUMN IF NOT EXISTS preferred_weight_unit TEXT;

COMMENT ON COLUMN user_profiles.age_years IS 'User age in whole years (normalized from conversational input)';
COMMENT ON COLUMN user_profiles.height_cm IS 'User height in centimeters (normalized from conversational input)';
COMMENT ON COLUMN user_profiles.weight_kg IS 'User weight in kilograms (normalized from conversational input)';
COMMENT ON COLUMN user_profiles.preferred_height_unit IS 'Preferred height unit for display: cm or ft_in';
COMMENT ON COLUMN user_profiles.preferred_weight_unit IS 'Preferred weight unit for display: kg or lbs';

