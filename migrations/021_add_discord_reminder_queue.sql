-- Create discord reminder queue table
CREATE TABLE IF NOT EXISTS discord_reminder_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  reminder_time DATETIME NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_discord_reminder_queue_status ON discord_reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_reminder_queue_reminder_time ON discord_reminder_queue(reminder_time);
CREATE INDEX IF NOT EXISTS idx_discord_reminder_queue_match_id ON discord_reminder_queue(match_id);