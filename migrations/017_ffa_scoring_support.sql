-- FFA Scoring Support Migration
-- This migration adds support for Free-For-All scoring modes

-- The safest approach is to use a try-catch pattern in the application
-- For now, we'll create a minimal migration that won't fail on duplicate columns

-- Create indexes for FFA queries (these are safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_match_games_participant_winner ON match_games(participant_winner_id);
CREATE INDEX IF NOT EXISTS idx_match_games_ffa_mode ON match_games(is_ffa_mode);

-- Note: Column additions are handled by the migration runner with error handling