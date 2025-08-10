-- Add announcer_voice and voice_announcements_enabled fields to discord_settings table
ALTER TABLE discord_settings ADD COLUMN announcer_voice TEXT DEFAULT 'wrestling-announcer';
ALTER TABLE discord_settings ADD COLUMN voice_announcements_enabled BOOLEAN DEFAULT 0;