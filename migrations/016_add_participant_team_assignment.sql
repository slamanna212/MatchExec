-- Add team assignment column to match_participants
-- This stores which team (reserve, blue, red) a participant is assigned to

ALTER TABLE match_participants ADD COLUMN team_assignment TEXT DEFAULT 'reserve' CHECK (team_assignment IN ('reserve', 'blue', 'red'));

-- Create index for team assignments
CREATE INDEX IF NOT EXISTS idx_match_participants_team_assignment ON match_participants(team_assignment);