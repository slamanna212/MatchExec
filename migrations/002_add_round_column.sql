-- Add missing round column to match_games table
-- This column is used by the scoring functions to track game rounds

ALTER TABLE match_games ADD COLUMN round INTEGER DEFAULT 1;

-- Update existing records to use game_number as round value
UPDATE match_games SET round = game_number WHERE round IS NULL OR round = 1;

-- Add an index for performance
CREATE INDEX IF NOT EXISTS idx_match_games_round ON match_games(round);