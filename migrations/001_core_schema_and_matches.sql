-- Core MatchExec Database Schema
-- Consolidated migration for core game data and match management system

-- Migration tracking
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Core game data tables
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
  max_signups INTEGER,
  icon_url TEXT,
  cover_url TEXT,
  color TEXT,
  supports_all_modes BOOLEAN DEFAULT 0,
  map_codes_supported INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_modes (
  id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  team_size INTEGER DEFAULT 1,
  max_teams INTEGER DEFAULT 2,
  scoring_type TEXT DEFAULT 'Normal',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_maps (
  id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mode_id TEXT,
  image_url TEXT,
  location TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (mode_id, game_id) REFERENCES game_modes(id, game_id) ON DELETE SET NULL
);

-- Data seeding tracking
CREATE TABLE IF NOT EXISTS data_versions (
  game_id TEXT PRIMARY KEY,
  data_version TEXT NOT NULL,
  seeded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Match management system
CREATE TABLE IF NOT EXISTS matches (
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
  event_image_url TEXT,
  player_notifications BOOLEAN DEFAULT 1,
  announcement_voice_channel TEXT,
  announcements BOOLEAN DEFAULT 1,
  blue_team_voice_channel TEXT,
  red_team_voice_channel TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (mode_id, game_id) REFERENCES game_modes(id, game_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS match_participants (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  discord_user_id TEXT,
  username TEXT NOT NULL,
  team TEXT,
  team_assignment TEXT,
  signup_data TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  receives_map_codes BOOLEAN DEFAULT 0,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE(match_id, user_id)
);

CREATE TABLE IF NOT EXISTS match_games (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  game_number INTEGER NOT NULL,
  map_id TEXT,
  team_a TEXT,
  team_b TEXT,
  winner_team TEXT,
  participant_winner_id TEXT,
  participant1_id TEXT,
  participant2_id TEXT,
  is_ffa_mode BOOLEAN DEFAULT 0,
  score_a INTEGER DEFAULT 0,
  score_b INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at DATETIME,
  completed_at DATETIME,
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE(match_id, game_number)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_games_name ON games(name);
CREATE INDEX IF NOT EXISTS idx_game_modes_game_id ON game_modes(game_id);
CREATE INDEX IF NOT EXISTS idx_game_maps_game_id ON game_maps(game_id);
CREATE INDEX IF NOT EXISTS idx_game_maps_mode_id ON game_maps(mode_id, game_id);

CREATE INDEX IF NOT EXISTS idx_matches_game_id ON matches(game_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);

CREATE INDEX IF NOT EXISTS idx_match_participants_match_id ON match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id ON match_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_match_games_match_id ON match_games(match_id);
CREATE INDEX IF NOT EXISTS idx_match_games_participant_winner ON match_games(participant_winner_id);
CREATE INDEX IF NOT EXISTS idx_match_games_participant1 ON match_games(participant1_id);
CREATE INDEX IF NOT EXISTS idx_match_games_participant2 ON match_games(participant2_id);
CREATE INDEX IF NOT EXISTS idx_match_games_ffa_mode ON match_games(is_ffa_mode);