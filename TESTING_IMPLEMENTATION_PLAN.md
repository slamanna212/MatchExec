# MatchExec Testing Infrastructure Implementation Plan

> **⚠️ NOTE: Frontend/E2E Tests Deferred**
>
> Frontend and end-to-end (Playwright) tests are temporarily deferred pending the UI refactor.
> Sections marked with `[DEFERRED - UI REFACTOR]` should be implemented after the frontend redesign is complete.
> Focus on backend unit tests, API integration tests, and database tests first.

## Overview

This plan implements a comprehensive testing infrastructure for the MatchExec project to prevent regressions and catch bugs before they reach production.

### Goals
- Prevent breaking changes from reaching production
- Catch API, database, scoring, and UI regressions automatically
- Enable fast feedback during development
- Maintain long-term code quality as the project grows

### Testing Stack
- **Vitest** - Unit and integration test runner (fast, TypeScript-native, ESM support)
- **Playwright** - End-to-end browser testing
- **Husky + lint-staged** - Pre-commit hooks
- **GitHub Actions** - CI/CD pipeline

---

## Phase 1: Install Dependencies and Configure Vitest

### 1.1 Install Testing Dependencies

Run:
```bash
npm install -D vitest @vitest/coverage-v8 @vitest/ui happy-dom
# [DEFERRED - UI REFACTOR] npm install -D @testing-library/react @testing-library/dom
npm install -D husky lint-staged
# [DEFERRED - UI REFACTOR] npm install -D @playwright/test
```

### 1.2 Create Vitest Configuration

Create file: `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx', 'lib/**/*.ts', 'processes/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/types.ts'],
    },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lib': path.resolve(__dirname, './lib'),
    },
  },
});
```

### 1.3 Create Playwright Configuration [DEFERRED - UI REFACTOR]

Create file: `playwright.config.ts`
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### 1.4 Create Test Setup File

Create directory and file: `tests/setup.ts`
```typescript
import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, resetTestDatabase } from './utils/test-db';

beforeAll(async () => {
  await setupTestDatabase();
});

afterEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});
```

### 1.5 Update package.json Scripts

Add these scripts to package.json:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:changed": "vitest run --changed",
    "test:unit": "vitest run --exclude='**/integration/**' --exclude='**/e2e/**'",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",       // [DEFERRED - UI REFACTOR]
    "test:e2e:ui": "playwright test --ui", // [DEFERRED - UI REFACTOR]
    "test:all": "npm run test && npm run test:e2e" // [DEFERRED - UI REFACTOR] use "npm run test" for now
  }
}
```

---

## Phase 2: Test Infrastructure Setup

### 2.1 Create Test Database Utilities

Create file: `tests/utils/test-db.ts`
```typescript
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const TEST_DB_PATH = path.join(process.cwd(), 'app_data', 'data', 'test-matchexec.db');

let testDb: sqlite3.Database | null = null;

export async function setupTestDatabase(): Promise<sqlite3.Database> {
  // Remove existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Create new test database
  testDb = new sqlite3.Database(TEST_DB_PATH);

  // Run migrations
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await runSql(testDb, sql);
  }

  // Set environment variable so app code uses test database
  process.env.DATABASE_PATH = TEST_DB_PATH;
  process.env.NODE_ENV = 'test';

  return testDb;
}

export async function resetTestDatabase(): Promise<void> {
  if (!testDb) return;

  // Get all table names except migrations
  const tables = await allAsync<{ name: string }>(
    testDb,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
  );

  // Delete data from all tables
  for (const table of tables) {
    await runSql(testDb, `DELETE FROM ${table.name}`);
  }
}

