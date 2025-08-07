-- Add max_signups column to games table
-- This allows games to specify a different limit for match signups vs actual match players

ALTER TABLE games ADD COLUMN max_signups INTEGER;

-- Update existing games to use max_players as default for max_signups
UPDATE games SET max_signups = max_players WHERE max_signups IS NULL;