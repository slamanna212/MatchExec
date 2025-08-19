-- Add match format column to matches table
-- This migration adds support for casual vs competitive match formats

-- Add match_format column to matches table with default of 'casual'
ALTER TABLE matches ADD COLUMN match_format TEXT NOT NULL DEFAULT 'casual' 
  CHECK (match_format IN ('casual', 'competitive'));

-- Update existing matches to have casual format by default
UPDATE matches SET match_format = 'casual' WHERE match_format IS NULL;

-- Add score_data column to match_games table to store MatchScore JSON
ALTER TABLE match_games ADD COLUMN score_data TEXT; -- JSON string containing MatchScore

-- Create index for performance on match format queries
CREATE INDEX IF NOT EXISTS idx_matches_format ON matches(match_format);

-- Create index for performance on score data queries  
CREATE INDEX IF NOT EXISTS idx_match_games_score_data ON match_games(score_data);