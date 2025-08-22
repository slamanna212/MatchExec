-- Add map codes support to matches table and games table
-- This migration adds a map_codes column to store JSON data with map codes for each map
-- and map_codes_supported column to games table to indicate support

ALTER TABLE matches ADD COLUMN map_codes TEXT;
ALTER TABLE games ADD COLUMN map_codes_supported INTEGER DEFAULT 0;

-- Index for performance on map_codes queries
CREATE INDEX IF NOT EXISTS idx_matches_map_codes ON matches(map_codes);
CREATE INDEX IF NOT EXISTS idx_games_map_codes_supported ON games(map_codes_supported);