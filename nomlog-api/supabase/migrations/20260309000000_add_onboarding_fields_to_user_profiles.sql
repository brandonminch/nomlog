-- Migration: Add conversational onboarding fields to user_profiles
-- Adds display_name and primary_goal used by the mobile app onboarding flow.

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS primary_goal TEXT;

COMMENT ON COLUMN user_profiles.display_name IS 'Preferred display name used in conversational UI';
COMMENT ON COLUMN user_profiles.primary_goal IS 'Primary health goal code (lose_weight, maintain_weight, build_muscle, track_intake, training_event)';

