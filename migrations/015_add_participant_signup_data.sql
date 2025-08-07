-- Add signup_data column to store additional participant information as JSON
-- This allows flexible storage of game-specific signup form data

ALTER TABLE match_participants ADD COLUMN signup_data TEXT;

-- Create index for searching signup data
CREATE INDEX IF NOT EXISTS idx_match_participants_signup_data ON match_participants(signup_data);