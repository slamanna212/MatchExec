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
│   │   └── index.ts        # Main bot file
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

Database migrations are automatically executed at startup. Migration files are stored in `/migrations/` and run in alphabetical order. Each migration is tracked to prevent duplicate execution.

### Data Seeding

Game data is automatically seeded from JSON files in `/data/games/`. Each game directory should contain:

- `game.json`: Game metadata with `dataVersion` field
- `modes.json`: Available game modes (optional)
- `maps.json`: Available maps (optional)

The seeder checks `dataVersion` in each game.json and only re-seeds when the version changes, preventing duplicate data insertion.

### Usage

```typescript
import { initializeDatabase } from './lib/database';

// Initialize database with migrations and seeding
const db = await initializeDatabase();

// Use database instance
const games = await db.all('SELECT * FROM games');
```

The database is initialized automatically when any process starts, ensuring consistent schema and data across all processes.


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