-- Create Discord settings table
CREATE TABLE IF NOT EXISTS discord_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_token TEXT,
  guild_id TEXT,
  announcement_channel_id TEXT,
  results_channel_id TEXT,
  moderator_role_id TEXT,
  participant_role_id TEXT,
  command_prefix TEXT DEFAULT '!',
  auto_role_assignment BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS discord_settings_updated_at 
  AFTER UPDATE ON discord_settings
  FOR EACH ROW
BEGIN
  UPDATE discord_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Insert default settings row (only one row should exist)
INSERT INTO discord_settings (id) VALUES (1) 
ON CONFLICT(id) DO NOTHING;