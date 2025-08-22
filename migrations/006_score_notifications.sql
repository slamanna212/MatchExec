-- Score Notification System
-- This migration adds the score notification queue table

-- Discord score notification queue for map/game results
CREATE TABLE IF NOT EXISTS discord_score_notification_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  game_number INTEGER NOT NULL,
  winner TEXT NOT NULL CHECK (winner IN ('team1', 'team2')),
  winning_team_name TEXT NOT NULL,
  winning_players TEXT NOT NULL, -- JSON array of player names
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Index for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_score_notification_queue_status ON discord_score_notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_score_notification_queue_match_id ON discord_score_notification_queue(match_id);
CREATE INDEX IF NOT EXISTS idx_score_notification_queue_created_at ON discord_score_notification_queue(created_at);