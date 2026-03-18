# MatchExec Match Bot

A Discord match and tournament management bot built with Next.js, React, Mantine, and multi-process architecture managed by PM2 (development) or s6-overlay (production/Docker).

**Features**: Match scheduling, tournament brackets (single/double elimination), team management, scoring system, voice announcements, Discord integration, multi-game support (Overwatch 2, Valorant, Marvel Rivals, League of Legends, R6 Siege, Counter-Strike 2).

## Architecture

This project uses a multi-process architecture with different process managers for different environments:

**Development**: PM2 manages all processes with hot reload
**Production/Docker**: s6-overlay manages processes in containerized environments

### Core Processes

1. **Web App** (`src/app/`): Next.js application with Mantine UI components
2. **Discord Bot** (`processes/discord-bot/`): Discord.js bot for match commands
3. **Scheduler** (`processes/scheduler/`): Cron jobs for match management

## Development

### Prerequisites
- Node.js 18+
- npm
- PM2 (installed as dependency)

### Setup
```bash
npm install
```

### Running in Development
```bash
# Start all processes with hot reload
npm run dev:all

# View logs from all processes
npm run dev:logs

# Stop all processes
npm run dev:stop

# Restart all processes
npm run dev:restart
```

## Debugging Workflow

When debugging issues in this project, follow this collaborative approach for speed and efficiency:

### Process

1. **User provides context**: Share error messages, logs, symptoms, what broke, and any theories about the cause
2. **Claude provides diagnostic commands**: Specific commands to run for targeted investigation
3. **User runs commands and pastes output**: Creates a fast feedback loop
4. **Claude analyzes and provides fix**: Or requests more specific info if needed

This workflow is strongly preferred over extensive autonomous exploration with numerous tool calls. It maintains speed while avoiding risky assumptions.

### Common Diagnostic Commands

```bash
# View recent logs from all processes
npm run dev:logs | tail -100

# Check Discord bot logs
tail -50 ./app_data/data/logs/discord-bot.log

# Check scheduler logs
tail -50 ./app_data/data/logs/scheduler.log

# Check PM2 process status
npx pm2 status

# Query database directly
sqlite3 ./app_data/data/matchexec.db "SELECT * FROM matches ORDER BY id DESC LIMIT 5;"

# Check for errors in logs
npm run dev:logs | grep -i error

# Monitor logs in real-time
npm run dev:logs --lines 0
```

### Example Interaction

**User**: "Match creation is broken, getting a 500 error"

**Claude**: "Can you run these commands and paste the output?
1. `npm run dev:logs | grep -A 5 'error'`
2. `tail -50 ./app_data/data/logs/discord-bot.log`
3. Check browser console for any errors"

**User**: [pastes results]

**Claude**: "I see the issue on line X. Here's the fix..."

## Production Using Docker

The production Docker container uses s6-overlay as the init system to manage all processes.

### Building and Running
```bash
# Build the container
docker build -t matchexec .

# Run with environment file
docker run -p 3000:3000 --env-file .env matchexec

# Run for testing (no data persistence)
docker run --rm -p 3000:3000 matchexec
```

### s6-overlay Process Management

The container uses s6-overlay v3 to manage processes:

- **Automatic service startup**: All processes start automatically via s6 supervision
- **Process dependencies**: Services wait for database migration to complete
- **Graceful shutdown**: Proper signal handling for clean container stops
- **Process restart**: Failed processes are automatically restarted
- **User management**: Processes run as non-root user for security

### Adding Process Dependencies (Docker)

When a Discord bot or scheduler process needs a new npm package that **cannot be bundled by esbuild** (native modules, packages with dynamic requires), you need to:

1. **Add the package to `package.json`** as a normal dependency (Dependabot/npm update manages versions here)
2. **Mark it as `external`** in the relevant esbuild config (`esbuild.discord-bot.config.mjs` or `esbuild.scheduler.config.mjs`)
3. **Add the package name** to the `PROCESS_DEPS` array in `scripts/collect-process-deps.mjs`

The collect script automatically traces transitive dependencies — you only need to add the top-level package name. Versions are pulled from the main `node_modules/` (managed by `package-lock.json`), so there's nothing else to keep in sync.

