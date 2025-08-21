-- System Settings and Configuration
-- This migration creates configuration tables for scheduler, UI, and system settings

-- Scheduler configuration
CREATE TABLE IF NOT EXISTS scheduler_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_check_cron TEXT DEFAULT '0 */1 * * * *',
  reminder_check_cron TEXT DEFAULT '0 0 */4 * * *',
  cleanup_check_cron TEXT DEFAULT '0 0 2 * * *',
  report_generation_cron TEXT DEFAULT '0 0 0 * * 0',
  channel_refresh_cron TEXT DEFAULT '0 0 0 * * *',
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- UI configuration
CREATE TABLE IF NOT EXISTS ui_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme TEXT DEFAULT 'dark',
  primary_color TEXT DEFAULT 'blue',
  enable_animations BOOLEAN DEFAULT 1,
  show_tutorial BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Announcement role settings for different game modes
CREATE TABLE IF NOT EXISTS announcement_role_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  mode_id TEXT,
  role_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(game_id, mode_id)
);

-- Update triggers for automatic timestamp management
CREATE TRIGGER IF NOT EXISTS discord_settings_updated_at 
  AFTER UPDATE ON discord_settings
  FOR EACH ROW
BEGIN
  UPDATE discord_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS scheduler_settings_updated_at 
  AFTER UPDATE ON scheduler_settings
  FOR EACH ROW
BEGIN
  UPDATE scheduler_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS ui_settings_updated_at 
  AFTER UPDATE ON ui_settings
  FOR EACH ROW
BEGIN
  UPDATE ui_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS matches_updated_at 
  AFTER UPDATE ON matches
  FOR EACH ROW
BEGIN
  UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS match_games_updated_at 
  AFTER UPDATE ON match_games
  FOR EACH ROW
BEGIN
  UPDATE match_games SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_announcement_roles_game_id ON announcement_role_settings(game_id);
CREATE INDEX IF NOT EXISTS idx_announcement_roles_mode_id ON announcement_role_settings(mode_id);

-- Insert default settings
INSERT INTO scheduler_settings (id) VALUES (1) ON CONFLICT(id) DO NOTHING;
INSERT INTO ui_settings (id) VALUES (1) ON CONFLICT(id) DO NOTHING;