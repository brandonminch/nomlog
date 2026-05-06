-- Track planned-meal reminder sends to avoid duplicate notifications.

CREATE TABLE IF NOT EXISTS planned_reminder_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_log_id UUID NOT NULL REFERENCES meal_logs(id) ON DELETE CASCADE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, meal_log_id)
);

CREATE INDEX IF NOT EXISTS planned_reminder_sends_user_id_idx ON planned_reminder_sends(user_id);
CREATE INDEX IF NOT EXISTS planned_reminder_sends_meal_log_id_idx ON planned_reminder_sends(meal_log_id);

ALTER TABLE planned_reminder_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own planned reminder sends" ON planned_reminder_sends;
CREATE POLICY "Users can see their own planned reminder sends"
  ON planned_reminder_sends
  FOR SELECT
  USING (auth.uid() = user_id);

