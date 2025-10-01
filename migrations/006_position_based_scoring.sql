-- Position-Based Scoring System Migration
-- Adds support for racing games and other position-ranked competitions

-- Add scoring configuration to games table
-- Stores JSON configuration for position-based point systems
ALTER TABLE games ADD COLUMN scoring_config TEXT;

-- Add position results and points to match_games table
-- position_results: JSON storing {participantId: position} mappings
-- points_awarded: JSON storing {participantId: points} mappings
ALTER TABLE match_games ADD COLUMN position_results TEXT;
ALTER TABLE match_games ADD COLUMN points_awarded TEXT;

-- Index for faster position-based queries
CREATE INDEX IF NOT EXISTS idx_match_games_position_results ON match_games(position_results);

-- Add log level setting to app_settings
INSERT OR IGNORE INTO app_settings (setting_key, setting_value, data_type, metadata) VALUES
('log_level', 'warning', 'string', '{"description": "Application log level filter", "options": ["debug", "info", "warning", "error", "critical"]}');