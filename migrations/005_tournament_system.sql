-- Tournament System Migration
-- Adds support for tournament management with team-based matches

-- Tournament management table
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL CHECK (format IN ('single-elimination', 'double-elimination')),
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
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  FOREIGN KEY (signup_config_id) REFERENCES signup_configs(id) ON DELETE SET NULL
);

-- Tournament teams table
CREATE TABLE IF NOT EXISTS tournament_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- Tournament team members table
CREATE TABLE IF NOT EXISTS tournament_team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  discord_user_id TEXT,
  username TEXT NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES tournament_teams(id) ON DELETE CASCADE,
  UNIQUE(team_id, user_id)
);

-- Tournament participants table (individual signups before team assignment)
CREATE TABLE IF NOT EXISTS tournament_participants (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  signup_data TEXT, -- JSON string storing signup form data
  team_assignment TEXT, -- NULL until assigned to a team, then team_id
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  UNIQUE(tournament_id, user_id)
);

-- Tournament matches relationship table
CREATE TABLE IF NOT EXISTS tournament_matches (
  match_id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  bracket_type TEXT NOT NULL CHECK (bracket_type IN ('winners', 'losers', 'final')),
  team1_id TEXT,
  team2_id TEXT,
  match_order INTEGER NOT NULL,
  parent_match1_id TEXT,
  parent_match2_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (team1_id) REFERENCES tournament_teams(id) ON DELETE SET NULL,
  FOREIGN KEY (team2_id) REFERENCES tournament_teams(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_match1_id) REFERENCES matches(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_match2_id) REFERENCES matches(id) ON DELETE SET NULL
);

-- Add tournament-related columns to existing matches table
-- Note: winner_team already exists in the original schema
ALTER TABLE matches ADD COLUMN tournament_id TEXT REFERENCES tournaments(id);
ALTER TABLE matches ADD COLUMN bracket_type TEXT CHECK (bracket_type IN ('winners', 'losers', 'final'));
ALTER TABLE matches ADD COLUMN bracket_round INTEGER;
ALTER TABLE matches ADD COLUMN red_team_id TEXT REFERENCES tournament_teams(id);
ALTER TABLE matches ADD COLUMN blue_team_id TEXT REFERENCES tournament_teams(id);
ALTER TABLE matches ADD COLUMN tournament_round INTEGER;
ALTER TABLE matches ADD COLUMN tournament_bracket_type TEXT;
ALTER TABLE matches ADD COLUMN team1_name TEXT;
ALTER TABLE matches ADD COLUMN team2_name TEXT;
ALTER TABLE matches ADD COLUMN map_id TEXT REFERENCES game_maps(id);

-- Performance indexes for tournaments
CREATE INDEX IF NOT EXISTS idx_tournaments_game_id ON tournaments(game_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_time ON tournaments(start_time);

CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament_id ON tournament_teams(tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_team_members_team_id ON tournament_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_team_members_user_id ON tournament_team_members(user_id);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user_id ON tournament_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_team_assignment ON tournament_participants(team_assignment);

-- Indexes for tournament matches table
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_bracket_type ON tournament_matches(bracket_type);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_team1_id ON tournament_matches(team1_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_team2_id ON tournament_matches(team2_id);

-- Indexes for matches with tournament relations
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_bracket_type ON matches(bracket_type);
CREATE INDEX IF NOT EXISTS idx_matches_red_team_id ON matches(red_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_blue_team_id ON matches(blue_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_round ON matches(tournament_round);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_bracket_type ON matches(tournament_bracket_type);
CREATE INDEX IF NOT EXISTS idx_matches_winner_team ON matches(winner_team);
CREATE INDEX IF NOT EXISTS idx_matches_map_id ON matches(map_id);

-- Add discord_user_id to tournament_team_members for existing databases
-- This allows @ mentions in tournament match announcements
ALTER TABLE tournament_team_members ADD COLUMN discord_user_id TEXT;