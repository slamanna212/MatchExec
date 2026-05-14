-- Add stats report DM feature
-- Allows sending personalized post-match stat report DMs to participants

ALTER TABLE stats_settings ADD COLUMN stats_report_dm_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE match_player_stats ADD COLUMN stats_dm_sent INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS discord_stats_report_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
);