export async function teardownTestDatabase(): Promise<void> {
  if (testDb) {
    await new Promise<void>((resolve, reject) => {
      testDb!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    testDb = null;
  }

  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
}

export function getTestDb(): sqlite3.Database {
  if (!testDb) throw new Error('Test database not initialized');
  return testDb;
}

// Helper functions
function runSql(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function allAsync<T>(db: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}
```

### 2.2 Create Test Fixtures Factory

Create file: `tests/utils/fixtures.ts`
```typescript
import { getTestDb } from './test-db';

export interface MatchFixture {
  id: number;
  game_id: number;
  mode_id: number;
  maps_per_match: number;
  team_size: number;
  status: string;
  ruleset: string;
  created_at: string;
}

export interface TournamentFixture {
  id: number;
  name: string;
  game_id: number;
  format: 'single_elimination' | 'double_elimination';
  status: string;
}

export interface GameFixture {
  id: number;
  name: string;
  slug: string;
}

// Default test data
const defaults = {
  game: {
    name: 'Test Game',
    slug: 'test-game',
    logo_url: '/test-logo.png',
    data_version: '1.0.0',
  },
  gameMode: {
    name: 'Test Mode',
    slug: 'test-mode',
  },
  match: {
    maps_per_match: 3,
    team_size: 5,
    status: 'created',
    ruleset: 'competitive',
  },
  tournament: {
    name: 'Test Tournament',
    format: 'single_elimination',
    status: 'created',
    team_size: 5,
  },
};

export async function createGame(overrides: Partial<typeof defaults.game> = {}): Promise<GameFixture> {
  const db = getTestDb();
  const data = { ...defaults.game, ...overrides };

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO games (name, slug, logo_url, data_version) VALUES (?, ?, ?, ?)`,
      [data.name, data.slug, data.logo_url, data.data_version],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...data } as GameFixture);
      }
    );
  });
}

export async function createGameMode(gameId: number, overrides: Partial<typeof defaults.gameMode> = {}) {
  const db = getTestDb();
  const data = { ...defaults.gameMode, ...overrides };

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO game_modes (game_id, name, slug) VALUES (?, ?, ?)`,
      [gameId, data.name, data.slug],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, game_id: gameId, ...data });
      }
    );
  });
}

export async function createMatch(gameId: number, modeId: number, overrides: Partial<typeof defaults.match> = {}): Promise<MatchFixture> {
  const db = getTestDb();
  const data = { ...defaults.match, ...overrides };

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO matches (game_id, mode_id, maps_per_match, team_size, status, ruleset, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [gameId, modeId, data.maps_per_match, data.team_size, data.status, data.ruleset],
      function(err) {
        if (err) reject(err);
        else {
          db.get(`SELECT * FROM matches WHERE id = ?`, [this.lastID], (err, row) => {
            if (err) reject(err);
            else resolve(row as MatchFixture);
          });
        }
      }
    );
  });
}

export async function createMatchParticipant(matchId: number, discordUserId: string, team: number | null = null) {
  const db = getTestDb();

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO match_participants (match_id, discord_user_id, team, joined_at) VALUES (?, ?, ?, datetime('now'))`,
      [matchId, discordUserId, team],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, match_id: matchId, discord_user_id: discordUserId, team });
      }
    );
  });
}

export async function createTournament(gameId: number, overrides: Partial<typeof defaults.tournament> = {}): Promise<TournamentFixture> {
  const db = getTestDb();
  const data = { ...defaults.tournament, ...overrides };

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO tournaments (name, game_id, format, status, team_size, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [data.name, gameId, data.format, data.status, data.team_size],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, game_id: gameId, ...data } as TournamentFixture);
      }
    );
  });
}

// Queue fixtures for contract testing
export async function createQueueEntry(queueTable: string, data: Record<string, unknown>) {
  const db = getTestDb();
  const columns = Object.keys(data).join(', ');
  const placeholders = Object.keys(data).map(() => '?').join(', ');
  const values = Object.values(data);

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO ${queueTable} (${columns}) VALUES (${placeholders})`,
      values,
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...data });
      }
    );
  });
}

// Helper to seed common test data
export async function seedBasicTestData() {
  const game = await createGame();
  const mode = await createGameMode(game.id);
  return { game, mode };
}
```

### 2.3 Create API Test Helpers

Create file: `tests/utils/api-helpers.ts`
```typescript
import { NextRequest } from 'next/server';

// Helper to create mock NextRequest for API route testing
export function createMockRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): NextRequest {
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && method !== 'GET') {
    requestInit.body = JSON.stringify(body);
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), requestInit);
}

// Helper to parse API response
export async function parseResponse<T>(response: Response): Promise<{ status: number; data: T }> {
  const data = await response.json();
  return {
    status: response.status,
    data,
  };
}

// Helper for route params
export function createRouteParams(params: Record<string, string>): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve(params) };
}
```

### 2.4 Create Discord.js Mocks

Create file: `tests/mocks/discord.ts`
```typescript
import { vi } from 'vitest';

