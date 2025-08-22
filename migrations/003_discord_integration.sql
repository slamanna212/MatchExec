-- Discord Integration Tables
-- This migration creates all Discord-related tables for bot functionality

-- Discord bot configuration
CREATE TABLE IF NOT EXISTS discord_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT,
  bot_token TEXT,
  guild_id TEXT,
  announcement_channel_id TEXT,
  announcement_voice_channel_id TEXT,
  results_channel_id TEXT,
  match_reminder_minutes INTEGER DEFAULT 60,
  player_reminder_minutes INTEGER DEFAULT 30,
  announcer_voice TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Discord channels cache
CREATE TABLE IF NOT EXISTS discord_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Discord voice settings
CREATE TABLE IF NOT EXISTS voices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  language TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voice_data_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  seeded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Discord message tracking
CREATE TABLE IF NOT EXISTS discord_match_messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'announcement',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE(match_id, message_type)
);

-- Discord event management
CREATE TABLE IF NOT EXISTS discord_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Voice channel management for teams
CREATE TABLE IF NOT EXISTS team_voice_channels (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_discord_messages_match_id ON discord_match_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_discord_messages_message_id ON discord_match_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_discord_events_match_id ON discord_events(match_id);
CREATE INDEX IF NOT EXISTS idx_team_voice_channels_match_id ON team_voice_channels(match_id);

-- Insert default settings
INSERT INTO discord_settings (id) VALUES (1) ON CONFLICT(id) DO NOTHING;