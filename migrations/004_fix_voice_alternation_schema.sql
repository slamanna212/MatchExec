-- Fix voice alternation table schema
-- This fixes the column naming mismatch where the code expects 'updated_at' but table has 'last_updated_at'

-- Add the expected 'updated_at' column with the same data as 'last_updated_at'
ALTER TABLE match_voice_alternation ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Copy existing timestamp data to the new column
UPDATE match_voice_alternation SET updated_at = last_updated_at;

-- Create a trigger to keep both columns in sync (for backwards compatibility)
CREATE TRIGGER IF NOT EXISTS sync_match_voice_alternation_timestamps 
AFTER UPDATE ON match_voice_alternation
WHEN NEW.updated_at IS NOT NULL
BEGIN
  UPDATE match_voice_alternation 
  SET last_updated_at = NEW.updated_at 
  WHERE match_id = NEW.match_id;
END;