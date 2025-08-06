-- Consolidated database schema for MatchExec Match Bot
-- This migration includes all schema changes from previous migrations

-- Migration metadata
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  genre TEXT,
  developer TEXT,
  release_date DATE,
  version TEXT,
  description TEXT,
  min_players INTEGER,
  max_players INTEGER,
  icon_url TEXT,
  cover_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Game modes table
CREATE TABLE IF NOT EXISTS game_modes (
  id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Game maps table
CREATE TABLE IF NOT EXISTS game_maps (
  id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mode_id TEXT,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (mode_id, game_id) REFERENCES game_modes(id, game_id) ON DELETE SET NULL
);

-- Matches table (renamed from tournaments)
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  game_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  max_participants INTEGER NOT NULL DEFAULT 16,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'registration', 'ongoing', 'completed', 'cancelled')),
  start_date DATETIME,
  end_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Match participants table (renamed from tournament_participants)
CREATE TABLE IF NOT EXISTS match_participants (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE(match_id, user_id)
);

-- Match games table (renamed from tournament_matches)
CREATE TABLE IF NOT EXISTS match_games (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  participant1_id TEXT NOT NULL,
  participant2_id TEXT NOT NULL,
  winner_id TEXT,
  map_id TEXT,
  mode_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ongoing', 'completed')),
  scheduled_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (participant1_id) REFERENCES match_participants(id),
  FOREIGN KEY (participant2_id) REFERENCES match_participants(id),
  FOREIGN KEY (winner_id) REFERENCES match_participants(id)
);

-- Data seeding tracking table
CREATE TABLE IF NOT EXISTS data_versions (
  game_id TEXT PRIMARY KEY,
  data_version TEXT NOT NULL,
  seeded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Discord settings table
CREATE TABLE IF NOT EXISTS discord_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT,
  bot_token TEXT,
  guild_id TEXT,
  announcement_channel_id TEXT,
  results_channel_id TEXT,
  participant_role_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Discord settings trigger
CREATE TRIGGER IF NOT EXISTS discord_settings_updated_at 
  AFTER UPDATE ON discord_settings
  FOR EACH ROW
BEGIN
  UPDATE discord_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Scheduler settings table
CREATE TABLE IF NOT EXISTS scheduler_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_check_cron TEXT DEFAULT '0 */5 * * * *',
  reminder_check_cron TEXT DEFAULT '0 0 */4 * * *',
  cleanup_check_cron TEXT DEFAULT '0 0 2 * * *',
  report_generation_cron TEXT DEFAULT '0 0 0 * * 0',
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scheduler settings trigger
CREATE TRIGGER IF NOT EXISTS scheduler_settings_updated_at 
  AFTER UPDATE ON scheduler_settings
  FOR EACH ROW
BEGIN
  UPDATE scheduler_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_matches_guild_id ON matches(guild_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id ON match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_games_match_id ON match_games(match_id);
CREATE INDEX IF NOT EXISTS idx_match_games_status ON match_games(status);

-- Insert default settings rows
INSERT INTO discord_settings (id) VALUES (1) ON CONFLICT(id) DO NOTHING;
INSERT INTO scheduler_settings (id) VALUES (1) ON CONFLICT(id) DO NOTHING;