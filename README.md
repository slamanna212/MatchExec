# MatchExec

A comprehensive multi-game match execution and statistics platform supporting **Overwatch 2** and **Marvel Rivals**, built with modern web technologies and designed for scalability.

## 🚀 Architecture Overview

MatchExec is built as a **TypeScript monorepo** deployed as a **single Docker container** with multiple processes managed by **PM2**:

- **🌐 Web Server** - Express 5 serving React 18 frontend and REST API
- **🤖 Discord Bot** - Discord.js bot for community integration and statistics
- **⏰ Scheduler** - Node-cron based task scheduling for automated statistics and updates
- **🔍 OCR Service** - Future OCR processing for match screenshots and data extraction
- **📊 React Frontend** - Modern UI built with HeroUI and Tailwind CSS

All services run within a single container, managed by PM2, with persistent SQLite database and log storage via Docker volumes.

## 🛠️ Tech Stack

### Backend
- **Express 5** - Modern web framework with enhanced performance
- **TypeScript** - Type-safe development across all services
- **Prisma** - Type-safe database ORM with SQLite
- **Discord.js v14** - Discord API integration
- **Node-cron** - Reliable task scheduling
- **Winston** - Structured logging with file rotation
- **PM2** - Process management and monitoring

### Frontend
- **React 18** - Latest React with concurrent features
- **HeroUI** - Modern, accessible component library
- **Tailwind CSS** - Utility-first CSS framework
- **React Query** - Server state management
- **React Router** - Client-side routing
- **TypeScript** - Type-safe frontend development

### Infrastructure
- **SQLite** - Lightweight, self-contained database
- **Docker** - Single-container deployment with PM2 process management
- **PM2** - Multi-process management within container
- **Ubuntu** - Development and production environment

## 📁 Project Structure

```
MatchExec/
├── apps/                          # Application services
│   ├── web-server/               # Express 5 web server
│   ├── discord-bot/              # Discord.js bot
│   ├── scheduler/                # Node-cron task scheduler
│   └── ocr/                      # Future OCR processing
├── packages/
│   ├── shared/                   # Shared utilities and database
│   │   ├── src/
│   │   │   ├── generated/        # Prisma client
│   │   │   ├── database.ts       # Database utilities
│   │   │   ├── logger.ts         # Winston logging
│   │   │   ├── types.ts          # Shared TypeScript types
│   │   │   └── utils.ts          # Common utilities
│   │   └── prisma/
│   │       ├── schema.prisma     # Database schema
│   │       └── seed.ts           # Initial data
│   └── frontend/                 # React 18 frontend
├── database/                     # SQLite database files
├── logs/                         # Application logs
├── ecosystem.config.js           # PM2 process configuration
├── Dockerfile                    # Single-container deployment
└── environment.example          # Environment variables template
```

## 🎯 Supported Games

### Overwatch 2
- **Heroes**: 35+ heroes across Tank, DPS, and Support roles
- **Maps**: 15+ maps across Assault, Escort, Hybrid, and Control modes
- **Game Modes**: Quick Play, Competitive, Arcade, Custom Games
- **Statistics**: Performance tracking, hero usage, win rates

### Marvel Rivals
- **Heroes**: 30+ Marvel characters across Vanguard, Duelist, and Strategist roles
- **Maps**: Tokyo 2099, Asgard, and more Marvel universe locations
- **Game Modes**: Quick Match, Competitive, Custom Games
- **Statistics**: Hero performance, team composition analysis

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **npm 9+**
- **PM2** (for process management)
- **Docker** (optional, for containerized deployment)

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd MatchExec
npm install
```

2. **Set up environment variables:**
```bash
cp environment.example .env
# Edit .env with your actual configuration
# The DATABASE_URL is already set correctly for development
```

3. **Initialize the database:**
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

4. **Build all applications:**
```bash
npm run build
```

**Or run everything at once:**
```bash
npm run setup
```

### Development

Start all services in development mode:
```bash
# Terminal 1: Web Server
cd apps/web-server && npm run dev

# Terminal 2: Discord Bot  
cd apps/discord-bot && npm run dev

# Terminal 3: Scheduler
cd apps/scheduler && npm run dev

# Terminal 4: Frontend
cd packages/frontend && npm run dev
```

### Production with PM2

```bash
# Start all services
npm run start:pm2

# Monitor services
npm run logs:pm2

# Stop all services
npm run stop:pm2
```

### Docker Deployment

```bash
# Build the Docker image
npm run docker:build

# Run the container with volumes and environment
npm run docker:run

# View logs
npm run docker:logs

