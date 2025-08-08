-- Create discord match reminder queue table for Discord bot to process
CREATE TABLE IF NOT EXISTS discord_match_reminder_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_discord_match_reminder_queue_status ON discord_match_reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_match_reminder_queue_match_id ON discord_match_reminder_queue(match_id);