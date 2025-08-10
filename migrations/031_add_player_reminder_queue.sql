-- Create discord_player_reminder_queue table for managing player DM notifications
CREATE TABLE discord_player_reminder_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  reminder_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TEXT,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);