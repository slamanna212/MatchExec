# MatchExec Match Bot

A Discord match and tournament management bot: a Vite + React single-page app, a Hono API server, and Discord bot / scheduler / stats worker processes on PostgreSQL 18 (Drizzle ORM). PM2 runs the processes in development, s6-overlay in the Docker image.

**Features**: Match scheduling, tournament brackets (single/double elimination), team management, scoring system, voice announcements, Discord integration, backups/restore, multi-game support (10 games: Assetto Corsa Competizione, Counter-Strike 2, Fortnite, League of Legends, Mario Kart 8 Deluxe, Marvel Rivals, Overwatch 2, R6 Siege, Rocket League, Valorant).

## Architecture

One codebase, one Docker image, several processes. `MATCHEXEC_SERVICES` selects which ones a container runs, so the same image works as an all-in-one container (Unraid / `docker run`) and as split Kubernetes deployments.

**Development**: PM2 runs the processes with hot reload; Postgres runs in Docker (`compose.dev.yml`).
**Production/Docker**: s6-overlay supervises the processes; Postgres is embedded in the image unless `DATABASE_URL` is set.

### Processes

1. **Web client** (`src/client/`, `src/components/`): Vite + React 19 + React Router 7 SPA with Mantine 9 and Tailwind 4. In development Vite serves it on port 3000 with HMR and proxies `/api` and `/uploads` to the Hono server on port 3001. In production it is built to `dist/client` and served by the Hono server on port 3000.
2. **Web server** (`src/server/`): Hono app (`app.ts`), one router per domain in `routes/`, middleware in `middleware/` (auth, welcome-flow redirect, rate limit, maintenance, degraded mode), `static.ts` (SPA + SPA fallback), `http.ts` (`HttpError`, `onError`). Bundled to `dist/server.js`.
3. **Discord bot** (`processes/discord-bot/`): Discord.js bot; polls the queue tables and handles interactions.
4. **Scheduler** (`processes/scheduler/`): cron jobs (reminders, match start, avatar refresh, update check, feed cleanup, automatic backups).
5. **Stats processor** (`processes/stats-processor/`): scorecard image extraction (AI providers) and stat image generation.
6. **Migrator** (`lib/db/migrate-cli.ts`, bundle `dist/migrate.js`): oneshot. Applies Drizzle migrations, imports a legacy SQLite database if one is found, seeds game data.

Every non-migrate process waits for the schema (`waitForSchema` / `waitForSystemReady`) before it starts, so start order does not matter. The bot and scheduler take a Postgres advisory-lock leader guard (`lib/db/leader.ts`) and exit if another instance holds it, so they are always exactly one replica.

### Services and `MATCHEXEC_SERVICES`

Comma list from `web,bot,scheduler,stats,migrate`, default `all`. In the Docker image the s6 graph is static (`s6-overlay/s6-rc.d`: `postgres`, `migrate`, `web`, `bot`, `scheduler`, `stats`); `s6-overlay/cont-init.d/20-setup-environment` writes marker files for the selected services and every `run` script exits quietly when its marker is missing. `migrate` also runs whenever any other service runs unless `MATCHEXEC_RUN_MIGRATIONS=false`.

## Development

### Prerequisites
- Node.js 24+ (the Docker image uses Node 26)
- pnpm (pinned via `packageManager`; enable with `corepack enable`)
- Docker (for the dev Postgres container)
- PM2 (installed as a dependency)

### Setup
```bash
pnpm install
```

### Running in Development
```bash
# Start Postgres (compose.dev.yml, waits until healthy) and all processes with hot reload.
# Web UI: http://localhost:3000 (Vite), API: http://localhost:3001 (Hono)
pnpm dev:all

pnpm dev:logs        # logs from all processes
pnpm dev:stop        # stop PM2 apps and the Postgres container (data kept in a named volume)
pnpm dev:restart     # (re)start everything
pnpm dev:db:reset    # DESTROY the dev database volume and start a fresh Postgres (welcome flow runs again)
```

The dev database is `postgres://matchexec:matchexec@127.0.0.1:5432/matchexec` (the default `DATABASE_URL` when `NODE_ENV=development`). If `./app_data/data/matchexec.db` exists and has not been imported yet, the first `pnpm dev:all` imports it (copy in `./app_data/backups`, original renamed `matchexec.db.migrated-<date>`).

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
pnpm dev:logs | tail -100

# Per-process log files (PM2 writes <name>-out.log and <name>-error.log)
tail -50 ./app_data/data/logs/discord-bot-out.log
tail -50 ./app_data/data/logs/scheduler-out.log
tail -50 ./app_data/data/logs/server-out.log
tail -50 ./app_data/data/logs/db-migrator-out.log

# Check PM2 process status
pnpm exec pm2 status

# Query the dev database directly
docker compose -f compose.dev.yml exec postgres psql -U matchexec matchexec -c "SELECT id, status FROM matches ORDER BY created_at DESC LIMIT 5;"

# Check for errors in logs
pnpm dev:logs | grep -i error

