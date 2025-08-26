-- Migration: Add app_settings table for welcome flow and other app-wide settings
-- Created: 2025-08-26

CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    metadata TEXT, -- JSON field for additional data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default welcome flow settings
INSERT OR IGNORE INTO app_settings (setting_key, setting_value, metadata) VALUES 
(
    'welcome_flow_completed', 
    'false',
    '{"screens_completed": [], "completion_date": null, "setup_type": null}'
),
(
    'welcome_flow_current_screen',
    '1', 
    '{"total_screens": 3, "last_accessed": null}'
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(setting_key);