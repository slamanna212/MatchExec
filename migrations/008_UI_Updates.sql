-- Add avatar_url column to match_participants
ALTER TABLE match_participants ADD COLUMN avatar_url TEXT;

-- Add last_avatar_check timestamp for scheduler optimization
ALTER TABLE match_participants ADD COLUMN last_avatar_check DATETIME;
