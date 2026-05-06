-- Add water_logs table for tracking daily water intake
-- Uses TEXT date format (YYYY-MM-DD) to avoid timezone complications

CREATE TABLE IF NOT EXISTS water_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date TEXT NOT NULL, -- Format: YYYY-MM-DD (avoids timezone issues)
    glasses INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Ensure one log per user per day
    UNIQUE(user_id, date)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS water_logs_user_id_date_idx ON water_logs(user_id, date);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS update_water_logs_updated_at ON water_logs;
CREATE TRIGGER update_water_logs_updated_at
    BEFORE UPDATE ON water_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;

-- Users can only access their own water logs
DROP POLICY IF EXISTS "Users can manage their water logs" ON water_logs;
CREATE POLICY "Users can manage their water logs"
    ON water_logs
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