# Migration / import progress (also what /api/db-status reports)
docker compose -f compose.dev.yml exec postgres psql -U matchexec matchexec -c "SELECT phase, message, progress FROM system_status;"

# Monitor logs in real-time
pnpm dev:logs --lines 0

# Inside the all-in-one Docker container (superuser is "abc", Unix socket)
docker exec -it MatchExec psql -U abc -h /run/postgresql -d matchexec
```

### Example Interaction

**User**: "Match creation is broken, getting a 500 error"

**Claude**: "Can you run these commands and paste the output?
1. `pnpm dev:logs | grep -A 5 'error'`
2. `tail -50 ./app_data/data/logs/server-error.log`
3. Check browser console for any errors"

**User**: [pastes results]

**Claude**: "I see the issue on line X. Here's the fix..."

## Production Using Docker

The image runs s6-overlay as the init system. With `DATABASE_URL` unset it also runs an embedded PostgreSQL 18 (installed from Alpine's `postgresql18` package), so a plain `docker run` is a complete install.

### Building and Running
```bash
docker build -t matchexec .

# Run with an env file and a data volume. --stop-timeout 30 lets Postgres shut down cleanly (Docker's default is 10 s).
docker run -p 3000:3000 --stop-timeout 30 --env-file .env -v $(pwd)/app_data:/app/app_data matchexec

# Throwaway test (no persistence)
docker run --rm -p 3000:3000 matchexec
```

Data layout under `/app/app_data`: `postgres/` (PGDATA, `chmod 0700` enforced on every boot), `backups/` (`auto/`, `pre-upgrade/`, `pre-restore/`, `pre-postgres-<date>.db` safety copy of an imported SQLite DB), `data/` (legacy `matchexec.db` before import, which is renamed `matchexec.db.migrated-<date>` afterwards). On Unraid use `/mnt/cache/appdata` rather than `/mnt/user` (FUSE hurts Postgres) and `PUID=99 PGID=100`.

### s6-overlay Process Management

- **Service graph**: `postgres` (only when embedded) -> `migrate` (oneshot) -> `web`, `bot`, `scheduler`, `stats`. Service directories live in `s6-overlay/s6-rc.d/`, boot scripts in `s6-overlay/cont-init.d/` (`10-adduser`, `20-setup-environment`, `25-fix-data-permissions`, `30-postgres-init`), helper scripts in `s6-overlay/matchexec/` (`main`, `migrate`).
- **Embedded Postgres**: initdb on first boot (`--username=abc`, builtin `C.UTF-8` collation, data checksums), Unix socket only, URL `postgresql://abc@/matchexec?host=/run/postgresql`. Tuned with `PG_SHARED_BUFFERS` (default 128MB) and `PG_MAX_CONNECTIONS` (default 50). The container refuses to start if `PG_VERSION` is a different major than the image (see `docs/postgres-major-upgrade.md`); there is no automatic `pg_upgrade`.
- **Shutdown**: apps stop first, then Postgres gets SIGINT (fast shutdown). `S6_SERVICES_GRACETIME=8000`, `S6_KILL_GRACETIME=1500`; use `--stop-timeout 30`.
- **Degraded mode**: when `migrate` fails in a multi-service container (for example the SQLite import preflight found problems), the container keeps running, `web` starts with `MATCHEXEC_DEGRADED=true` (`src/server/middleware/degraded.ts`), serves the SPA and `/api/db-status` with the error, `/api/health` returns 503, everything else under `/api` and `/uploads` returns 503. The next start retries. A migrate-only container (`MATCHEXEC_SERVICES=migrate`, the Helm Job) fails hard with exit code 1.
- **Healthcheck**: `/api/health` (includes DB connectivity), start period 180 s.
- **BIND_HOST**: interface the web server binds to (default `0.0.0.0`). `HOSTNAME` is not used (Kubernetes sets it to the pod name).
- **Users**: PUID/PGID (default 1001) own the data; embedded Postgres runs as that user. The image starts as root because s6 needs it, then services drop to `abc`.
- **Kubernetes**: see `kubernetes/README.md` (Helm chart in `kubernetes/helm/matchexec`, `mode: aio | split`).

### Adding Process Dependencies (Docker)

When a Discord bot, scheduler, stats-processor or server bundle needs a new npm package that **cannot be bundled by esbuild** (native modules, packages with dynamic requires), you need to:

1. **Add the package to `package.json`** as a normal dependency
2. **Mark it as `external`** in the relevant esbuild config (`esbuild.discord-bot.config.mjs`, `esbuild.scheduler.config.mjs`, `esbuild.stats-processor.config.mjs`, `esbuild.server.config.mjs`)
3. **Add the package name** to the `PROCESS_DEPS` array in `scripts/collect-process-deps.mjs`

The collect script follows pnpm's symlinks and traces transitive dependencies; you only need to add the top-level package name (nested `node_modules` and `optionalDependencies` are traced too). Today only natives and discord.js/voice packages (`@napi-rs/canvas`, `discord.js`, `@discordjs/*`, `@snazzah/davey`, `bufferutil`) are external; everything else, including `pg` and `drizzle-orm`, is bundled into `dist/*.js`. The runtime image only contains `dist/`, `drizzle/`, `migrations/legacy-sqlite/` (importer), `data/`, `public/`, `package.json` and those collected modules.

