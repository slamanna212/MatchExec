-- Queue Management System
-- This migration creates all queue tables for asynchronous processing

-- Discord announcement queue
CREATE TABLE IF NOT EXISTS discord_announcement_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  announcement_type TEXT NOT NULL DEFAULT 'match',
  announcement_data TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Discord status update queue
CREATE TABLE IF NOT EXISTS discord_status_update_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Discord reminder queues
CREATE TABLE IF NOT EXISTS discord_reminder_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  reminder_time DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_match_reminder_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_player_reminder_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  reminder_time DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Discord match start notification queue
CREATE TABLE IF NOT EXISTS discord_match_start_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Discord deletion queue for cleanup
CREATE TABLE IF NOT EXISTS discord_deletion_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  deletion_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Discord bot request tracking
CREATE TABLE IF NOT EXISTS discord_bot_requests (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL,
  match_id TEXT,
  request_data TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processing_status TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
);

-- Performance indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_announcement_queue_status ON discord_announcement_queue(status);
CREATE INDEX IF NOT EXISTS idx_announcement_queue_match_id ON discord_announcement_queue(match_id);
CREATE INDEX IF NOT EXISTS idx_status_update_queue_status ON discord_status_update_queue(status);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_status ON discord_reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_time ON discord_reminder_queue(reminder_time);
CREATE INDEX IF NOT EXISTS idx_match_reminder_queue_status ON discord_match_reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_player_reminder_queue_status ON discord_player_reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_match_start_queue_status ON discord_match_start_queue(status);
CREATE INDEX IF NOT EXISTS idx_deletion_queue_status ON discord_deletion_queue(status);
CREATE INDEX IF NOT EXISTS idx_bot_requests_status ON discord_bot_requests(status);