-- Enable Supabase Realtime for meal_logs table
-- This allows the frontend to subscribe to changes and update the UI automatically
-- when meal analysis completes

ALTER PUBLICATION supabase_realtime ADD TABLE meal_logs;



