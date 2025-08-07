-- Update match status to support new 5-step flow
-- Creation > Gather > Assign > Battle > Complete

-- First, update existing status values to match new flow
UPDATE matches SET status = 'gather' WHERE status = 'registration';
UPDATE matches SET status = 'battle' WHERE status = 'ongoing';  
UPDATE matches SET status = 'complete' WHERE status = 'completed';

-- Since SQLite doesn't support modifying CHECK constraints directly,
-- we need to disable foreign key enforcement temporarily and recreate the table
PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- Create temporary backup of data
CREATE TEMPORARY TABLE matches_backup AS SELECT * FROM matches;

-- Drop the original table
DROP TABLE matches;

-- Recreate table with new status constraint (matching existing columns exactly)
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  game_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  max_participants INTEGER NOT NULL DEFAULT 16,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'gather', 'assign', 'battle', 'complete', 'cancelled')),
  start_date DATETIME,
  end_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  rules TEXT,
  rounds INTEGER,
  maps TEXT,
  livestream_link TEXT,
  event_image_url TEXT,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Restore data from backup
INSERT INTO matches SELECT * FROM matches_backup;

-- Drop the temporary backup
DROP TABLE matches_backup;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_matches_guild_id ON matches(guild_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

COMMIT;

PRAGMA foreign_keys=ON;