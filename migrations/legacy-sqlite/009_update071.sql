-- Add scheduled_for column to discord_announcement_queue
-- This allows the bot to hold timed announcements until their scheduled time
ALTER TABLE discord_announcement_queue ADD COLUMN scheduled_for DATETIME;
CREATE INDEX IF NOT EXISTS idx_discord_announcement_queue_scheduled
  ON discord_announcement_queue(scheduled_for);