**You DON'T need to touch the collect script** for pure JS packages esbuild can bundle (don't add them to `external`) or dev dependencies.

**Testing:** After changes, build the image and verify all processes start:
```bash
docker build -t matchexec:test .
docker run --rm -p 3000:3000 matchexec:test
```

The `postgresql18` package is installed with `apk`; its minor/patch updates only arrive when the image is rebuilt (Dependabot cannot see apk packages), and a major bump is a deliberate Dockerfile edit.

## Project Structure

```
├── src/
│   ├── client/                   # Vite SPA: index.html, main.tsx, routes.tsx (React Router table), root-layout.tsx, providers.tsx, globals.css
│   │   └── pages/                # One page.tsx per route (matches, tournaments, series, games, channels, feed, settings, welcome, login, dev, info)
│   ├── components/               # React components (scoring/, setup/, create-match/, create-tournament/, match-details/, series/, stats/, ...)
│   ├── hooks/                    # React hooks
│   ├── server/                   # Hono server
│   │   ├── index.ts              # serve(app) on PORT (3000 prod / 3001 dev), BIND_HOST
│   │   ├── app.ts                # middleware + router mounting, exports AppType
│   │   ├── http.ts               # HttpError, onError, jsonOk/jsonError, noStore
│   │   ├── static.ts             # dist/client static files + SPA fallback
│   │   ├── middleware/           # auth, welcome, rate-limit, maintenance, degraded
│   │   └── routes/               # one Hono router per domain (matches, tournaments, series, games, channels, settings, backup, scorecards, stats, feed, uploads, system, health, auth, welcome-flow, debug)
│   └── lib/                      # Domain modules (all take an Executor first): matches/, tournaments/, series/, stats/, scoring/, queues/, settings.ts, games.ts, discord-queues.ts, feed-helpers.ts, logger/, ...
├── lib/
│   ├── db/                       # index.ts (pool, db, Executor), schema/*.ts (Drizzle), migrate.ts + migrate-cli.ts, seed.ts, leader.ts, system-status.ts, errors.ts
│   ├── import-sqlite/            # One-time SQLite -> Postgres importer (permanent, see Conventions)
│   ├── backup.ts, restore.ts, maintenance.ts, backup-crypto.ts, storage.ts   # backups, restore + quiesce, blobs
│   └── discord-bot-service.ts, signup-forms.ts, version-*.ts
├── processes/
│   ├── discord-bot/              # index.ts, modules/ (announcement, event, reminder, queue-processor, interaction, voice, scorecard, winner-vote, ...), utils/
│   ├── scheduler/                # index.ts, jobs/ (auto-backup, check-for-update, update-avatars)
│   └── stats-processor/          # index.ts, modules/ (ai-extractor, stat-image-generator, providers/)
├── shared/                       # Types and helpers shared by client, server and processes
├── drizzle/                      # Generated Drizzle SQL migrations (0000_baseline.sql + meta/)
├── migrations/legacy-sqlite/     # The 27 old SQLite migrations; used ONLY by the importer
├── data/games/                   # Game data (10 games with modes/maps), seeded at startup
├── kubernetes/                   # Helm chart (aio / split modes), Grafana dashboard, README
├── s6-overlay/                   # Docker init system config
├── scripts/                      # collect-process-deps.mjs, import-sqlite.ts, update-helm-version.mjs, dev helpers
├── docs/                         # postgres-major-upgrade.md, keyboard-shortcuts.md, scoring-rewrite-plan.md (historical)
├── compose.dev.yml               # Dev-only Postgres 18
├── docker-compose.yml            # Example all-in-one deployment
├── drizzle.config.ts             # drizzle-kit config
├── vite.config.mts               # Vite (client) config incl. dev proxy
├── esbuild.*.config.mjs          # Bundles for server, discord-bot, scheduler, stats-processor, migrate, import-sqlite
├── ecosystem.config.js           # Unified PM2 configuration (dev/prod)
└── tests/                        # Vitest (see Testing)
```

## Database

PostgreSQL 18 through Drizzle ORM (`drizzle-orm` with `pg`; PGlite in tests). Schema source of truth: `lib/db/schema/*.ts` (grouped by domain: matches, tournaments, series, discord, settings, games, stats, system, blobs, control, queues, types). Explicit snake_case column names; TS property keys equal the column names, so selected rows serialise to the same JSON keys the API returns.

