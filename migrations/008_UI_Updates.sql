-- Add avatar_url column to match_participants
ALTER TABLE match_participants ADD COLUMN avatar_url TEXT;

-- Add last_avatar_check timestamp for scheduler optimization
ALTER TABLE match_participants ADD COLUMN last_avatar_check DATETIME;

-- Track consecutive avatar fetch failures to skip problematic users
ALTER TABLE match_participants ADD COLUMN failed_avatar_checks INTEGER DEFAULT 0;

-- Queue for Discord embed/event updates after a match edit
CREATE TABLE IF NOT EXISTS discord_match_edit_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_discord_match_edit_queue_match_id ON discord_match_edit_queue(match_id);

-- Allow match editing setting for tournaments
-- Default 1 (allowed) preserves existing tournament behavior
ALTER TABLE tournaments ADD COLUMN allow_match_editing INTEGER DEFAULT 1;

-- Track bye teams per round for odd-numbered brackets
CREATE TABLE IF NOT EXISTS tournament_round_byes (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  bracket_type TEXT NOT NULL,
  team_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES tournament_teams(id) ON DELETE CASCADE,
  UNIQUE(tournament_id, round, bracket_type, team_id)
);
