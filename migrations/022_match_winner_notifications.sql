-- Match Winner Notification Queue
-- This migration adds support for final match winner notifications

-- Discord match winner notification queue
CREATE TABLE IF NOT EXISTS discord_match_winner_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_name TEXT NOT NULL,
  game_id TEXT NOT NULL,
  winner TEXT NOT NULL CHECK (winner IN ('team1', 'team2', 'tie')),
  winning_team_name TEXT NOT NULL,
  winning_players TEXT NOT NULL, -- JSON array of player names
  team1_score INTEGER NOT NULL,
  team2_score INTEGER NOT NULL,
  total_maps INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_match_winner_queue_status ON discord_match_winner_queue(status);
CREATE INDEX IF NOT EXISTS idx_match_winner_queue_match_id ON discord_match_winner_queue(match_id);