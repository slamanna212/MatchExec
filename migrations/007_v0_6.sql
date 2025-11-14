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
