-- Add receives_map_codes field to match_participants table
-- This field tracks which players should receive map codes via Discord PM

ALTER TABLE match_participants ADD COLUMN receives_map_codes BOOLEAN DEFAULT 0;