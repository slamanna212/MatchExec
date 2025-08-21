-- Match Management System Tables
-- This migration creates all tables related to matches, participants, and match execution

-- Core matches table
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  game_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  max_participants INTEGER NOT NULL DEFAULT 16,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'gather', 'assign', 'battle', 'complete', 'cancelled')),
  start_date DATETIME,
  end_date DATETIME,
  rules TEXT,
  prize TEXT,
  entry_fee TEXT,
  rounds INTEGER,
  maps TEXT,
  format TEXT DEFAULT 'bracket',
  player_notifications BOOLEAN DEFAULT 0,
  announcements TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Match participants
CREATE TABLE IF NOT EXISTS match_participants (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  discord_user_id TEXT,
  signup_date DATETIME,
  signup_type TEXT,
  signup_data TEXT,
  team_assignment TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE(match_id, user_id)
);

-- Individual match games/rounds
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

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_matches_guild_id ON matches(guild_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_start_date ON matches(start_date);
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id ON match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_discord_user_id ON match_participants(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_match_games_match_id ON match_games(match_id);
CREATE INDEX IF NOT EXISTS idx_match_games_status ON match_games(status);