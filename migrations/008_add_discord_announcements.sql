-- Add table to track Discord announcement requests
CREATE TABLE IF NOT EXISTS discord_announcement_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  posted_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE(match_id)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_discord_announcements_status ON discord_announcement_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_announcements_created_at ON discord_announcement_queue(created_at);