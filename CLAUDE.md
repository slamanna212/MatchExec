# MatchExec Match Bot

A Discord match management bot built with Next.js, React, Mantine, and PM2 multi-process architecture.

## Architecture

This project uses a multi-process architecture managed by PM2:

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
```bash
docker build -t matchexec .
docker run -p 3000:3000 --env-file .env matchexec
```

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
├── ecosystem.config.js     # PM2 production configuration
├── ecosystem.dev.config.js # PM2 development configuration
└── Dockerfile             # Production container

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

Database migrations and seeding are handled at application startup, not during runtime:

```bash
# Run migrations and seeding manually
npm run migrate

# Start development (automatically runs migrations first)
npm run dev:all

# Start production (automatically runs migrations first)  
npm run prod:start
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
- **Process Management**: PM2
- **Database**: SQLite
- **Scheduling**: node-cron
- **Development**: tsx for TypeScript execution

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