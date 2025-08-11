-- Add announcements field to matches table to store timed announcement configurations
ALTER TABLE matches ADD COLUMN announcements TEXT;