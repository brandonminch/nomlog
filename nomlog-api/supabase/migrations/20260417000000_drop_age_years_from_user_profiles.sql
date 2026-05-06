-- Age is derived from date_of_birth in application code; remove redundant column.

ALTER TABLE user_profiles
DROP COLUMN IF EXISTS age_years;
