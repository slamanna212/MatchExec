-- Add supports_all_modes flag to games table
-- This allows games like Valorant where all maps work with all modes

ALTER TABLE games ADD COLUMN supports_all_modes BOOLEAN DEFAULT 0;