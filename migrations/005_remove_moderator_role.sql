-- Remove moderator_role_id column from discord_settings
-- SQLite doesn't support DROP COLUMN, so we need to recreate the table

-- Create new table without moderator_role_id
CREATE TABLE IF NOT EXISTS discord_settings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT,
  bot_token TEXT,
  guild_id TEXT,
  announcement_channel_id TEXT,
  results_channel_id TEXT,
  participant_role_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table to new table (excluding moderator_role_id)
INSERT INTO discord_settings_new (
  id, application_id, bot_token, guild_id, announcement_channel_id, 
  results_channel_id, participant_role_id, created_at, updated_at
)
SELECT 
  id, application_id, bot_token, guild_id, announcement_channel_id,
  results_channel_id, participant_role_id, created_at, updated_at
FROM discord_settings;

-- Drop old table
DROP TABLE discord_settings;

-- Rename new table to original name
ALTER TABLE discord_settings_new RENAME TO discord_settings;

-- Recreate trigger for the new table
CREATE TRIGGER IF NOT EXISTS discord_settings_updated_at 
  AFTER UPDATE ON discord_settings
  FOR EACH ROW
BEGIN
  UPDATE discord_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Ensure default settings row exists
INSERT INTO discord_settings (id) VALUES (1) 
ON CONFLICT(id) DO NOTHING;