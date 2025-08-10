-- Create Discord channels management table
CREATE TABLE IF NOT EXISTS discord_channels (
  id TEXT PRIMARY KEY,
  discord_channel_id TEXT NOT NULL UNIQUE,
  channel_name TEXT,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('text', 'voice')),
  -- Notification settings for text channels
  send_announcements BOOLEAN DEFAULT 0,
  send_reminders BOOLEAN DEFAULT 0,
  send_match_start BOOLEAN DEFAULT 0,
  send_signup_updates BOOLEAN DEFAULT 0,
  -- Metadata
  last_name_refresh DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for updated_at
CREATE TRIGGER IF NOT EXISTS discord_channels_updated_at 
  AFTER UPDATE ON discord_channels
  FOR EACH ROW
BEGIN
  UPDATE discord_channels SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_discord_channels_channel_id ON discord_channels(discord_channel_id);
CREATE INDEX IF NOT EXISTS idx_discord_channels_type ON discord_channels(channel_type);

-- Create scheduler settings for channel name refresh
-- First check if the columns exist in scheduler_settings
-- Add channel_refresh_cron column if it doesn't exist
ALTER TABLE scheduler_settings ADD COLUMN channel_refresh_cron TEXT DEFAULT '0 0 0 * * *';
