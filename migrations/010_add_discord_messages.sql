-- Track Discord messages for match announcements
CREATE TABLE IF NOT EXISTS discord_match_messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thread_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
);

-- Queue for Discord message deletions
CREATE TABLE IF NOT EXISTS discord_deletion_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, completed, failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  error_message TEXT
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_discord_match_messages_match_id ON discord_match_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_discord_match_messages_message_id ON discord_match_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_discord_deletion_queue_status ON discord_deletion_queue(status);