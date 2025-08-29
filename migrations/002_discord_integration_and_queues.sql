-- Discord Integration & Queue Systems
-- Consolidated migration for all Discord-related features and asynchronous processing

-- Discord bot configuration
CREATE TABLE IF NOT EXISTS discord_settings (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL UNIQUE,
  bot_token TEXT NOT NULL,
  application_id TEXT,
  command_prefix TEXT DEFAULT '!',
  announcements_channel_id TEXT,
  results_channel_id TEXT,
  voice_channel_category_id TEXT,
  announcement_role_id TEXT,
  mention_everyone BOOLEAN DEFAULT 0,
  event_duration_minutes INTEGER DEFAULT 45,
  match_reminder_minutes INTEGER DEFAULT 10,
  player_reminder_minutes INTEGER DEFAULT 120,
  announcer_voice TEXT,
  voice_announcements_enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Discord channel cache
CREATE TABLE IF NOT EXISTS discord_channels (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  discord_channel_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel_name TEXT,
  type INTEGER NOT NULL,
  channel_type TEXT,
  parent_id TEXT,
  send_announcements BOOLEAN DEFAULT 1,
  send_reminders BOOLEAN DEFAULT 1,
  send_match_start BOOLEAN DEFAULT 1,
  send_signup_updates BOOLEAN DEFAULT 1,
  last_name_refresh DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guild_id) REFERENCES discord_settings(guild_id) ON DELETE CASCADE
);

-- Add updated_at column if it doesn't exist (for existing databases)
-- This will fail silently if the column already exists
ALTER TABLE discord_channels ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Voice and TTS configuration
CREATE TABLE IF NOT EXISTS voices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voice_data_versions (
  voice_type TEXT PRIMARY KEY,
  data_version TEXT NOT NULL,
  seeded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Discord message tracking
CREATE TABLE IF NOT EXISTS discord_match_messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thread_id TEXT,
  discord_event_id TEXT,
  message_type TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Discord event management
CREATE TABLE IF NOT EXISTS discord_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Team voice channel management
CREATE TABLE IF NOT EXISTS team_voice_channels (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  UNIQUE(match_id, team_name)
);

-- Match voice alternation tracking
CREATE TABLE IF NOT EXISTS match_voice_alternation (
  match_id TEXT PRIMARY KEY,
  current_team TEXT NOT NULL,
  last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Discord queue systems
CREATE TABLE IF NOT EXISTS discord_announcement_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  announcement_type TEXT,
  announcement_data TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  posted_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_status_update_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  new_status TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_reminder_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  minutes_before INTEGER NOT NULL,
  reminder_time DATETIME,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  scheduled_for DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  sent_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_match_reminder_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  scheduled_for DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_player_reminder_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  reminder_time DATETIME,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  scheduled_for DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  sent_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_match_start_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_deletion_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_bot_requests (
  id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL,
  request_data TEXT,
  type TEXT,
  data TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discord_score_notification_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  map_id TEXT,
  game_number INTEGER,
  winner TEXT,
  winning_team_name TEXT,
  winning_players TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  sent_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES match_games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_voice_announcement_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  announcement_type TEXT NOT NULL,
  blue_team_voice_channel TEXT,
  red_team_voice_channel TEXT,
  first_team TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_map_code_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  map_name TEXT,
  map_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS discord_match_winner_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  match_name TEXT,
  game_id TEXT,
  winner TEXT,
  winning_team_name TEXT,
  winning_players TEXT,
  team1_score INTEGER,
  team2_score INTEGER,
  total_maps INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  sent_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Performance indexes for Discord tables
CREATE INDEX IF NOT EXISTS idx_discord_channels_guild_id ON discord_channels(guild_id);
CREATE INDEX IF NOT EXISTS idx_discord_match_messages_match_id ON discord_match_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_discord_events_match_id ON discord_events(match_id);
CREATE INDEX IF NOT EXISTS idx_team_voice_channels_match_id ON team_voice_channels(match_id);

-- Queue indexes for performance
CREATE INDEX IF NOT EXISTS idx_discord_announcement_queue_status ON discord_announcement_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_status_update_queue_status ON discord_status_update_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_reminder_queue_status ON discord_reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_reminder_queue_scheduled ON discord_reminder_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_discord_match_reminder_queue_status ON discord_match_reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_match_reminder_queue_scheduled ON discord_match_reminder_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_discord_player_reminder_queue_status ON discord_player_reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_player_reminder_queue_scheduled ON discord_player_reminder_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_discord_match_start_queue_status ON discord_match_start_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_deletion_queue_status ON discord_deletion_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_bot_requests_status ON discord_bot_requests(status);
CREATE INDEX IF NOT EXISTS idx_discord_score_notification_queue_status ON discord_score_notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_voice_announcement_queue_status ON discord_voice_announcement_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_map_code_queue_status ON discord_map_code_queue(status);
CREATE INDEX IF NOT EXISTS idx_discord_match_winner_queue_status ON discord_match_winner_queue(status);