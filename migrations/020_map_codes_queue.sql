-- Create discord_map_code_queue table for queuing map code PMs
-- This table tracks requests to send map codes via Discord PMs

CREATE TABLE IF NOT EXISTS discord_map_code_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  map_name TEXT NOT NULL,
  map_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discord_map_code_queue_match_id ON discord_map_code_queue(match_id);
CREATE INDEX IF NOT EXISTS idx_discord_map_code_queue_status ON discord_map_code_queue(status);