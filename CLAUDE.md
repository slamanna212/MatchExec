# MatchExec Tournament Bot

A Discord tournament management bot built with Next.js, React, HeroUI, and PM2 multi-process architecture.

## Architecture

This project uses a multi-process architecture managed by PM2:

1. **Web App** (`src/app/`): Next.js application with HeroUI components
2. **Discord Bot** (`processes/discord-bot/`): Discord.js bot for tournament commands
3. **Scheduler** (`processes/scheduler/`): Cron jobs for tournament management
4. **Worker** (`processes/worker/`): Background job processing

## Development

### Prerequisites
- Node.js 18+
- npm
- PM2 (installed as dependency)

### Setup
```bash
npm install
cp .env.example .env
# Configure your DISCORD_BOT_TOKEN in .env
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
│   ├── layout.tsx          # Root layout with HeroUI provider
│   ├── page.tsx            # Home page
│   ├── providers.tsx       # HeroUI provider setup
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


## Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **UI Library**: HeroUI
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