**When you DON'T need to update the collect script:**
- Pure JS packages that esbuild can bundle (just don't add them to `external`)
- Packages already in Next.js standalone output (e.g., `sqlite3` — used by the web app)
- Dev dependencies (not in the Docker image)

**Testing:** After changes, build the Docker image and verify all processes start:
```bash
docker build -t matchexec:test .
docker run --rm -p 3000:3000 --env-file .env matchexec:test
```

## Project Structure

├── src/
│   ├── app/                      # Next.js application
│   │   ├── api/                  # REST API routes (47+ endpoints)
│   │   │   ├── matches/          # Match management endpoints
│   │   │   ├── tournaments/      # Tournament endpoints
│   │   │   ├── games/            # Game data endpoints
│   │   │   ├── channels/         # Discord channel endpoints
│   │   │   └── settings/         # Settings endpoints
│   │   ├── matches/              # Match pages (create, history, dashboard)
│   │   ├── tournaments/          # Tournament pages
│   │   ├── settings/             # Settings pages (Discord, Announcer, UI, Scheduler)
│   │   ├── welcome/              # First-time setup wizard
│   │   └── layout.tsx            # Root layout with Mantine provider
│   ├── components/               # React components
│   │   ├── scoring/              # Scoring system components
│   │   └── ...                   # Match/tournament UI components
│   └── lib/                      # Utilities (database-init, notifications, scoring, brackets)
├── processes/
│   ├── discord-bot/              # Discord bot process
│   │   ├── index.ts              # Main bot implementation
│   │   └── modules/              # Modular bot features (voice, events, reminders, etc.)
│   └── scheduler/                # Cron scheduler process
├── migrations/                   # Database migrations (5 files)
├── data/games/                   # Game data (6 games with modes/maps)
├── s6-overlay/                   # Docker init system config
└── ecosystem.config.js           # Unified PM2 configuration (dev/prod)

## Database

The project uses SQLite for data persistence with automated migrations and seeding at startup.

**IMPORTANT**: This project uses the standard `sqlite3` library, NOT `better-sqlite3`. All database connections should use the callback-based API of sqlite3.

**Database Location**: The SQLite database file is located at `./app_data/data/matchexec.db` (relative to project root). Always use this path when creating Node.js scripts for database operations.

### Schema

Core tables include:

- **Matches**: `matches`, `match_participants`, `match_games` (with results/scoring)
- **Tournaments**: `tournaments`, `tournament_participants`, `tournament_teams`, `tournament_matches`, `tournament_bracket_nodes`
- **Games**: `games`, `game_modes`, `game_maps` (6 supported games with modes/maps)
- **Discord**: `discord_queues`, `discord_voice_channels`, `channels` (text/voice management)
- **Settings**: `settings`, `announcer_settings`, `ui_settings` (configuration)
- **System**: `migrations`, `data_versions` (tracking)

### Migrations

Database migrations are executed once at application startup. Migration files are stored in `/migrations/` and run in alphabetical order. Each migration is tracked to prevent duplicate execution.

### Data Seeding

Game data is automatically seeded from JSON files in `/data/games/` (Overwatch 2, Valorant, Marvel Rivals, League of Legends, R6 Siege, Counter-Strike 2). Each game directory contains:

- `game.json`: Game metadata with `dataVersion` field
- `modes.json`: Available game modes
- `maps.json`: Maps per mode

The seeder checks `dataVersion` and only re-seeds when changed, preventing duplicates.

### Migration and Seeding

Database migrations and seeding use `scripts/migrate-background.ts`, which provides status tracking for the loading screen UI. The migration process is handled differently based on the environment:

```bash
# Run migrations and seeding manually
npm run migrate

# Development (PM2 runs migrate-background.ts as a oneshot process)
npm run dev:all

# Production with PM2 (runs migrate-background.ts then starts processes)
npm run prod:start

# Docker (s6-overlay runs migrate-background.ts as a oneshot service)
docker run matchexec
```

### Usage

```typescript
import { getDbInstance } from './src/lib/database-init';

// Get database instance (migrations should already be run)
const db = await getDbInstance();

// Use database instance
const games = await db.all('SELECT * FROM games');
```

Individual processes only connect to the database - migrations run once at startup for performance and reliability.

### Environment-Specific Migration Handling

- **Development**: PM2 ecosystem config runs `migrate-background.ts` as a oneshot process, then starts all services
- **Production (PM2)**: Same as development but without hot-reload/watch mode
- **Docker**: s6-overlay runs `migrate-background.ts` as a oneshot service dependency; all other services wait for it to complete

### PM2 Configuration

The project uses a unified PM2 configuration in `ecosystem.config.js` that adapts based on the `NODE_ENV` environment variable:

- **Development mode**: Set `NODE_ENV=development` (done automatically by `npm run dev:all`)
  - Process names get `-dev` suffix
  - Web app runs with `npm run dev` for hot reload
  - Discord bot and scheduler watch for file changes
- **Production mode**: Default when `NODE_ENV` is not set or set to `production`
  - Process names have no suffix
  - Web app runs compiled `server.js`
  - No file watching

## Key Features

### Match System
- Match creation with customizable rounds, rulesets (casual/competitive), and team assignment
- Real-time scoring system with per-map and overall match scores
- Match state management (created → gather → assign → battle → complete/cancelled)
- Player participant tracking and reminders
- Voice channel integration and announcements

### Tournament System
- Single and double elimination bracket formats
- Automated bracket generation and progression
- Team-based tournament management
- Tournament-specific match scheduling
- Bracket visualization and navigation

### Discord Integration
- Modular bot architecture (`processes/discord-bot/modules/`):
  - `voice-handler`: Voice announcements and TTS
  - `event-handler`: Server events management
  - `announcement-handler`: Match/tournament announcements with embeds
  - `reminder-handler`: Player notifications
  - `queue-processor`: Async Discord operations
  - `interaction-handler`: Slash commands
  - `settings-manager`: Bot configuration
- Queue-based operations for reliability

### API Architecture
47+ REST endpoints in `src/app/api/`:
- Match management (CRUD, participants, games, scoring, transitions)
- Tournament operations (brackets, teams, matches)
- Game data (modes, maps)
- Channel management
- Settings configuration
- Health/stats monitoring

### UI Features
- Welcome flow for first-time setup
- Settings pages (Discord, Announcer, UI, Application, Scheduler)
- Match and tournament dashboards with history
- Scoring interface with format-specific components
- Map customization (codes, notes)

## Logging System

The application uses a centralized logging system with configurable log levels and color-coded console output.

### Log Levels

Five log levels in order of increasing severity:

1. **debug** (0) - Gray - Most verbose, development details
2. **info** (1) - Cyan - Informational messages
3. **warning** (2) - Yellow - Warnings (default level)
4. **error** (3) - Red - Error conditions
5. **critical** (4) - Bold Bright Red - Critical system failures

Only messages at or above the configured level are displayed.

### Usage

```typescript
import { logger } from '@/lib/logger';

// Log at different levels
logger.debug('Detailed debug information');
logger.info('System started successfully');
logger.warning('Configuration missing, using defaults');
logger.error('Failed to process request:', error);
logger.critical('Database connection lost');
```

### Configuration

Log level is configured via the Application Settings page (`/settings/application`) and stored in the `app_settings` table:

```sql
SELECT setting_value FROM app_settings WHERE setting_key = 'log_level';
```

The logger automatically reloads the level from the database every 5 seconds (cached for performance).

### API Endpoint

- **GET** `/api/settings/log-level` - Retrieve current log level
- **PUT** `/api/settings/log-level` - Update log level (triggers logger reload)

### Implementation Details

- **Location**: `src/lib/logger.ts`
- **Color Detection**: Automatically detects terminal color support
- **Performance**: 5-second cache to minimize database queries
- **Fallback**: Defaults to 'warning' level if database unavailable
- **Format**: `[YYYY-MM-DD HH:MM:SS] [LEVEL] message`

### Important Notes

- **CLI Scripts**: Standalone utility scripts (e.g., `scripts/*.js`, `add-test-participants.js`) intentionally use native `console` methods as they run outside the application context
- **Database Init**: `lib/database-init.ts` uses `console.error` for initialization failures since the logger depends on the database being initialized first
- **All Application Code**: The entire running application (web app, Discord bot, scheduler) uses the centralized logger

## Testing

### IMPORTANT: When modifying source code, always update the corresponding tests. If a function's behavior changes, its test expectations must be updated too.

### Test Framework
- **Vitest** with `pool: 'forks'` and `fileParallelism: true`
- Config: `vitest.config.ts`
- Setup files: `tests/vitest-mocks.ts`, `tests/setup.ts`

### Running Tests
```bash
npm run test              # Run all tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:coverage     # With coverage report
```

### Test Structure
```
tests/
├── setup.ts                          # Global beforeAll/afterEach/afterAll hooks
├── vitest-mocks.ts                   # Empty (mocks must be in each test file)
├── utils/
│   ├── test-db.ts                    # TestDatabase wrapper with promise+callback API
│   ├── fixtures.ts                   # seedBasicTestData(), createMatch(), createTournament()
│   └── api-helpers.ts                # createMockRequest(), parseResponse(), createRouteParams()
├── mocks/
│   ├── database.ts                   # getMockDbInstance() / resetMockDbInstance()
│   └── discord.ts                    # mockDiscordClient, createMockChannel()
├── unit/
│   ├── validation.test.ts            # validateRequiredFields, safeJSONParse/Stringify
│   ├── scoring-functions.test.ts     # Scoring calculations
│   ├── tournament-bracket.test.ts    # Bracket generation and progression
│   ├── transition-handlers.test.ts   # Match state transition side effects
│   └── discord-bot/
│       ├── announcement-handler.test.ts
│       ├── queue-processor.test.ts
│       └── voice-handler.test.ts
└── integration/
    ├── api/                          # API route handler tests
    │   ├── matches.test.ts
    │   ├── match-participants.test.ts
    │   ├── match-results.test.ts
    │   ├── match-transitions.test.ts
    │   ├── tournaments.test.ts
    │   ├── games.test.ts
    │   └── settings.test.ts
    ├── database/
    │   ├── migrations.test.ts
    │   ├── schema.test.ts
    │   └── seeder.test.ts
    └── queues/
        └── queue-contracts.test.ts

```

### Key Source-to-Test Mappings
| Source File | Test File |
|-------------|-----------|
| `src/lib/utils/validation.ts` | `tests/unit/validation.test.ts` |
| `src/lib/scoring-functions.ts` | `tests/unit/scoring-functions.test.ts` |
| `src/lib/tournament-bracket.ts` | `tests/unit/tournament-bracket.test.ts` |
| `src/lib/transition-handlers.ts` | `tests/unit/transition-handlers.test.ts` |
| `processes/discord-bot/modules/announcement-handler.ts` | `tests/unit/discord-bot/announcement-handler.test.ts` |
| `processes/discord-bot/modules/voice-handler.ts` | `tests/unit/discord-bot/voice-handler.test.ts` |
| `src/app/api/matches/*/route.ts` | `tests/integration/api/matches*.test.ts` |
| `src/app/api/tournaments/*/route.ts` | `tests/integration/api/tournaments.test.ts` |
| `src/app/api/settings/*/route.ts` | `tests/integration/api/settings.test.ts` |
| `src/app/api/games/*/route.ts` | `tests/integration/api/games.test.ts` |

### Known Issues
- **DB isolation**: ~48 integration API tests fail because `getTestDb()` and `getDbInstance()` use separate database connections. Tests that insert data directly via `getTestDb()` and then query via API route handlers (which use `getDbInstance()`) will get 404s. Unit tests and queue/schema tests are unaffected.
- **FK schema mismatch**: Enabling `PRAGMA foreign_keys=ON` in tests reveals that the `matches` table has a malformed FK reference to `game_maps`. This must be fixed in migrations before FK constraints can be enabled in tests.

### Writing Tests
- Use `getTestDb()` for direct DB operations in tests
- Use `createMockRequest()` / `parseResponse()` / `createRouteParams()` for API tests
- Use `seedBasicTestData()` to get a game + mode for test setup
- Use `createMatch()` / `createTournament()` from fixtures for quick entity creation
- Discord bot tests require `vi.mock()` at the top of each file (mocks don't work in setup files)
- `handleStatusTransition()` does NOT validate transitions - it only routes to handlers. Transition validation is in the API route layer.

## Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS 4, Mantine 8
- **Backend**: Express (API server), Discord.js 14, node-cron
- **Process Management**: PM2 (dev), s6-overlay v3 (Docker)
- **Database**: SQLite3 (callback-based API)
- **Voice**: @discordjs/voice, ffmpeg-static
- **Development**: tsx, ESLint

## Scripts

**Development**:
- `npm run dev:all` - Start all processes (web + bot + scheduler) with PM2
- `npm run dev:logs` - View logs from all processes
- `npm run dev:stop/restart` - Control PM2 processes

**Production**:
- `npm run prod:start` - Start with PM2
- `docker build -t matchexec .` - Build Docker container

**Utilities**:
- `npm run migrate` - Run migrations/seeding manually
- `npm run build` - Build Next.js app
- `npm run lint` - ESLint check
- `npm run version:patch/minor/major` - Bump version