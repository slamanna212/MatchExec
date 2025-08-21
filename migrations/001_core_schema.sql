-- Core MatchExec Database Schema
-- This migration creates the fundamental tables for the match management system

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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_modes (
  id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  scoring_type TEXT DEFAULT 'wins',
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

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_games_name ON games(name);
CREATE INDEX IF NOT EXISTS idx_game_modes_game_id ON game_modes(game_id);
CREATE INDEX IF NOT EXISTS idx_game_maps_game_id ON game_maps(game_id);
CREATE INDEX IF NOT EXISTS idx_game_maps_mode_id ON game_maps(mode_id, game_id);