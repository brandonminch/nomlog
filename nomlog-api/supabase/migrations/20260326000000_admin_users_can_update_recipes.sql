-- Allow nomlog-web admins (rows in admin_users) to update recipe rows.
-- Inserts remain via service role / pipeline only unless a separate policy is added later.

DROP POLICY IF EXISTS "Admins can update recipes" ON recipes;
CREATE POLICY "Admins can update recipes"
  ON recipes
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()));
