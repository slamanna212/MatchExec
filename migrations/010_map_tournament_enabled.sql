-- Add tournament_enabled flag to game_maps
ALTER TABLE game_maps ADD COLUMN tournament_enabled INTEGER DEFAULT 1;
