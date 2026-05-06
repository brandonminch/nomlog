-- Membership tiers and user membership assignments.
-- Defaults all users to the free tier and enables membership-based token limits.

CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    daily_token_limit INTEGER NOT NULL CHECK (daily_token_limit > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    CONSTRAINT memberships_slug_check CHECK (slug IN ('free', 'premium'))
);

CREATE INDEX IF NOT EXISTS memberships_slug_idx ON memberships (slug);

DROP TRIGGER IF EXISTS update_memberships_updated_at ON memberships;
CREATE TRIGGER update_memberships_updated_at
    BEFORE UPDATE ON memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS user_memberships (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS user_memberships_membership_id_idx ON user_memberships (membership_id);

DROP TRIGGER IF EXISTS update_user_memberships_updated_at ON user_memberships;
CREATE TRIGGER update_user_memberships_updated_at
    BEFORE UPDATE ON user_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO memberships (slug, name, daily_token_limit)
VALUES
    ('free', 'Free', 100000),
    ('premium', 'Premium', 500000)
ON CONFLICT (slug) DO UPDATE
SET
    name = EXCLUDED.name,
    daily_token_limit = EXCLUDED.daily_token_limit,
    updated_at = TIMEZONE('utc'::text, NOW());

INSERT INTO user_memberships (user_id, membership_id)
SELECT au.id, m.id
FROM auth.users au
JOIN memberships m ON m.slug = 'free'
WHERE NOT EXISTS (
    SELECT 1
    FROM user_memberships um
    WHERE um.user_id = au.id
);

CREATE OR REPLACE FUNCTION public.assign_default_user_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    free_membership_id UUID;
BEGIN
    SELECT id INTO free_membership_id
    FROM memberships
    WHERE slug = 'free'
    LIMIT 1;

    IF free_membership_id IS NULL THEN
        RAISE EXCEPTION 'Default membership tier "free" not found';
    END IF;

    INSERT INTO user_memberships (user_id, membership_id)
    VALUES (NEW.id, free_membership_id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_assign_default_membership ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_default_membership
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.assign_default_user_membership();

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read memberships" ON memberships;
CREATE POLICY "Authenticated users can read memberships"
    ON memberships
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Users can read own user membership" ON user_memberships;
CREATE POLICY "Users can read own user membership"
    ON user_memberships
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

COMMENT ON TABLE memberships IS 'Catalog of subscription tiers and token limits.';
COMMENT ON TABLE user_memberships IS 'Current membership assignment for each user.';
