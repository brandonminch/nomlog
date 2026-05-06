-- Initial schema: Create meal_logs and user_profiles tables
-- This migration sets up the base schema for the application

-- Create a table for meal logs
CREATE TABLE IF NOT EXISTS meal_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    total_nutrition JSONB NOT NULL,
    ingredients JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create an index on user_id for faster queries
CREATE INDEX IF NOT EXISTS meal_logs_user_id_idx ON meal_logs(user_id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column
DROP TRIGGER IF EXISTS update_meal_logs_updated_at ON meal_logs;
CREATE TRIGGER update_meal_logs_updated_at
    BEFORE UPDATE ON meal_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to only see their own meal logs
DROP POLICY IF EXISTS "Users can only access their own meal logs" ON meal_logs;
CREATE POLICY "Users can only access their own meal logs"
    ON meal_logs
    FOR ALL
    USING (auth.uid() = user_id); 

-- User profiles for notification preferences and timezone
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    breakfast_time TEXT NOT NULL DEFAULT '08:00', -- HH:mm local time
    lunch_time TEXT NOT NULL DEFAULT '12:00',     -- HH:mm local time
    dinner_time TEXT NOT NULL DEFAULT '18:00',    -- HH:mm local time
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS and restrict access to owners
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their profile" ON user_profiles;
CREATE POLICY "Users can manage their profile"
    ON user_profiles
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Reminder send log to avoid duplicates
CREATE TABLE IF NOT EXISTS reminder_sends (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    meal TEXT NOT NULL CHECK (meal IN ('breakfast','lunch','dinner')),
    date DATE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, meal, date)
);

ALTER TABLE reminder_sends ENABLE ROW LEVEL SECURITY;
-- Users can see their own send history (optional)
DROP POLICY IF EXISTS "Users can see their own reminder sends" ON reminder_sends;
CREATE POLICY "Users can see their own reminder sends"
    ON reminder_sends
    FOR SELECT
    USING (auth.uid() = user_id);
