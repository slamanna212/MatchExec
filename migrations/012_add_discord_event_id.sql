-- Add discord_event_id column to discord_match_messages table to track Discord events
ALTER TABLE discord_match_messages ADD COLUMN discord_event_id TEXT;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_discord_match_messages_event_id ON discord_match_messages(discord_event_id);