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

-- Voice Announcement Timeout and Retry Support
-- Adds columns to track retries and timeouts for voice announcements
ALTER TABLE discord_voice_announcement_queue ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE discord_voice_announcement_queue ADD COLUMN timeout_at DATETIME;
ALTER TABLE discord_voice_announcement_queue ADD COLUMN first_attempted_at DATETIME;

-- Foreign Key Support and Tournament Match Cleanup
-- Recreate matches table with proper ON DELETE CASCADE for tournament_id
-- This enables automatic cleanup of Discord messages when tournaments are deleted

-- Disable foreign keys temporarily for migration
PRAGMA foreign_keys = OFF;

-- Create new matches table with correct foreign key constraints
CREATE TABLE IF NOT EXISTS matches_new (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  mode_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATETIME NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'gather', 'assign', 'battle', 'complete', 'cancelled')),
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,
  winner_team TEXT,
  map_codes TEXT,
  guild_id TEXT,
  channel_id TEXT,
  match_format TEXT DEFAULT 'casual',
  maps TEXT,
  rules TEXT,
  rounds INTEGER,
  livestream_link TEXT,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE CASCADE,
  bracket_type TEXT CHECK (bracket_type IN ('winners', 'losers', 'final')),
  bracket_round INTEGER,
  red_team_id TEXT REFERENCES tournament_teams(id),
  blue_team_id TEXT REFERENCES tournament_teams(id),
  tournament_round INTEGER,
  tournament_bracket_type TEXT,
  team1_name TEXT,
  team2_name TEXT,
  map_id TEXT REFERENCES game_maps(id)
);

-- Copy all existing data from old table to new table (explicitly listing columns)
INSERT INTO matches_new (
  id, game_id, mode_id, name, description, start_date, start_time, end_time, status,
  max_participants, current_participants, winner_team, map_codes, guild_id, channel_id,
  match_format, maps, rules, rounds, livestream_link, tournament_id, bracket_type,
  bracket_round, red_team_id, blue_team_id, tournament_round, tournament_bracket_type,
  team1_name, team2_name, map_id
)
SELECT
  id, game_id, mode_id, name, description, start_date, start_time, end_time, status,
  max_participants, current_participants, winner_team, map_codes, guild_id, channel_id,
  match_format, maps, rules, rounds, livestream_link, tournament_id, bracket_type,
  bracket_round, red_team_id, blue_team_id, tournament_round, tournament_bracket_type,
  team1_name, team2_name, map_id
FROM matches;

-- Drop old table
DROP TABLE matches;

-- Rename new table to original name
ALTER TABLE matches_new RENAME TO matches;

-- Recreate indexes for matches table
CREATE INDEX IF NOT EXISTS idx_matches_game_id ON matches(game_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);

-- Re-enable foreign keys (will be enabled by connection.ts going forward)
PRAGMA foreign_keys = ON;
