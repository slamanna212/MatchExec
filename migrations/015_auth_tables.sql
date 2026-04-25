-- Role mappings: Discord server role ID → App permission level
-- Core auth tables (user, session, account, verification) are managed by Better Auth at startup.

CREATE TABLE IF NOT EXISTS "role_mappings" (
  "id"                INTEGER PRIMARY KEY AUTOINCREMENT,
  "discord_role_id"   TEXT    NOT NULL UNIQUE,
  "discord_role_name" TEXT    NOT NULL,
  "discord_role_color" INTEGER NOT NULL DEFAULT 0,
  "app_role"          TEXT    NOT NULL
    CHECK("app_role" IN ('owner', 'admin', 'moderator', 'viewer')),
  "created_at"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_role_mappings_discord_role
  ON "role_mappings"("discord_role_id");
