-- Migration: Add discord bot requests table
CREATE TABLE IF NOT EXISTS discord_bot_requests (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'voice_test', etc.
  data TEXT NOT NULL, -- JSON data for the request
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  result TEXT, -- JSON result data
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_discord_bot_requests_status ON discord_bot_requests(status);
CREATE INDEX IF NOT EXISTS idx_discord_bot_requests_type ON discord_bot_requests(type);