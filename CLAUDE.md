# MatchExec Match Bot

A Discord match management bot built with Next.js, React, Mantine, and multi-process architecture managed by PM2 (development) or s6-overlay (production/Docker).

## Architecture

This project uses a multi-process architecture with different process managers for different environments:

**Development**: PM2 manages all processes with hot reload
**Production/Docker**: s6-overlay manages processes in containerized environments

### Core Processes

1. **Web App** (`src/app/`): Next.js application with Mantine UI components
2. **Discord Bot** (`processes/discord-bot/`): Discord.js bot for match commands
3. **Scheduler** (`processes/scheduler/`): Cron jobs for match management
4. **Worker** (`processes/worker/`): Background job processing

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

├── src/app/                 # Next.js application
│   ├── layout.tsx          # Root layout with Mantine provider
│   ├── page.tsx            # Home page
│   ├── providers.tsx       # Mantine provider setup
│   └── globals.css         # Global styles
├── processes/
│   ├── discord-bot/        # Discord bot process
│   │   ├── index.ts        # Modular bot implementation
│   │   └── modules/        # Discord bot modules
│   │       ├── voice-handler.ts      # Voice announcements and TTS
│   │       ├── event-handler.ts      # Discord server events
│   │       ├── announcement-handler.ts # Match announcements
│   │       ├── reminder-handler.ts   # Player reminders and notifications
│   │       ├── queue-processor.ts    # Queue processing
│   │       ├── interaction-handler.ts # Discord interactions
│   │       ├── utils.ts              # Utility functions
│   │       └── settings-manager.ts   # Settings management
│   ├── scheduler/          # Cron scheduler process
│   │   └── index.ts        # Scheduled tasks
│   └── worker/             # Background worker process
│       └── index.ts        # Job processing
├── shared/                 # Shared code between processes
│   └── types.ts            # TypeScript type definitions
├── lib/                    # Utility libraries
├── s6-overlay/             # s6-overlay configuration for Docker
│   ├── s6-rc.d/           # Service definitions
│   │   ├── user/          # User bundle (defines which services to start)
│   │   ├── matchexec-web/ # Web application service
│   │   ├── discord-bot/   # Discord bot service
│   │   ├── scheduler/     # Scheduler service
│   │   └── worker/        # Worker service
│   └── cont-init.d/       # Container initialization scripts
│       ├── 10-adduser     # User setup
│       ├── 20-setup-environment # Environment configuration
│       └── 30-migrate-database  # Database migration
├── ecosystem.config.js     # PM2 production configuration
├── ecosystem.dev.config.js # PM2 development configuration
└── Dockerfile             # Production container with s6-overlay

## Database

The project uses SQLite for data persistence with automated migrations and seeding at startup.

**IMPORTANT**: This project uses the standard `sqlite3` library, NOT `better-sqlite3`. All database connections should use the callback-based API of sqlite3.

**Database Location**: The SQLite database file is located at `./app_data/data/matchexec.db` (relative to project root). Always use this path when creating Node.js scripts for database operations.

### Schema

The database includes tables for:

- **games**: Game information (Overwatch 2, Marvel Rivals, etc.)
- **game_modes**: Game modes for each game (Control, Escort, etc.)
- **game_maps**: Maps available for each game and mode
- **matches**: Match records with status tracking
- **match_participants**: Players registered for matches
- **match_games**: Individual games within matches
- **data_versions**: Tracks seeded data versions to avoid re-seeding
- **migrations**: Migration execution tracking

### Migrations

Database migrations are executed once at application startup. Migration files are stored in `/migrations/` and run in alphabetical order. Each migration is tracked to prevent duplicate execution.

### Data Seeding

Game data is automatically seeded from JSON files in `/data/games/`. Each game directory should contain:

- `game.json`: Game metadata with `dataVersion` field
- `modes.json`: Available game modes (optional)
- `maps.json`: Available maps (optional)

The seeder checks `dataVersion` in each game.json and only re-seeds when the version changes, preventing duplicate data insertion.

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

## Discord Bot Architecture

The Discord bot uses a modular architecture for maintainability and scalability:

### Bot Modules

- **voice-handler.ts**: Handles voice announcements, TTS, and voice channel management
- **event-handler.ts**: Manages Discord server events creation and deletion
- **announcement-handler.ts**: Creates and posts match announcements with embeds
- **reminder-handler.ts**: Handles player reminders and notifications
- **queue-processor.ts**: Processes various Discord queue operations
- **interaction-handler.ts**: Manages Discord slash commands and interactions
- **settings-manager.ts**: Loads and manages Discord bot settings from database
- **utils.ts**: Common utility functions used across modules

### File Structure

- `index.ts` - Main bot implementation with modular architecture
- `modules/` - Individual bot modules

### Benefits

- **Maintainability**: Each module handles a specific responsibility
- **Testability**: Modules can be tested independently  
- **Readability**: Individual files are focused and manageable
- **Reusability**: Modules can be imported and used across the codebase
- **Scalability**: Easy to add new features by creating new modules


## Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **UI Library**: Mantine
- **Discord**: Discord.js
- **Process Management**: PM2 (development), s6-overlay (production/Docker)
- **Database**: SQLite
- **Scheduling**: node-cron
- **Development**: tsx for TypeScript execution
- **Container Init**: s6-overlay v3

## Scripts

- `npm run dev`: Start Next.js development server
- `npm run build`: Build Next.js application
- `npm run start`: Start Next.js production server
- `npm run lint`: Run ESLint
- `npm run dev:all`: Start all processes with PM2 (development)
- `npm run dev:stop`: Stop all PM2 processes
- `npm run dev:restart`: Restart all PM2 processes
- `npm run dev:logs`: View PM2 logs
- `npm run build:processes`: Compile TypeScript processes
- `npm run prod:start`: Start all processes with PM2 (production)
- `npm run prod:stop`: Stop production PM2 processes
- `npm run migrate`: Run database migrations and seeding manually