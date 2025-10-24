-- Voice Channel Auto-Creation Migration
-- Adds support for automatically creating and managing voice channels for matches

-- Add cleanup delay setting to discord_settings
-- Note: voice_channel_category_id already exists from migration 002
ALTER TABLE discord_settings ADD COLUMN voice_channel_cleanup_delay_minutes INTEGER DEFAULT 10;

-- Create table to track auto-created voice channels for cleanup
CREATE TABLE IF NOT EXISTS auto_voice_channels (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_auto_voice_channels_match_id ON auto_voice_channels(match_id);
CREATE INDEX IF NOT EXISTS idx_auto_voice_channels_channel_id ON auto_voice_channels(channel_id);
