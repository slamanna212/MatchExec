-- Voice Channel Auto-Creation Migration
-- Adds support for automatically creating and managing voice channels for matches

-- Add cleanup delay setting to discord_settings
-- Note: voice_channel_category_id already exists from migration 002
ALTER TABLE discord_settings ADD COLUMN voice_channel_cleanup_delay_minutes INTEGER DEFAULT 10;

-- Add match start delay for voice announcements
ALTER TABLE discord_settings ADD COLUMN match_start_delay_seconds INTEGER DEFAULT 5;

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

-- Fix discord_bot_requests schema
-- Remove duplicate columns (request_type, request_data) in favor of (type, data)
-- SQLite doesn't support dropping columns directly, so we need to recreate the table

-- Create new table with correct schema
CREATE TABLE IF NOT EXISTS discord_bot_requests_new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy existing data (using new columns if they have data, otherwise fall back to old columns)
INSERT INTO discord_bot_requests_new (id, type, data, result, status, retry_count, created_at, processed_at, updated_at)
SELECT
  id,
  COALESCE(type, request_type) as type,
  COALESCE(data, request_data) as data,
  result,
  status,
  retry_count,
  created_at,
  processed_at,
  updated_at
FROM discord_bot_requests;

-- Drop old table
DROP TABLE discord_bot_requests;

-- Rename new table to original name
ALTER TABLE discord_bot_requests_new RENAME TO discord_bot_requests;

-- Recreate the index
CREATE INDEX IF NOT EXISTS idx_discord_bot_requests_status ON discord_bot_requests(status);

-- Health Alerts Feature
-- Add health alerts notification type to discord channels
ALTER TABLE discord_channels ADD COLUMN send_health_alerts BOOLEAN DEFAULT 0;

-- Create table to track health alert rate limiting (one alert per issue per hour)
CREATE TABLE IF NOT EXISTS health_alerts_sent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,
  last_sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(alert_type)
);

-- Index for faster rate limit checks
CREATE INDEX IF NOT EXISTS idx_health_alerts_sent_alert_type ON health_alerts_sent(alert_type);

-- Add scheduler heartbeat tracking to app_settings
INSERT OR IGNORE INTO app_settings (setting_key, setting_value, data_type, metadata) VALUES
('scheduler_last_heartbeat', '', 'string', '{"description": "ISO timestamp of the last scheduler heartbeat for health monitoring"}');

-- Tournament Game Mode Selection
-- Allows tournaments to specify a game mode (e.g., 1v1, 2v2, 3v3) for consistent team sizes
ALTER TABLE tournaments ADD COLUMN game_mode_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tournaments_game_mode_id ON tournaments(game_mode_id);

-- Add max_players column to game_modes for FFA display
ALTER TABLE game_modes ADD COLUMN max_players INTEGER;

-- Reminder Queue Race Condition Prevention
-- Add unique constraint to prevent duplicate reminders for the same match
-- Excludes failed reminders since those might need to be retried
CREATE UNIQUE INDEX IF NOT EXISTS idx_discord_reminder_queue_unique_match_reminder
ON discord_reminder_queue(match_id, reminder_type)
WHERE status NOT IN ('failed');
