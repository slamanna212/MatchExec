-- Performance indexes for common query patterns

-- Matches filtered/sorted by status + recency (most common dashboard query)
CREATE INDEX IF NOT EXISTS idx_matches_status_updated
  ON matches(status, updated_at DESC);

-- Match participants lookup by match (used in every match detail load)
CREATE INDEX IF NOT EXISTS idx_match_participants_match_id
  ON match_participants(match_id);

-- Match participants lookup by user (for user's match history)
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id
  ON match_participants(user_id);

-- Match games lookup by match
CREATE INDEX IF NOT EXISTS idx_match_games_match_id
  ON match_games(match_id);

-- Tournament matches lookup by tournament
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id
  ON tournament_matches(tournament_id);

-- Tournament participants lookup by tournament
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id
  ON tournament_participants(tournament_id);

-- Matches filtered by tournament
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id
  ON matches(tournament_id)
  WHERE tournament_id IS NOT NULL;

-- Discord announcement queue processing (status-based polling)
CREATE INDEX IF NOT EXISTS idx_discord_announcement_queue_status
  ON discord_announcement_queue(status, created_at);
