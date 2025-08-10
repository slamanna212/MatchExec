-- Add player_notifications field to matches table
ALTER TABLE matches ADD COLUMN player_notifications BOOLEAN DEFAULT 1;