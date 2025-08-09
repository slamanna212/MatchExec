-- Add message_type column to discord_match_messages table
-- This helps distinguish between announcement messages and reminder messages
ALTER TABLE discord_match_messages ADD COLUMN message_type TEXT DEFAULT 'announcement';

-- Create index for message type lookups
CREATE INDEX IF NOT EXISTS idx_discord_match_messages_type ON discord_match_messages(message_type);