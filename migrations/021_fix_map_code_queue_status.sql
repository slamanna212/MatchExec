-- Fix map code queue status constraint to include 'processing' status
-- The Discord bot needs to set status to 'processing' to prevent duplicate processing

-- Drop the existing table and recreate with correct constraint
DROP TABLE IF EXISTS discord_map_code_queue_backup;

-- Create backup table
CREATE TABLE discord_map_code_queue_backup AS SELECT * FROM discord_map_code_queue;

-- Drop the original table
DROP TABLE discord_map_code_queue;

-- Recreate with correct status constraint
CREATE TABLE discord_map_code_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  map_name TEXT NOT NULL,
  map_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Restore data from backup
INSERT INTO discord_map_code_queue SELECT * FROM discord_map_code_queue_backup;

-- Drop backup table
DROP TABLE discord_map_code_queue_backup;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_discord_map_code_queue_match_id ON discord_map_code_queue(match_id);
CREATE INDEX IF NOT EXISTS idx_discord_map_code_queue_status ON discord_map_code_queue(status);