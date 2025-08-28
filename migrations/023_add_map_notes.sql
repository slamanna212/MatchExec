-- Add map notes feature
-- This migration adds a notes field to store notes for individual maps in matches

-- Add notes column to match_games table to store map-specific notes
ALTER TABLE match_games ADD COLUMN notes TEXT DEFAULT '';

-- Create index for faster note queries  
CREATE INDEX IF NOT EXISTS idx_match_games_notes ON match_games(match_id, map_id) WHERE notes IS NOT NULL AND notes != '';