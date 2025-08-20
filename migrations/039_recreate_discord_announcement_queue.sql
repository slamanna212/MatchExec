-- Recreate discord_announcement_queue table without UNIQUE constraint on match_id
-- This allows multiple timed announcements per match

-- Drop temporary table if it exists from a failed previous migration
DROP TABLE IF EXISTS discord_announcement_queue_new;

-- Create new table with the desired structure
CREATE TABLE discord_announcement_queue_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed', 'completed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  posted_at DATETIME,
  error_message TEXT,
  announcement_type TEXT DEFAULT 'standard',
  announcement_data TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Copy existing data if table exists
INSERT INTO discord_announcement_queue_new (id, match_id, status, created_at, posted_at, error_message, announcement_type, announcement_data)
SELECT 
  id, 
  match_id, 
  status, 
  created_at, 
  posted_at, 
  error_message,
  'standard' as announcement_type,
  NULL as announcement_data
FROM discord_announcement_queue
WHERE EXISTS (SELECT name FROM sqlite_master WHERE type='table' AND name='discord_announcement_queue');

-- Drop old table if it exists
DROP TABLE IF EXISTS discord_announcement_queue;

-- Rename new table
ALTER TABLE discord_announcement_queue_new RENAME TO discord_announcement_queue;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_discord_announcements_status ON discord_announcement_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_announcements_created_at ON discord_announcement_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_discord_announcements_match_id ON discord_announcement_queue(match_id);