-- Settings & Configuration
-- Consolidated migration for all application settings and configuration tables

-- Scheduler configuration
CREATE TABLE IF NOT EXISTS scheduler_settings (
  id INTEGER PRIMARY KEY,
  enabled BOOLEAN DEFAULT 1,
  match_cleanup_cron TEXT NOT NULL DEFAULT '0 2 * * *',
  match_check_cron TEXT NOT NULL DEFAULT '*/5 * * * *',
  reminder_check_cron TEXT NOT NULL DEFAULT '*/5 * * * *',
  cleanup_check_cron TEXT NOT NULL DEFAULT '0 3 * * *',
  channel_refresh_cron TEXT NOT NULL DEFAULT '0 */6 * * *',
  queue_processing_cron TEXT NOT NULL DEFAULT '*/30 * * * * *',
  cleanup_retention_days INTEGER NOT NULL DEFAULT 30,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- UI configuration
CREATE TABLE IF NOT EXISTS ui_settings (
  id INTEGER PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT 'dark',
  language TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  time_format TEXT NOT NULL DEFAULT '24h',
  auto_refresh_interval_seconds INTEGER DEFAULT 30,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Discord role settings for announcements
CREATE TABLE IF NOT EXISTS announcement_role_settings (
  id INTEGER PRIMARY KEY,
  game_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  UNIQUE(game_id, role_id)
);

-- Generic application settings (key-value store with metadata)
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string',
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default app settings
INSERT OR IGNORE INTO app_settings (setting_key, setting_value, data_type, metadata) VALUES 
('welcome_flow_completed', 'false', 'boolean', '{"description": "Whether the initial setup welcome flow has been completed"}'),
('welcome_flow_step', '1', 'number', '{"description": "Current step in the welcome flow process", "min": 1, "max": 3}');

-- Automatic timestamp update triggers
CREATE TRIGGER IF NOT EXISTS update_matches_timestamp 
AFTER UPDATE ON matches
BEGIN
  UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_games_timestamp 
AFTER UPDATE ON games
BEGIN
  UPDATE games SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_game_modes_timestamp 
AFTER UPDATE ON game_modes
BEGIN
  UPDATE game_modes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id AND game_id = NEW.game_id;
END;

CREATE TRIGGER IF NOT EXISTS update_game_maps_timestamp 
AFTER UPDATE ON game_maps
BEGIN
  UPDATE game_maps SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id AND game_id = NEW.game_id;
END;

CREATE TRIGGER IF NOT EXISTS update_discord_settings_timestamp 
AFTER UPDATE ON discord_settings
BEGIN
  UPDATE discord_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_scheduler_settings_timestamp 
AFTER UPDATE ON scheduler_settings
BEGIN
  UPDATE scheduler_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_ui_settings_timestamp 
AFTER UPDATE ON ui_settings
BEGIN
  UPDATE ui_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_app_settings_timestamp 
AFTER UPDATE ON app_settings
BEGIN
  UPDATE app_settings SET updated_at = CURRENT_TIMESTAMP WHERE setting_key = NEW.setting_key;
END;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_announcement_role_settings_game_id ON announcement_role_settings(game_id);
CREATE INDEX IF NOT EXISTS idx_app_settings_data_type ON app_settings(data_type);