# Stop the container
npm run docker:stop
```

## 🔧 Configuration

### Environment Variables

Required environment variables (see `environment.example`):

```bash
# Database
DATABASE_URL="file:./database/matchexec.db"

# Discord Bot
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_GUILD_ID=your_discord_guild_id_here

# Web Server
PORT=3000
NODE_ENV=development
SESSION_SECRET=your_session_secret_here

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/app.log
```

### PM2 Process Management

The `ecosystem.config.js` defines four main processes:

- **Web Server** (Port 3000) - Serves React frontend and REST API
- **Discord Bot** - Handles Discord interactions and commands  
- **Scheduler** - Runs periodic statistics updates and tasks
- **OCR Service** - Processes images and extracts match data (future)

## 📊 Database Schema

### Core Entities

- **Games** - Overwatch, Marvel Rivals, future games
- **Players** - Linked to Discord users, game-specific
- **Characters** - Heroes with roles and game associations
- **Maps** - Game environments with types and modes
- **Matches** - Game sessions with timestamps and metadata
- **Statistics** - Player performance data and analytics
- **Job Queue** - Asynchronous task processing

### Key Features

- **Multi-game support** - Easily extensible to new games
- **Flexible statistics** - JSON storage for game-specific data
- **Job queue system** - Reliable background task processing
- **Audit trails** - Created/updated timestamps on all entities

## 🤖 Discord Bot Commands

- `/ping` - Check bot latency and health
- `/stats <game>` - Get game statistics and player counts
- Future commands for match tracking, leaderboards, and more

## 🔄 Scheduled Tasks

- **Statistics Update** (Every 5 minutes) - Refresh player statistics
- **Embed Update** (Every 10 minutes) - Update Discord embeds  
- **Job Queue Processing** (Every minute) - Process background tasks
- **Database Cleanup** (Daily at 2 AM) - Maintain database health

## 🏗️ Development

### Adding New Games

1. Add game entry to `packages/shared/prisma/seed.ts`
2. Add characters, maps, and game modes
3. Update frontend game selection components
4. Add game-specific statistics handling

### Adding New Features

1. Update database schema in `packages/shared/prisma/schema.prisma`
2. Run `npx prisma migrate dev` to apply changes
3. Update shared types in `packages/shared/src/types.ts`
4. Implement feature across web server, Discord bot, or frontend

## 📈 Monitoring & Logs

- **PM2 Monitoring**: `pm2 monit` for real-time process monitoring
- **Logs**: Centralized logging in `./logs/` directory
- **Health Checks**: `/health` endpoint for basic status
- **Database Admin**: Optional SQLite web interface on port 8080

## 🔧 Troubleshooting

### Database Setup Issues

If you encounter `Environment variable not found: DATABASE_URL` error:

1. **Make sure you have the .env file:**
   ```bash
   cp environment.example .env
   ```

2. **Use the setup script for initial installation:**
   ```bash
   npm run setup
   ```

3. **Or run database commands individually:**
   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

The npm scripts automatically handle the correct database path for Prisma operations.

## 🚢 Production Deployment

MatchExec is designed as a **single Docker container** that runs all services (web server, Discord bot, scheduler, OCR) using PM2 process management.

### Docker Deployment (Recommended)

1. **Build the image:**
```bash
docker build -t matchexec .
```

2. **Run with persistent storage:**
```bash
docker run -d \
  --name matchexec-app \
  -p 3000:3000 \
  -v /host/path/to/database:/app/database \
  -v /host/path/to/logs:/app/logs \
  -e DATABASE_URL="file:/app/database/matchexec.db" \
  -e DISCORD_BOT_TOKEN="your_bot_token" \
  -e DISCORD_CLIENT_ID="your_client_id" \
  -e NODE_ENV="production" \
  matchexec
```

3. **Or use npm scripts:**
```bash
npm run docker:build
npm run docker:run
```

### Ubuntu Server (Native)
```bash
# Install Node.js, PM2, and dependencies
npm install
npm run build
npm run start:pm2
```

### Container Management
```bash
# View logs
docker logs -f matchexec-app

# Monitor processes inside container
docker exec -it matchexec-app pm2 monit

# Restart services
docker exec -it matchexec-app pm2 restart all

# Stop container
docker stop matchexec-app
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔮 Future Roadmap

- **OCR Integration** - Automatic match screenshot processing
- **Advanced Statistics** - Machine learning insights and predictions
- **More Games** - Valorant, Apex Legends, and other competitive titles
- **Mobile App** - React Native companion app
- **Team Management** - Advanced team composition and strategy tools
- **Tournament Mode** - Bracket management and tournament hosting

---

Built with ❤️ for the gaming community
