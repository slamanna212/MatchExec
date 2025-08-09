-- Add discord_user_id column to match_participants table
-- This will store the Discord user ID from interaction.user.id when signing up
ALTER TABLE match_participants ADD COLUMN discord_user_id TEXT;

-- Create index for Discord user ID lookups
CREATE INDEX IF NOT EXISTS idx_match_participants_discord_user_id ON match_participants(discord_user_id);