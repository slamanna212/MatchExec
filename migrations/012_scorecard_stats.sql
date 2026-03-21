-- Migration 012: Scorecard Stats System
-- AI-powered scorecard analysis tables

-- Stats settings (singleton, id=1)
CREATE TABLE IF NOT EXISTS stats_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 0,
  ai_provider TEXT NOT NULL DEFAULT 'anthropic',
  ai_api_key TEXT,
  ai_model TEXT NOT NULL DEFAULT 'sonnet',
  ai_providers_config TEXT,
  google_api_key TEXT,
  both_sides_required INTEGER NOT NULL DEFAULT 0,
  auto_advance_on_match INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO stats_settings (id) VALUES (1);

-- Game stat definitions (seeded from stats.json)
CREATE TABLE IF NOT EXISTS game_stat_definitions (
  id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  stat_type TEXT NOT NULL DEFAULT 'number',
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  format TEXT,
  PRIMARY KEY (id, game_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Screenshot submissions from commanders
CREATE TABLE IF NOT EXISTS scorecard_submissions (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  submitted_by_participant_id TEXT,
  submitted_by_discord_user_id TEXT,
  team_side TEXT NOT NULL CHECK (team_side IN ('blue', 'red')),
  screenshot_url TEXT NOT NULL,
  discord_message_id TEXT,
  ai_raw_response TEXT,
  ai_extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ai_extraction_status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  ai_error_message TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'auto_approved')),
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Extracted player stats per submission
CREATE TABLE IF NOT EXISTS scorecard_player_stats (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  participant_id TEXT,
  extracted_player_name TEXT NOT NULL,
  extracted_hero TEXT,
  team_side TEXT CHECK (team_side IN ('blue', 'red')),
  stats_json TEXT NOT NULL DEFAULT '{}',
  assignment_status TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (assignment_status IN ('unassigned', 'assigned', 'confirmed')),
  confidence_score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES scorecard_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES match_participants(id) ON DELETE SET NULL
);

-- Aggregated match-level stats per participant
CREATE TABLE IF NOT EXISTS match_player_stats (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  total_stats_json TEXT NOT NULL DEFAULT '{}',
  maps_played INTEGER NOT NULL DEFAULT 0,
  stat_image_url TEXT,
  stat_image_sent INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES match_participants(id) ON DELETE CASCADE,
  UNIQUE(match_id, participant_id)
);

-- Queue for AI extraction requests
CREATE TABLE IF NOT EXISTS stats_processing_queue (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES scorecard_submissions(id) ON DELETE CASCADE
);

-- Queue for stat image generation
CREATE TABLE IF NOT EXISTS stats_image_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Queue for scorecard DM prompts to commanders
CREATE TABLE IF NOT EXISTS discord_scorecard_prompt_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  map_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Track DM message <-> map associations (for reply-based flow)
CREATE TABLE IF NOT EXISTS scorecard_dm_messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_game_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_message_id TEXT NOT NULL,
  participant_id TEXT,
  team_side TEXT CHECK (team_side IN ('blue', 'red')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scorecard_submissions_match ON scorecard_submissions(match_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_submissions_match_game ON scorecard_submissions(match_game_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_player_stats_submission ON scorecard_player_stats(submission_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_player_stats_match ON scorecard_player_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_player_stats_participant ON scorecard_player_stats(participant_id);
CREATE INDEX IF NOT EXISTS idx_match_player_stats_match ON match_player_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_stats_processing_queue_status ON stats_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_stats_image_queue_status ON stats_image_queue(status);
CREATE INDEX IF NOT EXISTS idx_scorecard_dm_messages_discord ON scorecard_dm_messages(discord_user_id, discord_message_id);
CREATE INDEX IF NOT EXISTS idx_discord_scorecard_prompt_queue_status ON discord_scorecard_prompt_queue(status);

-- Triggers
CREATE TRIGGER IF NOT EXISTS update_stats_settings_ts AFTER UPDATE ON stats_settings
BEGIN UPDATE stats_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_scorecard_submissions_ts AFTER UPDATE ON scorecard_submissions
BEGIN UPDATE scorecard_submissions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_scorecard_player_stats_ts AFTER UPDATE ON scorecard_player_stats
BEGIN UPDATE scorecard_player_stats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_match_player_stats_ts AFTER UPDATE ON match_player_stats
BEGIN UPDATE match_player_stats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
