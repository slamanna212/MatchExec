-- Fix malformed FK constraint on matches.map_id
-- Migration 005 added: ALTER TABLE matches ADD COLUMN map_id TEXT REFERENCES game_maps(id)
-- game_maps has a composite PK (id, game_id), so REFERENCES game_maps(id) alone is invalid —
-- SQLite requires referenced columns to form a unique index.
-- Fix: keep the map_id column as plain TEXT with no FK constraint.

CREATE TABLE matches_new (
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
  announcements BOOLEAN DEFAULT 1,
  blue_team_voice_channel TEXT,
  red_team_voice_channel TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  tournament_id TEXT REFERENCES tournaments(id),
  bracket_type TEXT CHECK (bracket_type IN ('winners', 'losers', 'final')),
  bracket_round INTEGER,
  red_team_id TEXT REFERENCES tournament_teams(id),
  blue_team_id TEXT REFERENCES tournament_teams(id),
  tournament_round INTEGER,
  tournament_bracket_type TEXT,
  team1_name TEXT,
  team2_name TEXT,
  map_id TEXT,
  stats_enabled INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (mode_id, game_id) REFERENCES game_modes(id, game_id) ON DELETE SET NULL
);

INSERT INTO matches_new SELECT
  id, game_id, mode_id, name, description, start_date, start_time, end_time,
  status, max_participants, current_participants, winner_team, map_codes,
  guild_id, channel_id, match_format, maps, rules, rounds, livestream_link,
  event_image_url, player_notifications, announcements, blue_team_voice_channel,
  red_team_voice_channel, created_at, updated_at,
  tournament_id, bracket_type, bracket_round, red_team_id, blue_team_id,
  tournament_round, tournament_bracket_type, team1_name, team2_name, map_id,
  stats_enabled
FROM matches;

DROP TABLE matches;

ALTER TABLE matches_new RENAME TO matches;

CREATE INDEX IF NOT EXISTS idx_matches_game_id ON matches(game_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_bracket_type ON matches(bracket_type);
CREATE INDEX IF NOT EXISTS idx_matches_red_team_id ON matches(red_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_blue_team_id ON matches(blue_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_round ON matches(tournament_round);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_bracket_type ON matches(tournament_bracket_type);
CREATE INDEX IF NOT EXISTS idx_matches_winner_team ON matches(winner_team);
CREATE INDEX IF NOT EXISTS idx_matches_map_id ON matches(map_id);
CREATE INDEX IF NOT EXISTS idx_matches_status_updated ON matches(status, updated_at DESC);
