-- Add match reminder minutes setting to discord_settings table
ALTER TABLE discord_settings ADD COLUMN match_reminder_minutes INTEGER DEFAULT 10;