// Mock Discord.js Client
export const mockDiscordClient = {
  user: { id: 'bot-user-id', tag: 'TestBot#1234' },
  guilds: {
    cache: new Map(),
    fetch: vi.fn(),
  },
  channels: {
    cache: new Map(),
    fetch: vi.fn(),
  },
  users: {
    cache: new Map(),
    fetch: vi.fn(),
  },
  login: vi.fn().mockResolvedValue('token'),
  destroy: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  emit: vi.fn(),
  isReady: vi.fn().mockReturnValue(true),
};

// Mock Discord Channel
export function createMockChannel(overrides = {}) {
  return {
    id: 'channel-123',
    name: 'test-channel',
    type: 0, // GuildText
    send: vi.fn().mockResolvedValue({ id: 'message-123' }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Mock Discord Guild
export function createMockGuild(overrides = {}) {
  return {
    id: 'guild-123',
    name: 'Test Server',
    channels: {
      cache: new Map(),
      create: vi.fn().mockResolvedValue(createMockChannel()),
      fetch: vi.fn(),
    },
    members: {
      cache: new Map(),
      fetch: vi.fn(),
    },
    ...overrides,
  };
}

// Mock Discord Message
export function createMockMessage(overrides = {}) {
  return {
    id: 'message-123',
    content: 'Test message',
    channel: createMockChannel(),
    author: { id: 'user-123', tag: 'User#1234' },
    edit: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue({ id: 'reply-123' }),
    ...overrides,
  };
}

// Mock Voice Connection
export function createMockVoiceConnection() {
  return {
    state: { status: 'ready' },
    subscribe: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
  };
}

// Reset all mocks
export function resetDiscordMocks() {
  vi.clearAllMocks();
  mockDiscordClient.guilds.cache.clear();
  mockDiscordClient.channels.cache.clear();
  mockDiscordClient.users.cache.clear();
}
```

---

## Phase 3: Unit Tests

### 3.1 Scoring Functions Tests

Create file: `tests/unit/scoring-functions.test.ts`

Test the following functions from `src/lib/scoring-functions.ts`:
- `calculateMapScore()` - verify correct score calculation for different game modes
- `calculateMatchScore()` - verify overall match score from individual map scores
- `determineWinner()` - verify winner determination logic
- `validateScoreInput()` - verify score validation (no negative, within bounds)
- `formatScoreDisplay()` - verify score formatting for display

Test scenarios to cover:
1. Standard 3-0 sweep
2. Close 3-2 match
3. Tie-breaking scenarios
4. Invalid score inputs (negative numbers, non-integers)
5. Edge cases (0-0 scores, forfeit scenarios)
6. Different game-specific scoring (Overwatch rounds vs Valorant rounds)

```typescript
import { describe, it, expect } from 'vitest';
// Import scoring functions once implemented

describe('Scoring Functions', () => {
  describe('calculateMapScore', () => {
    it('should calculate correct score for standard map win', () => {
      // Test implementation
    });

    it('should handle tie scores correctly', () => {
      // Test implementation
    });

    it('should reject negative scores', () => {
      // Test implementation
    });
  });

  describe('calculateMatchScore', () => {
    it('should sum map wins correctly for best-of-3', () => {
      // Test implementation
    });

    it('should sum map wins correctly for best-of-5', () => {
      // Test implementation
    });
  });

  describe('determineWinner', () => {
    it('should return team 1 when they have more wins', () => {
      // Test implementation
    });

    it('should return null for incomplete match', () => {
      // Test implementation
    });
  });
});
```

### 3.2 Tournament Bracket Tests

Create file: `tests/unit/tournament-bracket.test.ts`

Test the following from `src/lib/tournament-bracket.ts`:
- `generateSingleEliminationBracket()` - verify bracket structure
- `generateDoubleEliminationBracket()` - verify winners/losers bracket structure
- `advanceWinner()` - verify correct bracket progression
- `calculateBracketSize()` - verify power-of-2 sizing with byes
- `assignSeeds()` - verify seeding distribution

Test scenarios:
1. 4-team single elimination (no byes)
2. 5-team single elimination (3 byes)
3. 8-team double elimination
4. Edge case: 1 team (instant winner)
5. Edge case: 2 teams (single match)
6. Losers bracket progression in double elimination
7. Grand finals reset scenario

```typescript
import { describe, it, expect } from 'vitest';
// Import bracket functions

describe('Tournament Bracket', () => {
  describe('generateSingleEliminationBracket', () => {
    it('should create correct bracket for 4 teams', () => {
      // Expect 3 matches: 2 semifinals + 1 final
    });

    it('should add byes for non-power-of-2 team counts', () => {
      // 5 teams should have 3 byes, 8 bracket slots
    });

    it('should handle minimum 2 teams', () => {
      // Single match final
    });
  });

  describe('generateDoubleEliminationBracket', () => {
    it('should create winners and losers brackets', () => {
      // Verify structure
    });

    it('should connect losers bracket correctly', () => {
      // Verify losers receive from winners
    });
  });

  describe('advanceWinner', () => {
    it('should move winner to next match in bracket', () => {
      // Verify progression
    });

    it('should move loser to losers bracket in double elim', () => {
      // Verify losers bracket placement
    });
  });
});
```

### 3.3 Transition Handler Tests

Create file: `tests/unit/transition-handlers.test.ts`

Test state transitions from `src/lib/transition-handlers.ts`:
- Valid transitions: created→gather, gather→assign, assign→battle, battle→complete
- Invalid transitions should throw
- Side effects should be queued correctly

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Transition Handlers', () => {
  describe('validateTransition', () => {
    it('should allow created → gather', () => {});
    it('should allow gather → assign', () => {});
    it('should allow assign → battle', () => {});
    it('should allow battle → complete', () => {});
    it('should allow battle → cancelled', () => {});
    it('should reject gather → complete (skip states)', () => {});
    it('should reject backwards transitions', () => {});
  });

  describe('handleGatherTransition', () => {
    it('should queue announcement on gather', () => {});
  });

  describe('handleBattleTransition', () => {
    it('should create voice channels', () => {});
    it('should queue map codes', () => {});
    it('should initialize match games', () => {});
  });
});
```

### 3.4 Validation Helper Tests

Create file: `tests/unit/validation.test.ts`

Test input validation from API helpers:
- Match creation validation
- Tournament creation validation
- Score input validation
- Discord ID validation

---

## Phase 4: API Integration Tests

### 4.1 Match API Tests

Create file: `tests/integration/api/matches.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch, createMatchParticipant } from '../../utils/fixtures';
import { GET, POST } from '@/app/api/matches/route';
import { GET as getMatch, PUT as updateMatch, DELETE as deleteMatch } from '@/app/api/matches/[matchId]/route';

describe('Matches API', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  describe('GET /api/matches', () => {
    it('should return empty array when no matches exist', async () => {
      const request = createMockRequest('GET', '/api/matches');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.matches).toEqual([]);
    });

    it('should return all matches', async () => {
      await createMatch(game.id, mode.id);
      await createMatch(game.id, mode.id);

      const request = createMockRequest('GET', '/api/matches');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.matches).toHaveLength(2);
    });

    it('should filter by status', async () => {
      await createMatch(game.id, mode.id, { status: 'created' });
      await createMatch(game.id, mode.id, { status: 'complete' });

      const request = createMockRequest('GET', '/api/matches?status=created');
      const response = await GET(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.matches).toHaveLength(1);
      expect(data.matches[0].status).toBe('created');
    });
  });

  describe('POST /api/matches', () => {
    it('should create a match with valid data', async () => {
      const request = createMockRequest('POST', '/api/matches', {
        game_id: game.id,
        mode_id: mode.id,
        maps_per_match: 3,
        team_size: 5,
        ruleset: 'competitive',
      });

      const response = await POST(request);
      const { status, data } = await parseResponse(response);

      expect(status).toBe(201);
      expect(data.match.id).toBeDefined();
      expect(data.match.status).toBe('created');
    });

    it('should reject invalid game_id', async () => {
      const request = createMockRequest('POST', '/api/matches', {
        game_id: 99999,
        mode_id: mode.id,
        maps_per_match: 3,
        team_size: 5,
      });

      const response = await POST(request);
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const request = createMockRequest('POST', '/api/matches', {
        game_id: game.id,
        // missing mode_id, maps_per_match, team_size
      });

      const response = await POST(request);
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });
  });

  describe('GET /api/matches/[matchId]', () => {
    it('should return match details', async () => {
      const match = await createMatch(game.id, mode.id);

      const request = createMockRequest('GET', `/api/matches/${match.id}`);
      const response = await getMatch(request, createRouteParams({ matchId: String(match.id) }));
      const { status, data } = await parseResponse(response);

      expect(status).toBe(200);
      expect(data.match.id).toBe(match.id);
    });

    it('should return 404 for non-existent match', async () => {
      const request = createMockRequest('GET', '/api/matches/99999');
      const response = await getMatch(request, createRouteParams({ matchId: '99999' }));
      const { status } = await parseResponse(response);

      expect(status).toBe(404);
    });
  });

  describe('DELETE /api/matches/[matchId]', () => {
    it('should delete a match in created status', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'created' });

      const request = createMockRequest('DELETE', `/api/matches/${match.id}`);
      const response = await deleteMatch(request, createRouteParams({ matchId: String(match.id) }));
      const { status } = await parseResponse(response);

      expect(status).toBe(200);
    });

    it('should prevent deleting match in battle status', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'battle' });

      const request = createMockRequest('DELETE', `/api/matches/${match.id}`);
      const response = await deleteMatch(request, createRouteParams({ matchId: String(match.id) }));
      const { status } = await parseResponse(response);

      expect(status).toBe(400);
    });
  });
});
```

### 4.2 Match Transition API Tests

Create file: `tests/integration/api/match-transitions.test.ts`

Test all match state transitions:
- created → gather (with announcement queue verification)
- gather → assign (with team assignment)
- assign → battle (with voice channel and map code queuing)
- battle → complete (with scoring finalization)
- battle → cancelled (cleanup verification)

### 4.3 Match Participants API Tests

Create file: `tests/integration/api/match-participants.test.ts`

Test participant management:
- Adding participants
- Removing participants
- Team assignment
- Participant limits

### 4.4 Match Results API Tests

Create file: `tests/integration/api/match-results.test.ts`

Test result submission:
- Submitting map results
- Score validation
- Match completion triggering
- Invalid score rejection

### 4.5 Tournament API Tests

Create file: `tests/integration/api/tournaments.test.ts`

Test tournament CRUD and operations:
- Create tournament
- Add teams
- Generate bracket
- Advance matches
- Complete tournament

### 4.6 Games API Tests

Create file: `tests/integration/api/games.test.ts`

Test game data endpoints:
- List games
- Get game modes
- Get game maps

### 4.7 Settings API Tests

Create file: `tests/integration/api/settings.test.ts`

Test settings endpoints:
- Get/update Discord settings
- Get/update announcer settings
- Get/update UI settings

---

## Phase 5: Queue Contract Tests

### 5.1 Queue Structure Tests

Create file: `tests/integration/queues/queue-contracts.test.ts`

Test that queue entries have required fields for consumers:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDb } from '../../utils/test-db';
import { createMatch, seedBasicTestData } from '../../utils/fixtures';

describe('Queue Contracts', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  describe('discord_announcement_queue', () => {
    it('should have required fields for AnnouncementHandler', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);

      // Insert via the same code path as production
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO discord_announcement_queue
           (match_id, announcement_type, status, created_at)
           VALUES (?, ?, ?, datetime('now'))`,
          [match.id, 'match_created', 'pending'],
          (err) => err ? reject(err) : resolve()
        );
      });

      // Verify structure matches what consumer expects
      const entry = await new Promise<any>((resolve, reject) => {
        db.get(
          `SELECT * FROM discord_announcement_queue WHERE match_id = ?`,
          [match.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('match_id');
      expect(entry).toHaveProperty('announcement_type');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('created_at');
      expect(entry.status).toBe('pending');
    });
  });

  describe('discord_voice_announcement_queue', () => {
    it('should have required fields for VoiceHandler', async () => {
      // Similar structure test
    });
  });

  describe('discord_reminder_queue', () => {
    it('should have required fields for ReminderHandler', async () => {
      // Similar structure test
    });
  });

  // Add tests for all 11 queue tables:
  // - discord_status_update_queue
  // - discord_match_reminder_queue
  // - discord_player_reminder_queue
  // - discord_match_start_queue
  // - discord_deletion_queue
  // - discord_score_notification_queue
  // - discord_map_code_queue
  // - discord_match_winner_queue
});
```

---

## Phase 6: Database/Migration Tests

### 6.1 Migration Tests

Create file: `tests/integration/database/migrations.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

describe('Database Migrations', () => {
  it('should run all migrations without error', async () => {
    const testDbPath = path.join(process.cwd(), 'app_data', 'data', 'migration-test.db');

    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    const db = new sqlite3.Database(testDbPath);
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await new Promise<void>((resolve, reject) => {
        db.exec(sql, (err) => {
          if (err) reject(new Error(`Migration ${file} failed: ${err.message}`));
          else resolve();
        });
      });
    }

    // Verify key tables exist
    const tables = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('matches');
    expect(tableNames).toContain('tournaments');
    expect(tableNames).toContain('games');
    expect(tableNames).toContain('discord_announcement_queue');

    // Cleanup
    db.close();
    fs.unlinkSync(testDbPath);
  });

  it('should be idempotent (running twice should not error)', async () => {
    // Test that migrations handle "IF NOT EXISTS" correctly
  });
});
```

### 6.2 Schema Validation Tests

Create file: `tests/integration/database/schema.test.ts`

Verify table structures match expected schemas:
- Required columns exist
- Foreign keys are valid
- Indexes are present

### 6.3 Seeder Tests

Create file: `tests/integration/database/seeder.test.ts`

Test game data seeding:
- All 6 games are seeded
- Modes and maps are linked correctly
- Re-seeding doesn't create duplicates

---

## Phase 7: Discord Bot Module Tests

### 7.1 Queue Processor Tests

Create file: `tests/unit/discord-bot/queue-processor.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';

// Mock the discord.js module
vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockDiscordClient),
  GatewayIntentBits: { Guilds: 1, GuildMessages: 2 },
  Events: { ClientReady: 'ready' },
}));

describe('QueueProcessor', () => {
  beforeEach(() => {
    resetDiscordMocks();
  });

  describe('processAnnouncementQueue', () => {
    it('should process pending announcements', async () => {
      // Test queue processing
    });

    it('should mark entries as completed after processing', async () => {
      // Verify status update
    });

    it('should handle errors gracefully', async () => {
      // Verify error handling doesn't crash processor
    });

    it('should skip already-processed entries', async () => {
      // Verify idempotency
    });
  });

  describe('processVoiceAnnouncementQueue', () => {
    it('should play voice announcements', async () => {
      // Test voice handling
    });
  });

  describe('processReminderQueue', () => {
    it('should send DM reminders', async () => {
      // Test reminder sending
    });
  });
});
```

### 7.2 Announcement Handler Tests

Create file: `tests/unit/discord-bot/announcement-handler.test.ts`

Test embed generation and message formatting.

### 7.3 Voice Handler Tests

Create file: `tests/unit/discord-bot/voice-handler.test.ts`

Test voice connection and audio playback logic.

---

## Phase 8: End-to-End Tests [DEFERRED - UI REFACTOR]

> **This entire phase is deferred until after the frontend UI refactor is complete.**
> Playwright E2E tests depend on stable UI selectors and page structure.

### 8.1 Create E2E Test Directory

Create directory: `e2e/`

### 8.2 Critical Path: Match Lifecycle

Create file: `e2e/match-lifecycle.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Match Lifecycle', () => {
  test('should create and complete a full match', async ({ page }) => {
    // 1. Navigate to match creation
    await page.goto('/matches/create');

    // 2. Fill match creation form
    await page.selectOption('[data-testid="game-select"]', 'overwatch-2');
    await page.selectOption('[data-testid="mode-select"]', 'control');
    await page.fill('[data-testid="team-size"]', '5');
    await page.fill('[data-testid="maps-per-match"]', '3');
    await page.click('[data-testid="create-match-btn"]');

    // 3. Verify match created
    await expect(page).toHaveURL(/\/matches\/\d+/);
    await expect(page.locator('[data-testid="match-status"]')).toHaveText('Created');

    // 4. Transition to gather
    await page.click('[data-testid="start-gather-btn"]');
    await expect(page.locator('[data-testid="match-status"]')).toHaveText('Gathering');

    // 5. Add participants (mock or use test data)
    // ...

    // 6. Transition through states
    // ...

    // 7. Submit results
    // ...

    // 8. Verify completion
    await expect(page.locator('[data-testid="match-status"]')).toHaveText('Complete');
  });
});
```

### 8.3 Critical Path: Tournament Lifecycle

Create file: `e2e/tournament-lifecycle.spec.ts`

Test complete tournament flow from creation to completion.

### 8.4 Settings Management

Create file: `e2e/settings.spec.ts`

Test settings pages load and save correctly.

### 8.5 Welcome Flow

Create file: `e2e/welcome-flow.spec.ts`

Test first-time setup wizard.

---

## Phase 9: Pre-commit Hooks Setup

### 9.1 Initialize Husky

Run:
```bash
npx husky init
```

### 9.2 Create Pre-commit Hook

Create file: `.husky/pre-commit`
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

### 9.3 Configure lint-staged

Add to `package.json`:
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "vitest related --run"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

---

## Phase 10: GitHub Actions CI/CD

### 10.1 Update PR Checks Workflow

Update file: `.github/workflows/pr-checks.yml`
```yaml
name: PR Checks

on:
  pull_request:
    branches: [main, dev]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
          fail_ci_if_error: false

  integration-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration
```

### 10.2 Create Main Branch Workflow

Create file: `.github/workflows/main-checks.yml`
```yaml
name: Main Branch Checks

on:
  push:
    branches: [main]

jobs:
  full-test-suite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - run: npm run test:integration

  # [DEFERRED - UI REFACTOR] Uncomment after frontend redesign is complete
  # e2e-tests:
  #   runs-on: ubuntu-latest
  #   steps:
  #     - uses: actions/checkout@v4
  #     - uses: actions/setup-node@v4
  #       with:
  #         node-version: '20'
  #         cache: 'npm'
  #     - run: npm ci
  #     - run: npx playwright install --with-deps chromium
  #     - run: npm run build
  #     - run: npm run test:e2e
  #     - uses: actions/upload-artifact@v4
  #       if: failure()
  #       with:
  #         name: playwright-report
  #         path: playwright-report/
  #         retention-days: 7
```

---

## Phase 11: VSCode Integration

### 11.1 Create VSCode Tasks

Create file: `.vscode/tasks.json`
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Run All Tests",
      "type": "shell",
      "command": "npm run test",
      "group": "test",
      "problemMatcher": []
    },
    {
      "label": "Run Tests (Watch Mode)",
      "type": "shell",
      "command": "npm run test:watch",
      "group": "test",
      "isBackground": true,
      "problemMatcher": []
    },
    {
      "label": "Run Tests with UI",
      "type": "shell",
      "command": "npm run test:ui",
      "group": "test",
      "problemMatcher": []
    },
    {
      "label": "Run Unit Tests Only",
      "type": "shell",
      "command": "npm run test:unit",
      "group": "test",
      "problemMatcher": []
    },
    {
      "label": "Run Integration Tests",
      "type": "shell",
      "command": "npm run test:integration",
      "group": "test",
      "problemMatcher": []
    },
    {
      "label": "Run Tests with Coverage",
      "type": "shell",
      "command": "npm run test:coverage",
      "group": "test",
      "problemMatcher": []
    },
    // [DEFERRED - UI REFACTOR] E2E test tasks - uncomment after UI refactor
    // {
    //   "label": "Run E2E Tests",
    //   "type": "shell",
    //   "command": "npm run test:e2e",
    //   "group": "test",
    //   "problemMatcher": []
    // },
    // {
    //   "label": "Run E2E Tests with UI",
    //   "type": "shell",
    //   "command": "npm run test:e2e:ui",
    //   "group": "test",
    //   "problemMatcher": []
    // },
    {
      "label": "Run Tests for Current File",
      "type": "shell",
      "command": "npx vitest run ${relativeFile}",
      "group": "test",
      "problemMatcher": []
    }
  ]
}
```

### 11.2 Create VSCode Launch Configurations

Create/update file: `.vscode/launch.json`
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Current Test File",
      "autoAttachChildProcesses": true,
      "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
      "program": "${workspaceRoot}/node_modules/vitest/vitest.mjs",
      "args": ["run", "${relativeFile}"],
      "smartStep": true,
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug All Tests",
      "autoAttachChildProcesses": true,
      "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
      "program": "${workspaceRoot}/node_modules/vitest/vitest.mjs",
      "args": ["run"],
      "smartStep": true,
      "console": "integratedTerminal"
    }
  ]
}
```

### 11.3 Recommended VSCode Extensions

Create/update file: `.vscode/extensions.json`
```json
{
  "recommendations": [
    "vitest.explorer"
    // [DEFERRED - UI REFACTOR] "ms-playwright.playwright"
  ]
}
```

---

## Phase 12: Documentation

### 12.1 Update CLAUDE.md

Add testing section to CLAUDE.md with:
- How to run tests
- Test file naming conventions
- How to add new tests
- Coverage requirements

---

## Verification Checklist

After implementation, verify:

1. **Unit tests run**: `npm run test:unit` passes
2. **Integration tests run**: `npm run test:integration` passes
3. ~~**E2E tests run**: `npm run test:e2e` passes~~ [DEFERRED - UI REFACTOR]
4. **Coverage report generated**: `npm run test:coverage` creates coverage/
5. **Pre-commit hooks work**: Make a change, commit, verify tests run
6. **VSCode tasks work**: Open Command Palette → Run Task → verify test tasks appear
7. **GitHub Actions work**: Create a test PR, verify checks run
8. **Vitest UI works**: `npm run test:ui` opens browser UI

---

## Implementation Order

Execute phases in this order for incremental value:

1. **Phase 1** - Install dependencies, configure Vitest (skip Playwright/React Testing Library for now)
2. **Phase 2** - Create test infrastructure (test-db, fixtures, helpers)
3. **Phase 11** - VSCode integration (so you can run tests easily, skip E2E tasks)
4. **Phase 3** - Unit tests for critical business logic
5. **Phase 4** - API integration tests (highest value)
6. **Phase 5** - Queue contract tests
7. **Phase 6** - Database/migration tests
8. **Phase 9** - Pre-commit hooks
9. **Phase 10** - GitHub Actions CI (skip e2e-tests job)
10. **Phase 7** - Discord bot module tests
11. **Phase 12** - Documentation updates
12. ~~**Phase 8** - E2E tests~~ [DEFERRED - UI REFACTOR] - Implement after frontend redesign

---

## Files to Create Summary

```
├── vitest.config.ts
├── playwright.config.ts              # [DEFERRED - UI REFACTOR]
├── tests/
│   ├── setup.ts
│   ├── utils/
│   │   ├── test-db.ts
│   │   ├── fixtures.ts
│   │   └── api-helpers.ts
│   ├── mocks/
│   │   └── discord.ts
│   ├── unit/
│   │   ├── scoring-functions.test.ts
│   │   ├── tournament-bracket.test.ts
│   │   ├── transition-handlers.test.ts
│   │   ├── validation.test.ts
│   │   └── discord-bot/
│   │       ├── queue-processor.test.ts
│   │       ├── announcement-handler.test.ts
│   │       └── voice-handler.test.ts
│   └── integration/
│       ├── api/
│       │   ├── matches.test.ts
│       │   ├── match-transitions.test.ts
│       │   ├── match-participants.test.ts
│       │   ├── match-results.test.ts
│       │   ├── tournaments.test.ts
│       │   ├── games.test.ts
│       │   └── settings.test.ts
│       ├── queues/
│       │   └── queue-contracts.test.ts
│       └── database/
│           ├── migrations.test.ts
│           ├── schema.test.ts
│           └── seeder.test.ts
├── e2e/                               # [DEFERRED - UI REFACTOR]
│   ├── match-lifecycle.spec.ts        # [DEFERRED - UI REFACTOR]
│   ├── tournament-lifecycle.spec.ts   # [DEFERRED - UI REFACTOR]
│   ├── settings.spec.ts               # [DEFERRED - UI REFACTOR]
│   └── welcome-flow.spec.ts           # [DEFERRED - UI REFACTOR]
├── .husky/
│   └── pre-commit
├── .vscode/
│   ├── tasks.json
│   ├── launch.json
│   └── extensions.json
└── .github/workflows/
    ├── pr-checks.yml (update)
    └── main-checks.yml (new)
```

---

## Critical Files to Understand Before Implementation

Before writing tests, read these files to understand the code being tested:

1. `src/lib/scoring-functions.ts` - Scoring logic
2. `src/lib/tournament-bracket.ts` - Bracket generation
3. `src/lib/transition-handlers.ts` - State machine
4. `src/app/api/matches/route.ts` - Match API patterns
5. `processes/discord-bot/modules/queue-processor.ts` - Queue processing
6. `migrations/*.sql` - Database schema
