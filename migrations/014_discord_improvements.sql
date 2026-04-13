-- Migration 014: Make user_id nullable in discord_map_code_queue
-- The queue processor (sendMapCodePMs) looks up all recipients via match_id,
-- so user_id is not needed and was preventing map code PMs from being queued.

-- SQLite doesn't support ALTER COLUMN, so we recreate the table.
CREATE TABLE IF NOT EXISTS discord_map_code_queue_new (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_id TEXT,
  map_name TEXT,
  map_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

INSERT INTO discord_map_code_queue_new
  SELECT id, match_id, user_id, map_name, map_code, status, retry_count, created_at, processed_at
  FROM discord_map_code_queue;

DROP TABLE discord_map_code_queue;

ALTER TABLE discord_map_code_queue_new RENAME TO discord_map_code_queue;

CREATE INDEX IF NOT EXISTS idx_discord_map_code_queue_status ON discord_map_code_queue(status);

-- Stats-aware scoring additions
ALTER TABLE matches ADD COLUMN stats_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_games ADD COLUMN discord_notified INTEGER NOT NULL DEFAULT 0;

-- Mark all already-completed games as notified (notifications already sent pre-feature)
UPDATE match_games SET discord_notified = 1 WHERE status = 'completed';