- **Connection**: `DATABASE_URL`. In development it defaults to `postgres://matchexec:matchexec@127.0.0.1:5432/matchexec` (`compose.dev.yml`). In the Docker image, unset means embedded Postgres over the Unix socket. `PG_POOL_MAX` (default 10) sizes the pool per process.
- **Drizzle conventions**: booleans are `boolean`, timestamps `timestamptz`, JSON columns `jsonb` with `.$type<>()`, identity columns are `GENERATED BY DEFAULT AS IDENTITY`. `updated_at` columns use `$onUpdate(...)`, so raw-SQL updates must set `updated_at` themselves. **Foreign keys are enforced**; children cascade through `ON DELETE CASCADE`, so deletes do not need manual child cleanup (exceptions are documented in the schema: `discord_deletion_queue`, `discord_match_messages`, `discord_events`, `team_voice_channels` and the `auto_voice_channels` table deliberately have no FK to `matches`; `matches`/`match_games`/`tournaments` have no FK to `game_modes`/`game_maps` because the seeder replaces those rows).
- **Schema changes**: edit the TS schema, then `pnpm db:generate` (drizzle-kit writes a new SQL file under `drizzle/`), and commit both. The baseline is `drizzle/0000_baseline.sql`. The migrations table is `public.__drizzle_migrations` (in `public` so it travels with `pg_dump --schema=public`).
- **Migrate and seed**: `lib/db/migrate.ts` (`runMigrations`) takes a `pg_advisory_lock`, takes a pre-upgrade `pg_dump` into `backups/pre-upgrade/` when pending migrations hit a non-empty database (a failed dump aborts the upgrade; `MATCHEXEC_SKIP_PREUPGRADE_DUMP=true` overrides), applies migrations, runs the SQLite importer if a legacy `.db` is found, then seeds `data/games/*` (each game's `game.json` has a `dataVersion`; it re-seeds only when that changes; each game seeds in one transaction). The seeder also inserts the default `app_settings` rows and `stats_settings`.
- **`system_status`** (single row): `phase` (`starting|migrating|seeding|importing|ready|error`), `message`, `progress`, `imported_from_sqlite`, `report` (importer report). Replaces the old `.db-status.json`; `/api/db-status` and the loading screen read it, which works across pods.
- **`blobs`**: uploaded event images, scorecard screenshots and stat images (bytea, 10 MB cap, unique `path`). Written through `lib/storage.ts`; `GET /uploads/*` serves them with immutable caching and an ETag. Included in backups.
- **`control` schema**: `control.maintenance` and `control.workers` coordinate restores (quiesce). Excluded from dumps.

### Core tables

- **Matches**: `matches`, `match_participants`, `match_games`, `match_teams` (N-team rows per match), `match_game_placements` (unified results)
- **Tournaments**: `tournaments`, `tournament_participants`, `tournament_teams`, `tournament_team_members`, `tournament_matches`, `tournament_round_byes`
- **Series**: `series`, `series_events`
- **Games**: `games`, `game_modes` (with `scoring_type` and `setup_components`), `game_maps`, `game_stat_definitions`
- **Discord**: 19 queue/job tables (`discord_*_queue`, `discord_bot_requests`, `stats_*_queue`), `discord_channels`, `discord_match_messages`, `discord_settings`
- **Stats**: `scorecard_submissions`, `scorecard_player_stats`, `stats_settings`
- **Settings**: `app_settings`, `announcer_settings`, `ui_settings`, `scheduler_settings`, `voices`
- **System**: `system_status`, `blobs`, `data_versions`, `activity_feed`

### Migration commands

```bash
pnpm migrate        # run migrations + import (if a legacy .db exists) + seeding (alias: pnpm db:migrate)
pnpm db:generate    # generate a new Drizzle migration after editing lib/db/schema
```

Individual processes only connect to the database; migrations run once at startup (PM2 oneshot `db-migrator` in dev, the s6 `migrate` oneshot in Docker, a pre-install/pre-upgrade Job in Kubernetes split mode).

### Usage

```typescript
import { db } from '../../lib/db';           // lazy singleton; getDb(), getPool(), closeDb() also exported
import { games } from '../../lib/db/schema';
import { eq } from 'drizzle-orm';

const rows = await db.select().from(games).where(eq(games.id, 'overwatch2'));
```

Application code does not write SQL strings against `db`; use the domain modules in `src/lib/` (they take an `Executor` first) and Drizzle's builder, with `sql` templates for the occasional expression.

## Conventions

- **Drizzle and `Executor`**: every domain function takes an `Executor` (`Db | Tx`, from `lib/db`) as its first argument and runs on it. Never reach for the global `db` inside code that may run in a transaction.
- **Transactions**: use `db.transaction(async (tx) => { ... })` and pass `tx` explicitly to everything inside. There is no shared connection and no `withTransaction`. Take row locks (`SELECT ... FOR UPDATE`) on the aggregate row (`lockMatch`, `lockTournament`, `lockSeries`) for read-check-write flows; lock order is tournament -> matches. Work that must not run inside the tx (Discord I/O waits, activity-feed writes) goes through `AfterCommit` (`src/lib/matches/effects.ts`); optional steps run in `bestEffort` savepoints.
- **Queue inserts inside the business transaction**: any Discord queue row caused by a state change is enqueued with the same `tx` (`enqueue*` in `src/lib/queues/enqueue.ts`), so it commits or rolls back with the change.
- **Worker claim contract** (`src/lib/queues/worker.ts`): workers claim with `claimJobs` (`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *`; a claim counts as an attempt), then `completeJob`, `failJob` (exponential backoff, `max_attempts`, `permanent` skips retries) or `releaseJob`. Abandoned claims are reset by `resetAbandonedClaims`. Wrap polling ticks in `nonOverlapping`. Queue columns are `attempts`, `last_error`, `claimed_at`, `claimed_by`, `next_attempt_at`, `processed_at`, `external_message_id`.
- **`matches.winner_team` has three ID spaces**: tournament matches -> `tournament_teams.id`; standalone Normal -> `match_teams.id`; FFA/Position -> `match_participants.id`. Use `resolveWinnerEntity` in `src/lib/matches/scoreboard.ts`.
- **Schema changes must keep the SQLite importer working (plan D3)**: `lib/import-sqlite/` imports legacy `.db` files (restores of old backups too, indefinitely) into the CURRENT Drizzle schema. `mappings.ts` has one typed mapping per table (every column must be listed, so a schema change is a compile error until it is updated), and its fixture tests (`tests/integration/import`, `tests/unit/import-sqlite`) stay in the suite permanently.
- **`control` schema DDL must stay idempotent**: control tables are created in the baseline, and a restored older dump replays later migrations, so any migration touching the `control` schema must be idempotent (`IF NOT EXISTS`, etc.).
- **API routes are native Hono handlers** in `src/server/routes/*`. Throw `HttpError` for error responses (`onError` renders `{ error }`); keep response shapes stable (timestamps are ISO strings, booleans real booleans, JSON columns real objects).
- **Dependencies**: `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (7 days), so pnpm refuses packages published in the last week; Dependabot (`.github/dependabot.yml`, target branch `dev`) has a matching 7-day `cooldown`. Do not use `minimumReleaseAgeExclude` unless a security fix forces it, and log it. Install scripts are allow-listed in `allowBuilds`. Use `pnpm`/`pnpm exec`/`pnpm dlx`, never `npm`/`npx`.

## Authentication (opt-in)

Disabled unless `ADMIN_PASSWORD` is set. When set, the Hono middleware `src/server/middleware/auth.ts` (`authGate`, mounted in `src/server/app.ts`; shared helpers in `src/lib/auth-shared.ts`, routes in `src/server/routes/auth.ts`) requires an HMAC-signed session cookie for all pages and `/api/*` except `/login`, `/api/auth/*`, `/api/health`, `/api/db-status`, `/api/welcome-flow`, static assets (`/static/*`, images, manifest) and `/uploads/*` (Discord embeds link to uploads). HTML navigations are redirected to `/login?next=`, API calls get 401. In development the Vite plugin `serverNavigationGate` relays the redirects from the Hono server. Env vars (see `.env.example`):
- `ADMIN_PASSWORD` - enables auth
- `AUTH_SECRET` - cookie signing secret (default: hash of password)
- `AUTH_SESSION_DAYS` - session lifetime (default 7)
- `INTERNAL_API_TOKEN` - sent as `x-internal-token` by bot/scheduler when calling the web API (default: derived from the secret)

## Key Features

### Scoring Type System

`game_modes.scoring_type` is the canonical discriminator that drives the entire match lifecycle:
- **`Normal`** — team-based (2+ teams, blue/red default). Uses bracket formats in tournaments.
- **`FFA`** — free-for-all. No team assignment; each participant is their own entry.
- **`Position`** — race/ranking order. Points awarded by finishing position via a spread.

Key tables:
- **`match_teams`** — N-team rows per match. FFA/Position modes get one row per participant at assign-phase.
- **`match_game_placements`** — unified result table. `entity_type` ∈ `('team', 'participant')`. The legacy dual-written columns (`winner_id`, `position_results`, `blue/red_team_voice_channel`, `team_assignment`, ...) no longer exist; where the UI still needs a legacy-shaped value it is derived from placements and teams.
- **`matches.position_scoring_override`** — optional per-match points spread (jsonb).
- **`game_modes.setup_components`** — JSON array of assign-phase UI components. Defaults: Normal→`["teams"]`, FFA→`["confirm_participants"]`, Position→`["grid_order"]`. Racing modes override to `["qualifying","grid_order"]`.

Setup phase components live in `src/components/setup/`: `setup-phase.tsx` (dispatcher), `confirm-participants.tsx`, `grid-order.tsx`, `qualifying.tsx`, `classes.tsx`. Pure scoring calculations live in `src/lib/scoring/` (`position.ts`, `winners.ts`).

### Match System
- Domain module `src/lib/matches/` (barrel `index.ts`): creation, transitions (`transitions.ts`), teams, participants/signups, results (`results.ts`, `submit-result.ts`), winner votes, voice channels, map codes
- Match creation with customizable rounds, rulesets (casual/competitive), and team assignment
- `scoring_type`-aware scoring: Normal (team), FFA (participant winner), Position (ranked spread)
- Match state management (created → gather → assign → battle → complete/cancelled)
- Player participant tracking and reminders
- Voice channel integration and announcements (per `match_teams.voice_channel_id`)

### Tournament System
- Domain module `src/lib/tournaments/` (bracket math, generation, progression, standings, transitions)
- **Single elimination** and **double elimination** bracket formats (Normal/team modes)
- **Cumulative points** format for FFA/Position tournaments — leaderboard-based, no bracket
- Automated bracket generation and progression (serialised by a tournament row lock)
- Team-based tournament management, tournament-specific match scheduling, bracket visualization

### Series System
- Top-level entity for multi-event championships and seasons (`src/lib/series/`)
- Series owns an event schedule: each `series_event` links to a `match` or `tournament` with a `points_multiplier`
- Standings computed on demand (`getSeriesStandings`) from placements, per event, with a breakdown
- API: `src/server/routes/series.ts` (CRUD + events + standings)
- UI: `/series`, `/series/create`, `/series/[seriesId]`, `/series/[seriesId]/edit`, `/series/history`

### Backups and Restore
- `lib/backup.ts`: `pg_dump --format=custom --compress=zstd --schema=public` to `*.partial`, renamed on success. Automatic backups run from the scheduler (`processes/scheduler/jobs/auto-backup.ts`; default daily 04:00 container TZ, keep 14 daily + 4 weekly; on by default for embedded Postgres, off for external `DATABASE_URL`). Settings live in `app_settings`.
- Manual backup/restore: `src/server/routes/backup.ts` (mounted under `/api/settings`), page `src/client/pages/settings/backup-restore/page.tsx`. Optional AES-256-GCM wrapper (`lib/backup-crypto.ts`, `MEXECBAK` header).
- Restore (`lib/restore.ts`) accepts PostgreSQL dumps (`PGDMP`), encrypted backups and legacy SQLite `.db` files (via the importer). It quiesces workers through `control.maintenance` / `control.workers`, takes a pre-restore dump, swaps schemas, and rolls back on any failure.

### SQLite Import (upgrade from v0.8.x)
On first start with a legacy `matchexec.db` present, the migrate step makes a safety copy (`backups/pre-postgres-<timestamp>.db`), imports everything in ONE transaction (preflight fails by default on inconsistent data; `MATCHEXEC_IMPORT_ALLOW_LOSSY=true` lets it apply and report repairs), verifies standings/results against the source, moves uploads into `blobs`, then renames the file to `matchexec.db.migrated-<timestamp>` (never deletes it). CLI: `dist/import-sqlite.js` / `scripts/import-sqlite.ts`.

### Discord Integration
- Modular bot architecture (`processes/discord-bot/modules/`):
  - `voice-handler`: Voice announcements and TTS
  - `event-handler`: Server events management
  - `announcement-handler`: Match/tournament announcements with embeds
  - `reminder-handler`: Player notifications
  - `queue-processor`: Async Discord operations (claims jobs from the queue tables)
  - `interaction-handler`: Slash commands
  - `scorecard-handler`, `stats-report-handler`, `winner-vote-handler`: stats and result flows
  - `settings-manager`: Bot configuration
- Event images are read through `processes/discord-bot/utils/image-source.ts` (`/uploads/*` from `blobs`, everything else from `public/`)
- Queue-based operations for reliability

### API Architecture
Hono routers in `src/server/routes/`, mounted in `src/server/app.ts`:
- Match management (CRUD, participants, games, scoring, transitions, scorecards, stats)
- Tournament operations (brackets, teams, matches, standings)
- Series, game data (modes, maps), channel management, settings (incl. backup/restore), feed, uploads
- Health (`/api/health`, `/api/health/ready`), `/api/db-status`, `/api/metrics` (Prometheus), `/api/version`
- `AppType` is exported from `app.ts` for typed clients; pages use `fetch`

### UI Features
- Welcome flow for first-time setup
- Settings pages (Discord, Announcer, UI, Application, Scheduler, Stats, Backup/Restore)
- Match and tournament dashboards with history; polling-based live updates
- Scoring interface with format-specific components
- Map customization (codes, notes)
- Logo behavior: On desktop (md+, ≥992px), clicking the logo collapses/expands the sidebar. On mobile, clicking the logo navigates to home.

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

logger.debug('Detailed debug information');
logger.info('System started successfully');
logger.warning('Configuration missing, using defaults');
logger.error('Failed to process request:', error);
logger.critical('Database connection lost');
```

### Configuration

Log level is configured via the Application Settings page (`/settings/application`) and stored in `app_settings`:

```sql
SELECT setting_value FROM app_settings WHERE setting_key = 'log_level';
```

The logger reloads the level from the database every 5 seconds (cached).

### API Endpoint

- **GET** `/api/settings/log-level` - Retrieve current log level
- **PUT** `/api/settings/log-level` - Update log level (triggers logger reload)

### Implementation Details

- **Location**: `src/lib/logger/` (`base.ts`, `server.ts` used by the server and processes, `client.ts` for the browser, `index.ts` re-exports the server logger)
- **Fallback**: Defaults to `warning` if the database is unavailable
- **Format**: `[YYYY-MM-DD HH:MM:SS] [LEVEL] message`

### Important Notes

- **CLI scripts** (`scripts/*.js`, `lib/db/migrate*.ts`, `lib/db/seed.ts`, `lib/import-sqlite/*`) intentionally use native `console` methods (see the ESLint `no-console` exceptions in `eslint.config.mjs`)
- **All application code** (web server, Discord bot, scheduler, stats processor) uses the centralized logger
- In the Docker image there are no log files; all services write to the container log. In development PM2 writes `./app_data/data/logs/<process>-{out,error}.log`.

## Testing

### IMPORTANT: When modifying source code, always update the corresponding tests. If a function's behavior changes, its test expectations must be updated too.

### Test Framework
- **Vitest** with `pool: 'forks'` and `fileParallelism: true`, `happy-dom` environment
- Config: `vitest.config.mts`; setup: `tests/setup.ts` (sets a non-existent `CLIENT_DIR` so server tests do not depend on a local build)
- **PGlite per test file**: every test that needs a database calls `setupPgTestFile({ seed?, resetBetweenTests? })` from `tests/utils/pg-test-db.ts`. It creates a fresh in-process PGlite, applies the Drizzle migrations and injects it with `setDbForTesting`, so domain modules and Hono routes share one connection. With `seed: true` the reference tables (games, modes, maps, settings, voices) are kept between resets.
- **Real Postgres**: set `TEST_DATABASE_URL` (admin connection) and each file runs in its own `CREATE DATABASE mxtest_...`. `pnpm test:pg` does that against `postgres://postgres:postgres@127.0.0.1:55432/postgres` (start one with `docker run --rm -p 55432:5432 -e POSTGRES_PASSWORD=postgres postgres:18-alpine`). The concurrency tests (row locks, job claiming, leader lock) only run on real Postgres. CI runs the whole suite on both.

### Running Tests
```bash
pnpm test              # Run all tests (PGlite)
pnpm test:pg           # Run all tests against real Postgres 18 (TEST_DATABASE_URL)
pnpm test:unit         # Excludes tests/integration
pnpm test:integration  # tests/integration only
pnpm test:coverage     # With coverage report
```

### Test Structure
```
tests/
├── setup.ts                          # Global hooks / env
├── mocks/discord.ts                  # mockDiscordClient, createMockChannel()
├── utils/
│   ├── pg-test-db.ts                 # setupPgTestFile(), getPgTestDb(), isRealPostgres
│   ├── pg-fixtures.ts                # createGame/createGameMode/createMatch/createTournament/seedBasicTestData (Drizzle, typed)
│   ├── pg-{queue,series,stats,tournament}-fixtures.ts
│   ├── app-request.ts                # appRequest(path, { json, headers }) -> { status, headers, data, response } via app.request()
│   ├── pg-bin.ts, pg-real-db.ts      # pg_dump/pg_restore helpers for backup tests (native tools or docker shims)
│   └── legacy-sqlite.ts, import-harness.ts   # Build legacy .db fixtures for the importer tests
├── unit/
│   ├── lib/                          # Domain modules (pg-*.test.ts), pure helpers, logger, backup, maintenance
│   ├── discord-bot/                  # Handlers, queue processor, image-source, ...
│   ├── scheduler/                    # Cron jobs, auto-backup, update check
│   ├── stats-processor/              # AI extractor, stat image generator, providers
│   ├── import-sqlite/                # Importer coercion, mappings, uploads, status DTO
│   ├── components/ hooks/ create-*/  # React component tests (render inside MemoryRouter when routing is used)
│   └── validation.test.ts, shared/, utils/
└── integration/
    ├── server/                       # Hono route tests through app.request() (matches, tournaments, series, scorecards, backup-restore, auth, static, degraded, ...), incl. *-concurrency tests
    ├── database/                     # pg-baseline, pg-migrations, pg-schema, pg-seeder, pg-seed-data
    ├── import/                       # SQLite importer: clean import, preflight, lossy, atomicity, v0.7 upgrade, WAL, migrate flow
    └── queues/pg-queue-contracts.test.ts
```

(`pg-` in a file name is descriptive only; every test uses the same PGlite harness.)

### Key Source-to-Test Mappings
| Source | Test |
|--------|------|
| `src/lib/utils/validation.ts` | `tests/unit/validation.test.ts`, `tests/unit/lib/validation-edge-cases.test.ts` |
| `src/lib/matches/*`, `src/lib/scoring/*` | `tests/unit/lib/pg-matches-domain.test.ts`, `pg-scoring-*.test.ts`, `pg-match-*.test.ts`, `tests/integration/server/matches*.test.ts`, `match-lifecycle.test.ts` |
| `src/lib/tournaments/*` | `tests/unit/lib/pg-tournament-*.test.ts`, `tournament-bracket-math.test.ts`, `double-elimination.test.ts`, `tests/integration/server/tournament*.test.ts` |
| `src/lib/series/*` | `tests/unit/lib/pg-series-domain.test.ts`, `series-validation.test.ts`, `tests/integration/server/series*.test.ts` |
| `src/lib/queues/*`, `src/lib/discord-queues.ts` | `tests/unit/lib/pg-discord-queues.test.ts`, `tests/integration/queues/pg-queue-contracts.test.ts`, `tests/integration/server/discord-queues-concurrency.test.ts` |
| `src/lib/settings.ts`, `src/server/routes/settings.ts` | `tests/unit/lib/pg-settings.test.ts`, `tests/integration/server/settings.test.ts` |
| `src/server/middleware/*` | `tests/integration/server/{auth,welcome,rate-limit,degraded}.test.ts` |
| `lib/backup.ts`, `lib/restore.ts`, `lib/maintenance.ts` | `tests/unit/lib/{backup,maintenance}.test.ts`, `tests/integration/server/backup-restore-*.test.ts` |
| `lib/import-sqlite/*` | `tests/integration/import/*`, `tests/unit/import-sqlite/*` |
| `lib/db/*` | `tests/integration/database/pg-*.test.ts` |
| `processes/discord-bot/modules/*` | `tests/unit/discord-bot/*.test.ts` |
| `processes/scheduler/*` | `tests/unit/scheduler/*.test.ts` |
| `processes/stats-processor/*` | `tests/unit/stats-processor/*.test.ts` |

### Known Issues
- **TypeScript is pinned to 6.0.3**: `typescript-eslint` 8.72 does not support TypeScript 7 (it throws at load), so `pnpm lint` would not run. `tsc` 7 typechecks the repo cleanly; move when typescript-eslint supports it. Dependabot ignores `typescript` semver-major.
- **Lint warnings**: `pnpm lint` has 0 errors and ~330 warnings (complexity, nested ternaries, explicit module boundary types, `react-refresh/only-export-components`). The three React Compiler rules of `eslint-plugin-react-hooks` 7 (`set-state-in-effect`, `purity`, `immutability`) are set to `warn` because they flag intentional fetch-on-mount/polling effects.
- **Kubernetes Pod Security `restricted` is not supported**: the image's s6 init needs root before it drops to PUID/PGID. Use a `baseline` namespace or an exemption.
- **Postgres minor/patch updates need an image rebuild** (apk package, invisible to Dependabot); major upgrades are manual (`docs/postgres-major-upgrade.md`).
- Two moderate dev-only `pnpm audit` findings are accepted (`esbuild` via drizzle-kit's loader, `minimatch` via eslint).

### Writing Tests
- Call `setupPgTestFile()` at the top of any test that touches the database; use `getPgTestDb()` for direct access
- Use `appRequest()` (or `app.request()`) to test Hono routes against the real app
- Use `seedBasicTestData()` / `createMatch()` / `createTournament()` from `tests/utils/pg-fixtures.ts`
- Discord bot tests require `vi.mock()` at the top of each file (mocks don't work in setup files)
- Mocks of `@/lib/feed-helpers` should spread the real module (`importOriginal`) and override only what they need
- Tests that need real row-lock behaviour belong in `*-concurrency.test.ts` and are skipped without `TEST_DATABASE_URL`
- `transitionMatch()` validates and routes status changes (CAS under the match row lock); the API route layer only maps errors to HTTP statuses

## Technology Stack

- **Frontend**: React 19.3, Vite, React Router 7, TypeScript, Tailwind CSS 4, Mantine 9
- **Backend**: Hono (API server), Discord.js 14, node-cron
- **Database**: PostgreSQL 18, Drizzle ORM, `pg`; PGlite for tests
- **Process Management**: PM2 (dev), s6-overlay v3 (Docker)
- **Voice**: @discordjs/voice, ffmpeg-static
- **Tooling**: Node 26 (Docker image; 24+ for development), pnpm, tsx, esbuild, Vitest, ESLint

## Scripts

**Development**:
- `pnpm dev:all` - Postgres (compose.dev.yml) + all processes with PM2
- `pnpm dev:logs` - View logs from all processes
- `pnpm dev:stop` / `pnpm dev:restart` - Control PM2 processes and the Postgres container
- `pnpm dev:db:reset` - Wipe and recreate the dev database
- `pnpm dev` / `pnpm dev:server` - Vite client / Hono server on their own

**Production**:
- `pnpm prod:start` - Start the built bundles with PM2 (`pnpm build` first, `DATABASE_URL` required)
- `docker build -t matchexec .` - Build the container

**Database**:
- `pnpm migrate` (`db:migrate`) - Run migrations/import/seeding manually
- `pnpm db:generate` - Generate a Drizzle migration from schema changes

**Quality**:
- `pnpm build` - Build client, server and all process bundles into `dist/`
- `pnpm typecheck` - `tsc --noEmit`
- `pnpm lint` - ESLint check
- `pnpm test`, `pnpm test:pg`, `pnpm test:coverage`

**Utilities**:
- `pnpm version:patch/minor/major` - Bump version (also updates `kubernetes/helm/matchexec/Chart.yaml` via `scripts/update-helm-version.mjs`; for an explicit version run `pnpm version 0.10.0 --no-git-tag-version`, add `--no-git-checks` on a dirty tree)
