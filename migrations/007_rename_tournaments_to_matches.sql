-- Rename tournament tables to match tables

-- Rename tournaments table to matches
ALTER TABLE tournaments RENAME TO matches;

-- Rename tournament_participants table to match_participants
ALTER TABLE tournament_participants RENAME TO match_participants;

-- Rename tournament_matches table to match_games
ALTER TABLE tournament_matches RENAME TO match_games;

-- Update foreign key references in match_participants
-- (SQLite doesn't support ALTER COLUMN directly, but the foreign key constraint names will update automatically)

-- Update foreign key references in match_games
-- The FOREIGN KEY constraints will automatically reference the renamed tables

-- Rename indexes to match new table names
DROP INDEX IF EXISTS idx_tournaments_guild_id;
DROP INDEX IF EXISTS idx_tournaments_status;
DROP INDEX IF EXISTS idx_tournament_participants_user_id;
DROP INDEX IF EXISTS idx_tournament_matches_tournament_id;
DROP INDEX IF EXISTS idx_tournament_matches_status;

-- Create new indexes with updated names
CREATE INDEX IF NOT EXISTS idx_matches_guild_id ON matches(guild_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id ON match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_games_match_id ON match_games(match_id);
CREATE INDEX IF NOT EXISTS idx_match_games_status ON match_games(status);

-- Update column names to use match terminology
ALTER TABLE match_participants RENAME COLUMN tournament_id TO match_id;
ALTER TABLE match_games RENAME COLUMN tournament_id TO match_id;