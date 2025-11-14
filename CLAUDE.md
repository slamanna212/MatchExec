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
└── ecosystem.*.config.js         # PM2 configurations

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

Database migrations and seeding are handled at application startup:

```bash
# Run migrations and seeding manually
npm run migrate

# Development (automatically runs migrations via PM2)
npm run dev:all

# Production with PM2 (automatically runs migrations first)  
npm run prod:start

# Docker (automatically runs migrations via s6-overlay init script)
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

- **Development**: PM2 runs migrations before starting processes
- **Production (PM2)**: Manual or PM2-managed migration execution
- **Docker**: s6-overlay runs migrations via init script before starting services

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