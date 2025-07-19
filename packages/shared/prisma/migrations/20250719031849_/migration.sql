-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "userId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "characters_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mapType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maps_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "game_modes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "game_modes_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "mapId" TEXT,
    "gameModeId" TEXT,
    "matchCode" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "matches_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "matches_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "matches_gameModeId_fkey" FOREIGN KEY ("gameModeId") REFERENCES "game_modes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "match_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "characterId" TEXT,
    "team" TEXT,
    "result" TEXT,
    "score" INTEGER,
    "placement" INTEGER,
    "statsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "match_results_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "match_results_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "match_results_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "matchId" TEXT,
    "statType" TEXT NOT NULL,
    "period" TEXT,
    "statisticsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "player_stats_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "player_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "player_stats_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "job_queue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "job_queue_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "games_name_key" ON "games"("name");

-- CreateIndex
CREATE UNIQUE INDEX "players_gameId_username_key" ON "players"("gameId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "characters_gameId_name_key" ON "characters"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "maps_gameId_name_key" ON "maps"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "game_modes_gameId_name_key" ON "game_modes"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_matchId_playerId_key" ON "match_results"("matchId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "player_stats_gameId_playerId_matchId_statType_period_key" ON "player_stats"("gameId", "playerId", "matchId", "statType", "period");

-- CreateIndex
CREATE INDEX "job_queue_status_scheduledAt_idx" ON "job_queue"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "job_queue_jobType_status_idx" ON "job_queue"("jobType", "status");
