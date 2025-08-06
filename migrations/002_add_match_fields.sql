-- Add additional fields to matches table for better structure
ALTER TABLE matches ADD COLUMN rules TEXT;
ALTER TABLE matches ADD COLUMN rounds INTEGER;
ALTER TABLE matches ADD COLUMN maps TEXT; -- JSON array of map IDs
ALTER TABLE matches ADD COLUMN livestream_link TEXT;