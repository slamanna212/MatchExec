-- Phase 1a: match_teams, match_game_placements, and new columns
-- Adds the foundation for scoring_type-aware match management.
-- Legacy columns are NOT dropped here — they remain until migration 023 (Phase 8).

-- ── match_teams ──────────────────────────────────────────────────────────────
-- Replaces hardcoded blue/red team handling. Normal matches get 2 rows;
-- FFA/Position matches get one row per participant (auto-created at assign).
CREATE TABLE IF NOT EXISTS match_teams (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  team_color TEXT,          -- hex string for future stream overlays
  team_order INTEGER NOT NULL,
  voice_channel_id TEXT,    -- Discord voice channel for this team (nullable)
  is_reserve BOOLEAN DEFAULT 0,
  UNIQUE(match_id, team_order)
);

CREATE INDEX IF NOT EXISTS idx_match_teams_match ON match_teams(match_id);

-- ── match_game_placements ────────────────────────────────────────────────────
-- Unified result table replacing all per-mode result columns on match_games.
-- entity_type='team' → entity_id is a match_teams.id
-- entity_type='participant' → entity_id is a match_participants.id (validated app-side)
CREATE TABLE IF NOT EXISTS match_game_placements (
  id TEXT PRIMARY KEY,
  match_game_id TEXT NOT NULL REFERENCES match_games(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('team', 'participant')),
  entity_id TEXT NOT NULL,
  position INTEGER,          -- 1-based; null if unranked / DNF
  score INTEGER,             -- raw score, optional
  points_awarded INTEGER,    -- computed from scoring spread (Position mode)
  is_winner BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_game_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_placements_match_game ON match_game_placements(match_game_id);
CREATE INDEX IF NOT EXISTS idx_placements_entity ON match_game_placements(entity_type, entity_id);

-- ── New columns ───────────────────────────────────────────────────────────────

-- matches: denormalized team count + per-match position scoring override
ALTER TABLE matches ADD COLUMN team_count INTEGER DEFAULT 2;
ALTER TABLE matches ADD COLUMN position_scoring_override TEXT;

-- match_participants: FK to the team row this participant belongs to
ALTER TABLE match_participants ADD COLUMN team_id TEXT REFERENCES match_teams(id);
CREATE INDEX IF NOT EXISTS idx_match_participants_team_id ON match_participants(team_id);

-- tournaments: per-tournament position scoring override
ALTER TABLE tournaments ADD COLUMN position_scoring_override TEXT;

-- game_modes: declarative list of assign-phase components, JSON array
-- e.g. ["teams"] | ["confirm_participants"] | ["qualifying","grid_order"]
-- NULL means use the scoring_type default at runtime.
ALTER TABLE game_modes ADD COLUMN setup_components TEXT;

-- scorecard_player_stats: nullable FK to match_teams row (replaces authoritative role of team_side)
ALTER TABLE scorecard_player_stats ADD COLUMN team_id TEXT REFERENCES match_teams(id);
CREATE INDEX IF NOT EXISTS idx_scorecard_player_stats_team_id ON scorecard_player_stats(team_id);
