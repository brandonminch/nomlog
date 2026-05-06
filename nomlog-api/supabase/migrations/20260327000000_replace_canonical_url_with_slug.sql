-- Migration: Replace canonical_url with slug on recipes table
-- canonical_url was a synthetic internal URL used only for uniqueness.
-- slug is cleaner, URL-safe, and decouples identity from URL structure.

-- 1. Add slug column (nullable initially so we can populate it)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Populate slug from canonical_url
--    Internal recipes: "https://recipes.nomlog.local/black-bean-chili" → "black-bean-chili"
--    External/user-imported recipes: derive from the last path segment of the URL
UPDATE recipes
SET slug = CASE
  WHEN canonical_url LIKE 'https://recipes.nomlog.local/%'
    THEN ltrim(substring(canonical_url FROM 'https://recipes\.nomlog\.local/(.+)$'), '/')
  ELSE
    -- Take the last non-empty path segment, lowercased
    lower(regexp_replace(
      (regexp_split_to_array(rtrim(canonical_url, '/'), '/'))[array_upper(regexp_split_to_array(rtrim(canonical_url, '/'), '/'), 1)],
      '[^a-z0-9-]', '-', 'gi'
    ))
  END
WHERE slug IS NULL;

-- 3. For any remaining nulls (edge cases), fall back to a slug derived from the id
UPDATE recipes SET slug = 'recipe-' || id WHERE slug IS NULL OR slug = '';

-- 4. Enforce uniqueness: if any slug collisions exist (e.g. two external recipes
--    with the same last path segment), append a counter suffix
DO $$
DECLARE
  rec RECORD;
  counter INT;
  new_slug TEXT;
BEGIN
  FOR rec IN
    SELECT slug, array_agg(id ORDER BY fetched_at ASC) AS ids
    FROM recipes
    GROUP BY slug
    HAVING count(*) > 1
  LOOP
    counter := 1;
    -- Skip the first (oldest), rename the rest
    FOREACH new_slug IN ARRAY rec.ids[2:array_upper(rec.ids, 1)]
    LOOP
      UPDATE recipes SET slug = rec.slug || '-' || counter WHERE id = new_slug;
      counter := counter + 1;
    END LOOP;
  END LOOP;
END $$;

-- 5. Now enforce NOT NULL and UNIQUE
ALTER TABLE recipes ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recipes_slug_unique' AND conrelid = 'recipes'::regclass
  ) THEN
    ALTER TABLE recipes ADD CONSTRAINT recipes_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- 6. Add a btree index for slug lookups (unique constraint covers this, but explicit for clarity)
CREATE INDEX IF NOT EXISTS recipes_slug_idx ON recipes (slug);

-- 7. Drop the canonical_url column
ALTER TABLE recipes DROP COLUMN IF EXISTS canonical_url;
