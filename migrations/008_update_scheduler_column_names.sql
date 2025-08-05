-- Update scheduler settings column names from tournament to match

-- Rename tournament_check_cron to match_check_cron
ALTER TABLE scheduler_settings RENAME COLUMN tournament_check_cron TO match_check_cron;