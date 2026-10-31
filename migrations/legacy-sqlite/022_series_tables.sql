-- Phase 1d: Series entity — top-level multi-event championship container

CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'active', 'complete', 'cancelled')),
  scoring_config TEXT,        -- JSON: how event outcomes convert to series points
  start_date DATETIME,
  end_date DATETIME,
  event_image_url TEXT,
  game_id TEXT REFERENCES games(id),  -- nullable; a series can span games
  guild_id TEXT,
  channel_id TEXT,
  announcements BOOLEAN DEFAULT 1,
  player_notifications BOOLEAN DEFAULT 1,
  livestream_link TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS series_events (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('match', 'tournament')),
  match_id TEXT REFERENCES matches(id) ON DELETE SET NULL,
  tournament_id TEXT REFERENCES tournaments(id) ON DELETE SET NULL,
  event_order INTEGER NOT NULL,
  event_date DATETIME,
  points_multiplier REAL DEFAULT 1.0,
  UNIQUE(series_id, event_order),
  CHECK (
    (event_type = 'match' AND match_id IS NOT NULL AND tournament_id IS NULL) OR
    (event_type = 'tournament' AND tournament_id IS NOT NULL AND match_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_series_game_id ON series(game_id);
CREATE INDEX IF NOT EXISTS idx_series_status ON series(status);
CREATE INDEX IF NOT EXISTS idx_series_events_series ON series_events(series_id);
CREATE INDEX IF NOT EXISTS idx_series_events_match ON series_events(match_id);
CREATE INDEX IF NOT EXISTS idx_series_events_tournament ON series_events(tournament_id);
