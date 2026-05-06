-- Store calendar date of birth; application derives age using profile timezone.

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

COMMENT ON COLUMN user_profiles.date_of_birth IS 'Date of birth (date only). Age is computed in the API/app from this value.';

-- Best-effort backfill from legacy age_years: January 1 of (current UTC year - age).
UPDATE user_profiles
SET date_of_birth = make_date(
  (EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))::integer - age_years),
  1,
  1
)
WHERE age_years IS NOT NULL
  AND date_of_birth IS NULL;
