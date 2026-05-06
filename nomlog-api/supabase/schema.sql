-- Create a table for meal logs
CREATE TABLE meal_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    total_nutrition JSONB NOT NULL,
    ingredients JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    logged_at TIMESTAMP WITH TIME ZONE
);

-- Create an index on user_id for faster queries
CREATE INDEX meal_logs_user_id_idx ON meal_logs(user_id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER update_meal_logs_updated_at
    BEFORE UPDATE ON meal_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to only see their own meal logs
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
    daily_calorie_goal NUMERIC, -- Daily calorie target in calories
    daily_protein_goal NUMERIC, -- Daily protein target in grams
    daily_carb_goal NUMERIC,    -- Daily carbohydrate target in grams
    daily_fat_goal NUMERIC,     -- Daily fat target in grams
    weight NUMERIC,              -- Current weight in pounds (lbs)
    -- Conversational onboarding + normalized stats/targets
    display_name TEXT,
    primary_goal TEXT,
    date_of_birth DATE,
    height_cm NUMERIC,
    weight_kg NUMERIC,
    preferred_height_unit TEXT,
    preferred_weight_unit TEXT,
    biological_sex TEXT,
    activity_level TEXT,
    tdee_kcal NUMERIC,
    has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Keep updated_at fresh
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS and restrict access to owners
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
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
CREATE POLICY "Users can see their own reminder sends"
    ON reminder_sends
    FOR SELECT
    USING (auth.uid() = user_id);

-- Admin allowlist (see migration 20260325000000_add_admin_users.sql)
CREATE TABLE IF NOT EXISTS admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    notes TEXT
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own admin row"
    ON admin_users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);