-- Add event_duration_minutes column to discord_settings table
-- Default to 45 minutes per round/map
ALTER TABLE discord_settings ADD COLUMN event_duration_minutes INTEGER DEFAULT 45;