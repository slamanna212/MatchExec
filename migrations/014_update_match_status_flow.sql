-- Update match status to support new 5-step flow
-- Creation > Gather > Assign > Battle > Complete

-- Drop the old CHECK constraint and recreate the table with new constraint
-- SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table

-- Create new table with updated status constraint
CREATE TABLE matches_new (
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
  discord_event_id TEXT,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Copy existing data, updating old status values to new ones
INSERT INTO matches_new 
SELECT 
  id, name, description, game_id, guild_id, channel_id, max_participants,
  CASE 
    WHEN status = 'registration' THEN 'gather'
    WHEN status = 'ongoing' THEN 'battle'
    WHEN status = 'completed' THEN 'complete'
    ELSE status
  END as status,
  start_date, end_date, created_at, updated_at,
  rules, rounds, maps, livestream_link, event_image_url, discord_event_id
FROM matches;

-- Drop old table and rename new one
DROP TABLE matches;
ALTER TABLE matches_new RENAME TO matches;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_matches_guild_id ON matches(guild_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);