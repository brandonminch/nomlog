-- Migration: Add adaptive TDEE support fields to user_profiles
-- These fields support tracking the initial static estimate, an adaptive
-- estimate learned over time, and the source + update timestamp.

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS initial_tdee_estimate NUMERIC,
ADD COLUMN IF NOT EXISTS adaptive_tdee_estimate NUMERIC,
ADD COLUMN IF NOT EXISTS tdee_source TEXT,
ADD COLUMN IF NOT EXISTS last_adaptive_tdee_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.initial_tdee_estimate IS 'Initial TDEE estimate from activity-based model at onboarding.';
COMMENT ON COLUMN user_profiles.adaptive_tdee_estimate IS 'Smoothed adaptive TDEE estimate learned from intake and weight trends.';
COMMENT ON COLUMN user_profiles.tdee_source IS 'Current TDEE source: static (activity-based) or adaptive.';
COMMENT ON COLUMN user_profiles.last_adaptive_tdee_updated_at IS 'Timestamp when adaptive TDEE was last updated.';

