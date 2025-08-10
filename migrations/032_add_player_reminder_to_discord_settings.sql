-- Add player_reminder_minutes field to discord_settings table
ALTER TABLE discord_settings ADD COLUMN player_reminder_minutes INTEGER DEFAULT 120;