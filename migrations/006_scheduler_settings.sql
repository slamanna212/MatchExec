-- Create scheduler settings table
CREATE TABLE IF NOT EXISTS scheduler_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_check_cron TEXT DEFAULT '0 */5 * * * *',  -- Every 5 minutes
  reminder_check_cron TEXT DEFAULT '0 0 */4 * * *',    -- Every 4 hours
  cleanup_check_cron TEXT DEFAULT '0 0 2 * * *',       -- Daily at 2 AM
  report_generation_cron TEXT DEFAULT '0 0 0 * * 0',   -- Weekly on Sunday
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS scheduler_settings_updated_at 
  AFTER UPDATE ON scheduler_settings
  FOR EACH ROW
BEGIN
  UPDATE scheduler_settings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Insert default settings row (only one row should exist)
INSERT INTO scheduler_settings (id) VALUES (1)
ON CONFLICT(id) DO NOTHING;