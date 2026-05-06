-- Async chat summary requests (background-safe chat).

CREATE TABLE IF NOT EXISTS chat_summary_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'error')) DEFAULT 'pending',
  payload JSONB,
  summary JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS chat_summary_requests_user_id_idx
  ON chat_summary_requests(user_id);

CREATE INDEX IF NOT EXISTS chat_summary_requests_status_idx
  ON chat_summary_requests(status);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS update_chat_summary_requests_updated_at ON chat_summary_requests;
CREATE TRIGGER update_chat_summary_requests_updated_at
  BEFORE UPDATE ON chat_summary_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE chat_summary_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can access their chat summary requests" ON chat_summary_requests;
CREATE POLICY "Users can access their chat summary requests"
  ON chat_summary_requests
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE chat_summary_requests IS
  'Async meal-chat summary generation requests; used to resume chat after app backgrounding.';

COMMENT ON COLUMN chat_summary_requests.payload IS
  'Original request payload (mealDescription + conversationHistory).';

COMMENT ON COLUMN chat_summary_requests.summary IS
  'Completed ConversationSummary JSON (when status=complete).';
