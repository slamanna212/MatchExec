-- FFA Scoring Support Migration
-- This migration adds support for Free-For-All scoring modes

-- First, check if scoring_type column exists, if not add it
ALTER TABLE game_modes ADD COLUMN scoring_type TEXT DEFAULT 'Normal';

-- Update any existing records that might have 'wins' to 'Normal'
UPDATE game_modes SET scoring_type = 'Normal' WHERE scoring_type = 'wins' OR scoring_type IS NULL;

-- Add participant winner support to match_games table
-- For FFA modes, we need to track individual participant winners instead of just teams
ALTER TABLE match_games ADD COLUMN participant_winner_id TEXT;
ALTER TABLE match_games ADD COLUMN is_ffa_mode BOOLEAN DEFAULT 0;

-- Add foreign key constraint for participant winner
-- Note: SQLite doesn't support adding FK constraints to existing tables directly
-- We'll handle this validation in the application layer

-- Create index for FFA queries
CREATE INDEX IF NOT EXISTS idx_match_games_participant_winner ON match_games(participant_winner_id);
CREATE INDEX IF NOT EXISTS idx_match_games_ffa_mode ON match_games(is_ffa_mode);