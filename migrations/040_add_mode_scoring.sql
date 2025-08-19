-- Add scoring metadata to game modes
-- This migration adds scoring configuration to support match scoring tracking

-- Add scoring configuration column to game_modes table
ALTER TABLE game_modes ADD COLUMN scoring_config TEXT;

-- Add score tracking columns to match_games table for actual match scores
ALTER TABLE match_games ADD COLUMN team1_score TEXT; -- JSON for flexible scoring data
ALTER TABLE match_games ADD COLUMN team2_score TEXT; -- JSON for flexible scoring data
ALTER TABLE match_games ADD COLUMN score_details TEXT; -- JSON for round-by-round or detailed scoring

-- Create index for performance on score queries
CREATE INDEX IF NOT EXISTS idx_match_games_scores ON match_games(team1_score, team2_score);