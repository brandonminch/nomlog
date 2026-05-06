-- Migration: Add has_completed_onboarding flag to user_profiles
-- Indicates whether the user has explicitly reviewed and accepted
-- their onboarding selections.

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN user_profiles.has_completed_onboarding IS 'True when the user has reviewed and accepted onboarding results.';

