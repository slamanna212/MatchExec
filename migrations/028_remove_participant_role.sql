-- Remove participant_role_id column from discord_settings table
-- Note: SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Create new table without participant_role_id
CREATE TABLE discord_settings_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT,
  bot_token TEXT,
  guild_id TEXT,
  announcement_channel_id TEXT,
  results_channel_id TEXT,
  announcement_role_id TEXT,
  mention_everyone BOOLEAN DEFAULT 0,
  event_duration_minutes INTEGER DEFAULT 45,
  match_reminder_minutes INTEGER DEFAULT 10,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table (excluding participant_role_id)
INSERT INTO discord_settings_new (
  id, application_id, bot_token, guild_id, 
  announcement_channel_id, results_channel_id, 
  announcement_role_id, mention_everyone, 
  event_duration_minutes, match_reminder_minutes, 
  created_at, updated_at
)
SELECT 
  id, application_id, bot_token, guild_id, 
  announcement_channel_id, results_channel_id, 
  announcement_role_id, mention_everyone, 
  event_duration_minutes, match_reminder_minutes, 
  created_at, updated_at
FROM discord_settings;

-- Drop old table
DROP TABLE discord_settings;

-- Rename new table
ALTER TABLE discord_settings_new RENAME TO discord_settings;

-- Recreate trigger
CREATE TRIGGER IF NOT EXISTS discord_settings_updated_at 
  AFTER UPDATE ON discord_settings
  FOR EACH ROW
BEGIN
  UPDATE discord_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
