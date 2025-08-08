-- Add announcement role settings to discord_settings table
ALTER TABLE discord_settings ADD COLUMN announcement_role_id TEXT;
ALTER TABLE discord_settings ADD COLUMN mention_everyone INTEGER DEFAULT 0;