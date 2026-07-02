-- Phase 1b: Widen tournaments.format CHECK constraint to include 'cumulative-points'
-- SQLite cannot widen an existing CHECK constraint in place, so we rebuild the table.
-- Pattern follows migration 018 (matches table rebuild).

CREATE TABLE tournaments_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL CHECK (format IN ('single-elimination', 'double-elimination', 'cumulative-points')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'gather', 'assign', 'battle', 'complete', 'cancelled')),
  game_id TEXT NOT NULL,
  rounds_per_match INTEGER NOT NULL,
  ruleset TEXT NOT NULL DEFAULT 'casual' CHECK (ruleset IN ('casual', 'competitive')),
  max_participants INTEGER,
  start_date DATETIME,
  start_time DATETIME,
  event_image_url TEXT,
  signup_config_id TEXT,
  allow_player_team_selection INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  allow_match_editing INTEGER DEFAULT 1,
  stats_enabled INTEGER NOT NULL DEFAULT 0,
  game_mode_id TEXT,
  announcements TEXT,
  player_notifications INTEGER DEFAULT 1,
  livestream_link TEXT,
  position_scoring_override TEXT,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

INSERT INTO tournaments_new SELECT
  id, name, description, format, status, game_id, rounds_per_match, ruleset,
  max_participants, start_date, start_time, event_image_url, signup_config_id,
  allow_player_team_selection, created_at, updated_at, allow_match_editing,
  stats_enabled, game_mode_id, announcements, player_notifications, livestream_link,
  position_scoring_override
FROM tournaments;

DROP TABLE tournaments;

ALTER TABLE tournaments_new RENAME TO tournaments;

-- Restore indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_game_id ON tournaments(game_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_time ON tournaments(start_time);
CREATE INDEX IF NOT EXISTS idx_tournaments_game_mode_id ON tournaments(game_mode_id);
