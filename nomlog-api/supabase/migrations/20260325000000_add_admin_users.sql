-- Admin allowlist for nomlog-web (and future admin tooling).
-- Rows are managed with the service role or SQL editor only; authenticated users may read their own row.

CREATE TABLE IF NOT EXISTS admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS admin_users_granted_at_idx ON admin_users (granted_at DESC);

COMMENT ON TABLE admin_users IS 'Users allowed to access Nomlog admin (nomlog-web). Grant/revoke via service role or dashboard SQL only.';

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see only their own membership row (for admin app checks).
CREATE POLICY "Users can read own admin row"
    ON admin_users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE for authenticated — use service_role or SQL editor.
