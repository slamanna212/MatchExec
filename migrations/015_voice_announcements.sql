-- Voice announcements queue system
CREATE TABLE IF NOT EXISTS discord_voice_announcement_queue (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  announcement_type TEXT NOT NULL CHECK (announcement_type IN ('welcome', 'nextround', 'finish')),
  blue_team_voice_channel TEXT,
  red_team_voice_channel TEXT,
  first_team TEXT NOT NULL CHECK (first_team IN ('blue', 'red')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_voice_announcement_queue_status ON discord_voice_announcement_queue(status);
CREATE INDEX IF NOT EXISTS idx_voice_announcement_queue_match ON discord_voice_announcement_queue(match_id);

-- Track which team went first in the last announcement for each match
CREATE TABLE IF NOT EXISTS match_voice_alternation (
  match_id TEXT PRIMARY KEY,
  last_first_team TEXT NOT NULL CHECK (last_first_team IN ('blue', 'red')),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);