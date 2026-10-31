ALTER TABLE discord_settings ADD COLUMN signup_dm_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE discord_settings ADD COLUMN commander_dm_enabled INTEGER NOT NULL DEFAULT 1;
