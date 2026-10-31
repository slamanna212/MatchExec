# MatchExec Platform Migration Plan

**Status:** Ready for implementation · **Written:** 2026-10-31 · **Revised:** 2026-10-31 (single-pass) · **Baseline:** v0.8.2

This plan covers three linked changes, implemented **in one pass on a single feature branch** and released together as **v0.10.0**:

1. **Replace Next.js** with a Vite SPA (frontend) and a Hono server (API).
2. **Replace SQLite with PostgreSQL 18**, using Drizzle ORM for schema, migrations and typed queries.
3. **One image, two deployment modes.** An all-in-one container (Unraid / `docker run`) with Postgres built in, and a split mode for Kubernetes where `MATCHEXEC_SERVICES` picks which process each pod runs. This also brings automatic backups.
4. **npm → pnpm**, with a 7-day minimum release age, every dependency updated to its latest version, and Dependabot reconfigured to match (still targeting `dev`).

There are no intermediate releases (no v0.9.0 "Vite on SQLite", no SQLite-side legacy-column migration). Because everything lands together, each route and each query is touched **once**: a domain's queries are rewritten in Drizzle and its API is rewritten as a Hono router in the same step.

**Guiding rule: clean rewrites, no compatibility layers.** No adapter that mounts old Next-style handlers onto Hono, no `db.run/get/all` wrapper over Postgres, no `?`-placeholder translation, no type-parser tricks to make Postgres look like SQLite. Every route is a native Hono handler, and every query is Drizzle. After this work the only code that touches SQLite is the one-time importer, which is a data-migration tool rather than a runtime layer.

**Second rule: behaviour parity.** Endpoint paths, JSON response shapes, accepted inputs, error status codes, polling intervals and live-update behaviour stay the same unless this plan explicitly says otherwise. The rewrite is a platform change, not a feature change.

---

## How to execute this plan (for the `/goal` run)

- Work through **Stages 0–8 in order** (Stage 0.1, the pnpm switch, comes before anything else). Each stage ends with a checkpoint; don't start the next stage until that checkpoint passes.
- During Stage 2, old (Next + SQLite) and new (Hono + Drizzle) code coexist. A domain's old route files, old queries and old tests are deleted **in the same step** that its new router, domain module and tests land. The app is not expected to run end to end until Stage 3 is done; the test suite for ported domains is the safety net until then.
- Don't stop for decisions. Where this plan is silent or turns out to be wrong about the code, pick the option that best fits the two guiding rules, carry on, and record it in **Implementation log** at the end of this file (what, why, where).
- When source changes, update the corresponding tests (project rule in CLAUDE.md).
- Run `pnpm typecheck`, `pnpm lint` and the relevant tests at every checkpoint, and the full suite at Stage 8.
- Commit/branch handling follows the user's instructions for that session; checkpoints are logical boundaries, not required commits.

---

## Decisions (resolved open questions)

These were open questions in the draft. Defaults are chosen so the run doesn't block; change them here before starting if you disagree.

| # | Question | Decision |
|---|---|---|
| D1 | Retire the legacy dual-written scoring columns? | **Yes.** The Postgres baseline contains only the target schema (no `matches.blue_team_voice_channel`/`red_team_voice_channel`, `match_games.winner_id` etc., `match_participants.team_assignment`). Dual-write code is deleted rather than ported. The importer reads `match_teams` / `match_game_placements` and *verifies* they agree with the legacy columns (see 6.4); disagreement is a preflight failure, not a silent pick. |
| D2 | Auto-backup defaults | Daily at 04:00 container TZ; keep 14 daily + 4 weekly. |
| D3 | Restoring legacy `.db` backups | Supported **indefinitely** through the importer, with no planned end date. That makes the importer permanent code: it always imports into the *current* schema, so every future Drizzle schema change must update the importer's mapping, and its fixture `.db` tests (5.6) stay in the suite permanently to catch breakage. Document this in the CLAUDE.md Conventions section (8.2). |
| D4 | Dev environment | **PM2 for the app processes + a Postgres-only `compose.dev.yml`.** `pnpm dev:all` brings up the Postgres container (waits until healthy), then starts PM2. `dev:stop` stops PM2 and the container (data kept in a named volume); `dev:restart` / `dev:logs` work as today. PM2 stays because the CLAUDE.md debugging workflow relies on its background processes and per-process log files. Everything is startable from the existing VS Code tasks (3.3). |
| D5 | Importer atomicity | Single Postgres transaction for the whole import (6.2). Self-hosted datasets are small (MBs). If testing on a real production copy shows that's impractical, switch to a staging schema + promotion and log it. |
| D6 | Embedded Postgres major upgrades | Ship version detection only. On a major mismatch the container refuses to start with a clear message; no automatic `pg_upgrade` (7.3). |
| D7 | Typed Hono client (`hc<AppType>()`) | Export `AppType` and use explicit DTO types for responses. Adopting `hc` in pages is optional and only where it doesn't complicate parity. |
| D8 | Package manager | **pnpm** (pinned via `packageManager` + Corepack), `minimumReleaseAge: 10080` (7 days, in minutes). Switch first (Stage 0.1) so every later install goes through pnpm. |
| D9 | Dependency updates | Update **everything** to latest (subject to the 7-day age) in Stage 4, after Next/SQLite are gone, so nothing is updated only to be deleted. Majors included; fix breakages rather than pinning back, and log any package that has to stay behind and why. |
| D10 | Dependabot | Keeps `target-branch: "dev"` on every ecosystem. Adds `cooldown: default-days: 7` so it never proposes a version pnpm's age gate would reject. Groups rewritten for the new stack (4.2). |

---

## Current state (what the code actually looks like)

Survey of the codebase as of v0.8.2:

| Area | Finding | Implication |
|---|---|---|
| Pages | 40 `page.tsx`; 36 are `'use client'`, the other 4 just render a client component | No real SSR. The app is already an SPA. |
| Server data in pages/layouts | None. No page or layout calls `getDbInstance` | Every page loads data via `fetch('/api/...')`. Nothing is lost by dropping Next. |
| Next APIs in UI | `useRouter` ×69, `usePathname` ×6, `useSearchParams` ×6, `redirect()` ×6, `next/link` ×3, `next/image` ×1, `next/font/google` (Geist, Geist Mono, Outfit), `metadata` export | Small, mechanical replacement surface |
| API routes | 77 `route.ts` under `src/app/api` + `src/app/uploads/[...path]` | Rewritten as Hono routers |
| Next in libs | `src/lib/{api-response,auth,rate-limit,welcome-check}.ts` import `next/server` | Replace with a small HTTP helper module |
| Middleware | `src/proxy.ts`: auth gate + welcome-flow redirect | Becomes Hono middleware |
| Processes | web, discord-bot, scheduler, stats-processor, db-migrator (oneshot) | Maps directly onto `MATCHEXEC_SERVICES` |
| DB driver | `sqlite3` callback API, wrapped in `lib/database/connection.ts` (`run/get/all/exec`) | One choke point |
| DB call sites | ~780 `db.run/get/all/exec` calls: `src/lib` 252, `src/app/api` 221, `discord-bot` 177, `lib` 50, `stats-processor` 42, `scheduler` 39 | All rewritten in Drizzle, domain by domain (Stage 2). This is the bulk of the work. |
| Transactions | `withTransaction` (21 call sites) uses `BEGIN IMMEDIATE` on **one shared connection** with an AsyncLocalStorage lock; inner code calls the *global* `db`, not a tx handle | Replaced by Drizzle `db.transaction(async tx => …)` with `tx` passed explicitly (2.3) |
| Schema | 65 tables, 27 SQLite migrations (001–028, no 023), managed by Umzug | Replaced by one Drizzle baseline for Postgres |
| SQLite-isms | `datetime('now'…)` ×73, `INSERT OR IGNORE` ×27, `INSERT OR REPLACE` ×5, `BOOLEAN` cols ×19 + ~113 `=== 1`/`? 1 : 0` patterns, `GROUP_CONCAT` ×3, `json_extract` ×2, `AUTOINCREMENT`, `PRAGMA`, `sqlite_master`, `VACUUM INTO`, `lastID` | Concrete dialect work list (2.4) |
| Shared filesystem | `.db-status.json` next to the DB (loading-screen status); `public/uploads/` written by **discord-bot** (scorecards) and **stats-processor** (stat images), served by web | **Breaks in split k8s mode.** Status moves into the DB; uploads move into Postgres (7.4). |
| Cross-process signalling | Bot polls queue tables every 3s, settings every 30s | Works as-is on Postgres. `LISTEN/NOTIFY` is out of scope (see Later). |
| Browser live updates | Polling: match pages refetch state/participants/reminders/games; tournament and series pages refetch during active phases; feed polls every 15s | Not Next-specific. Must be preserved exactly (see Stage 8 checks). |
| In-memory state in web | `src/lib/rate-limit.ts` uses an in-process `Map` | Per-replica once web scales past 1. Acceptable. |
| Backup/restore | Manual: `VACUUM INTO` → optional AES-256-GCM (`MEXECBAK` header) → download. Restore swaps the `.db` file. | Rebuilt on `pg_dump`/`pg_restore`; keep the encryption format; legacy `.db` restores go through the importer |
| Package manager | npm with `package-lock.json`; Dependabot (`npm`, `github-actions`, `docker`) weekly to `dev`, groups include `nextjs-react`; `npm`/`npx` used in Dockerfile, CI workflows, `scripts/health-check.js`, `scripts/collect-process-deps.mjs`, s6 `10-adduser`, `ecosystem.config.js` | Moves to pnpm (0.1); `collect-process-deps.mjs` must cope with pnpm's symlinked `node_modules` |
| Docker | `node:24-alpine`, s6-overlay 3.2, Next standalone + esbuild bundles + `collect-process-deps.mjs` | Simplifies: no standalone output, server becomes one more esbuild bundle |
| Helm | One Deployment, `replicas: 1`, `strategy: Recreate`, RWO PVC for SQLite | Rewritten for `aio` / `split` modes |
| Tests | 197 test files, Vitest, real SQLite per test file via `tests/utils/test-db.ts`; API tests call route handlers directly with `NextRequest` mocks | Rewritten: PGlite per file, API tests via `app.request()` |

---

## Target architecture

```
                    ┌──────────────── one image: ghcr.io/slamanna212/matchexec ───────────────┐
                    │                                                                         │
 MATCHEXEC_SERVICES │  web          Hono server: /api/*, /uploads/*, static SPA (dist/client) │
 (default: all)     │  bot          discord.js process                                       │
                    │  scheduler    cron jobs + auto-backups                                 │
                    │  stats        stats-processor                                          │
                    │  migrate      oneshot: Drizzle migrations (+ SQLite import if present)  │
                    │  postgres     embedded Postgres 18; ONLY when DATABASE_URL is unset     │
                    └─────────────────────────────────────────────────────────────────────────┘

 All-in-one (Unraid / docker run)          Kubernetes (split)
 ─────────────────────────────────         ───────────────────────────────────────────
 DATABASE_URL unset                        DATABASE_URL=postgres://… (CNPG, managed, etc.)
 MATCHEXEC_SERVICES=all                    Deployment web        SERVICES=web       replicas N, RollingUpdate
 s6 runs: postgres → migrate → web,        Deployment bot        SERVICES=bot       replicas 1, Recreate
          bot, scheduler, stats            Deployment scheduler  SERVICES=scheduler replicas 1, Recreate
 /app/app_data/                            Deployment stats      SERVICES=stats     replicas 1
   postgres/   (PGDATA)                    Job (helm hook)       SERVICES=migrate
   backups/    (auto + pre-upgrade)        No PVC required (uploads live in Postgres)
   data/matchexec.db → .migrated
```

### Environment variables (new / changed)

| Var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | *(unset)* | Unset means start embedded Postgres and connect over its Unix socket. Set means use an external DB and skip the embedded `postgres` service. |
| `MATCHEXEC_SERVICES` | `all` | Comma list from `web,bot,scheduler,stats,migrate`. `all` = every service, with migrate as a dependency. |
| `MATCHEXEC_RUN_MIGRATIONS` | `true` | When `false`, non-migrate services wait for the schema instead of migrating (used in k8s, where a Job migrates). |
| `MATCHEXEC_IMPORT_ALLOW_LOSSY` | `false` | When `true`, the importer may apply lossy repairs (skip orphans, null invalid JSON) instead of failing. Every repair is still reported. |
| `PG_POOL_MAX` | `10` | `pg` pool size per process |
| `PG_SHARED_BUFFERS` | `128MB` | Embedded Postgres tuning (also `PG_MAX_CONNECTIONS`, default `50`) |
| `MATCHEXEC_BACKUP_DIR` | `/app/app_data/backups` | Where auto/manual backups are written |
| `PUID` / `PGID` | `1001` | Unchanged. Embedded Postgres runs as this user too. |
| `DATABASE_PATH` | — | **Deprecated.** Only read by the SQLite importer to find a legacy DB. |
| `HOSTNAME` | — | Removed (Next.js-specific) |

Update `.env.example` to match.

---

## Stage 0: Foundations

Set up everything later stages build on. Old code keeps working alongside.

### 0.1 Switch to pnpm (first thing)

- `corepack use pnpm@<latest 10.x or newer>` → sets `packageManager` in `package.json`. `pnpm import` from `package-lock.json` to keep current versions, then delete `package-lock.json`.
- `pnpm-workspace.yaml` (pnpm reads its settings there) with:
  ```yaml
  minimumReleaseAge: 10080        # 7 days, in minutes
  onlyBuiltDependencies:          # pnpm 10 blocks install scripts by default; list what genuinely needs them
    - esbuild
    # + any native/voice deps that build (check `pnpm ignored-builds`)
  ```
  Use `minimumReleaseAgeExclude` only if a security fix forces it, and log it.
- Replace `npm`/`npx` with `pnpm`/`pnpm exec`/`pnpm dlx` everywhere: `package.json` scripts, `ecosystem.config.js`, Dockerfile, `.github/workflows/*.yml` (use `pnpm/action-setup` + `actions/setup-node` with `cache: pnpm`, `pnpm install --frozen-lockfile`), `scripts/health-check.js`, `scripts/fix-console-statements.js`, s6 `10-adduser`, README, CLAUDE.md commands.
- **Phantom dependencies:** pnpm's strict layout exposes imports of packages not declared in `package.json`. Declare them properly; no `shamefully-hoist`.
- **`collect-process-deps.mjs`:** update it to follow pnpm's symlinks (`realpath`) and resolve each transitive dep from its parent package's real location. If that proves unworkable, replace it with `pnpm deploy --prod` into a staging dir per bundle, or as a last resort `nodeLinker: hoisted`. Log the choice. Verify with a Docker build at Checkpoint 0.
- **Dockerfile:** `corepack enable` in the builder; `pnpm fetch` + `pnpm install --frozen-lockfile --offline` for layer caching.

**Checkpoint 0.1:** `pnpm install --frozen-lockfile` clean, `pnpm test`, `pnpm lint`, `pnpm typecheck` and `docker build` all pass on the *unchanged* app before any rewrite starts.

### 0.2 Dependencies for the new stack

- Add: `hono`, `@hono/node-server`, `@hono/zod-validator`, `zod`, `drizzle-orm`, `pg`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `react-router`, `@fontsource-variable/{geist,geist-mono,outfit}`.
- Dev: `drizzle-kit`, `@electric-sql/pglite`, `@types/pg`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.
- Importer uses `node:sqlite` (built into Node 24, no native module).
- Removals happen in Stage 8, once nothing imports them.

### 0.3 New layout

```
src/
  client/                 # Vite SPA root (Stage 3)
    main.tsx  routes.tsx  pages/  index.html
  server/                 # Hono server (bundled by esbuild like the other processes)
    index.ts              # entrypoint: serve(app) on PORT
    app.ts                # new Hono(); middleware; mounts routers; static + SPA fallback
    http.ts               # HttpError, onError handler, small response helpers
    middleware/           # auth, welcome-flow, rate-limit
    routes/               # one Hono router per domain (Stage 2)
    validation/           # zod schemas for bodies/params
lib/db/
  index.ts                # pool, db, Executor types, test hook
  schema/*.ts             # Drizzle pgTable definitions by domain
  migrate.ts              # migrator + seeder + advisory lock
drizzle/                  # generated SQL migrations (0000_baseline.sql, …)
migrations/legacy-sqlite/ # the 27 old SQLite migrations, used only by the importer
```

### 0.4 Database module

```ts
// lib/db/index.ts
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: env.PG_POOL_MAX });
export const db = drizzle(pool, { schema, casing: 'snake_case' });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;
```

Plus a test hook (`setDbForTesting`-style) so tests inject a PGlite-backed instance.

### 0.5 Schema: one Drizzle baseline

- Write `lib/db/schema/*.ts` for all tables, grouped by domain (`matches.ts`, `tournaments.ts`, `series.ts`, `discord.ts`, `settings.ts`, `games.ts`, `stats.ts`, `system.ts`, `blobs.ts`, …).
  - Source of truth: `sqlite3 matchexec.db .schema` of a fully-migrated DB (run all 27 migrations on a scratch DB), minus the legacy columns retired by D1.
- Type mapping:
  | SQLite | Postgres |
  |---|---|
  | `INTEGER PRIMARY KEY [AUTOINCREMENT]` | `integer generated always as identity` |
  | `TEXT` ids (e.g. match ids) | `text` (unchanged) |
  | `BOOLEAN` / 0-1 `INTEGER` flags | `boolean` |
  | `DATETIME` / `TEXT` timestamps | `timestamptz` (`mode: 'date'`) |
  | JSON in `TEXT` (`setup_components`, `position_scoring_override`, `scoring_config`, …) | `jsonb` with `.$type<…>()` |
  | `REAL` | `double precision` |
- **Add the foreign keys SQLite never enforced** (including the malformed `matches → game_maps` one). Use `ON DELETE CASCADE` where code currently deletes children manually; those manual deletes can then go.
- New tables: `system_status` (0.7), `blobs` (7.4). Control-plane tables used by restore (6.4) live in a separate `control` schema that is **excluded from dumps**.
- Configure the Drizzle migrations table to live in `public` (not the default `drizzle` schema) so it travels with `pg_dump --schema=public` dumps.
- Generate `drizzle/0000_baseline.sql` with `drizzle-kit generate`. From then on every schema change is a TS edit + `drizzle-kit generate`.
- Move the 27 SQLite migrations to `migrations/legacy-sqlite/`; only the importer uses them.

### 0.6 Migrator and seeder

- `migrate` entrypoint = `drizzle-orm/node-postgres/migrator` + seeder (`data/games/*` with `dataVersion`), wrapped in `pg_advisory_lock(<const>)` so two migrators (k8s Job plus a stray pod) can't collide.
- Before applying pending migrations on an existing DB, take a **pre-upgrade dump** (Stage 6 implements the dump helper; wire it in then).
- Non-migrate services on startup: wait (polling with backoff) until the migrations table reports the expected latest migration hash, then start. Replaces the s6 `db-migrator` dependency in split mode.

### 0.7 Readiness status

Replace `.db-status.json` with `system_status` (`phase`, `message`, `progress`, `updated_at`, `imported_from_sqlite`). `/api/db-status` and `ready-checker.ts` read it. Works across pods.

### 0.8 Hono skeleton and test harness

- `src/server/app.ts` with `app.onError` + `HttpError` (replaces per-route `try/catch` + `apiError()`), auth middleware, welcome-flow middleware, `/api/health`. Middleware details in 3.2.
- `tests/utils/test-db.ts` rewritten: each test file gets a fresh `PGlite()` wrapped in `drizzle-orm/pglite`, migrations applied, injected as `db`. Same per-file isolation as today.
- `tests/utils/fixtures.ts` gets Drizzle-based `seedBasicTestData` / `createMatch` / `createTournament` with typed returns (no raw SQL). Keep the old SQLite fixtures alive until their last user is ported.
- New API helper: tests call `app.request('/api/…', init)` against the real Hono app.
- `tests/integration/database/{migrations,schema,seeder}.test.ts` rewritten for Drizzle.
- CI: add a job running the suite against a `postgres:18` service container.

**Checkpoint 0:** baseline migration applies on PGlite and on Postgres 18; seeder seeds all 6 games; `/api/health` passes via `app.request()`; old suite still green.

---

## Stage 1: Rules for all rewritten code

Apply these throughout Stage 2.

### 1.1 HTTP layer (Hono)

```ts
// src/server/routes/matches.ts
export const matches = new Hono()
  .get('/', async c => c.json(await listMatches(db, parseListQuery(c.req.query()))))
  .post('/', zValidator('json', createMatchSchema), async c => {
    const match = await createMatch(db, c.req.valid('json'));
    return c.json(match, 201);
  })
  .get('/:matchId', async c => {
    const match = await getMatch(db, c.req.param('matchId'));
    return match ? c.json(match) : c.json({ error: 'Match not found' }, 404);
  });

// src/server/app.ts
app.route('/api/matches', matches);
```

- **Thin handlers:** parse input, call domain functions, shape the response. No SQL in handlers.
- **Validation:** zod + `@hono/zod-validator` replace `validateRequiredFields` in handlers. Schemas must accept exactly what the old handlers accepted and produce the same error status/body shape for bad input (e.g. `0`/`false` stay valid). Stricter validation is a feature change; don't do it here.
- **Response DTOs:** each domain has explicit response types; export `type AppType = typeof app`.
- **Caching:** API responses must not be cached by the browser or intermediaries (polling depends on fresh data). Set `Cache-Control: no-store` on `/api/*` unless an endpoint already had different behaviour.

### 1.2 Data access (Drizzle)

- **Query builder first:** `db.select().from(matches).where(eq(matches.id, id))`, `.insert(...).values(...).returning()`, `.onConflictDoNothing()` / `.onConflictDoUpdate()`. Relational API (`db.query.matches.findFirst({ with: { teams: true } })`) for nested reads.
- **Raw SQL** only via Drizzle's typed `sql\`\`` template, only where the builder can't express it (window functions in standings, recursive bracket queries). Never string-concatenated.
- **Inserts return rows** via `.returning()`; no `lastID`.
- **Types come from the schema:** `$inferSelect` / `$inferInsert`. Row interfaces in `shared/types.ts` that mirror tables are deleted; API DTOs stay explicit.
- **One domain module owns each table group** (`src/lib/matches.ts`, `tournaments.ts`, `series.ts`, `scoring.ts`, `discord-queues.ts`, `settings.ts`, …). Hono routes, the bot, the scheduler and the stats-processor all call these modules. No ad-hoc SQL against shared tables in processes.
- Processes import `db` from `lib/db` instead of constructing a `Database`.

### 1.3 Transactions: explicit `tx`

```ts
await db.transaction(async tx => {
  const [match] = await tx.insert(matches).values(input).returning();
  await createDefaultTeams(tx, match.id);
  await enqueueAnnouncement(tx, match.id);   // queue row commits with the state change
});

export async function createDefaultTeams(ex: Executor, matchId: string) { … }
```

- Every domain function that might run inside a transaction takes `ex: Executor` as its first argument.
- Nested calls pass `tx` down. Use `tx.transaction()` (savepoint) only where a partial rollback is wanted.
- **Queue inserts belong inside the business transaction.** A state change and the durable Discord queue row it causes commit together on the same `tx`. Actual Discord/network calls happen outside any DB transaction, after a worker claims committed work.
- Review each of the 21 current `withTransaction` sites for read-then-write races that `BEGIN IMMEDIATE` was hiding (bracket progression, series event ordering, scorecard assignment, team assignment). Fix with `.for('update')` on the read or `pg_advisory_xact_lock(<key>)`.

### 1.4 Worker concurrency contract

Applies to Discord queues, stats jobs and any other table a worker polls, not only the 21 transaction sites (e.g. stats workers currently mark jobs as processing without a conditional claim).

- **Atomic claim:** `UPDATE … SET status='processing', claimed_at=now(), claimed_by=$worker WHERE id IN (SELECT id … WHERE status='pending' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *`. Only rows returned are owned.
- **Retries:** attempt counter + max attempts; failures go back to `pending` with backoff or to `failed` with the error recorded.
- **Abandoned work:** claims older than a timeout (worker crashed) are reset to `pending` on the next tick.
- **Duplicate external effects:** where a retry could double-post to Discord, record the external result (e.g. message id) on the job and check it before re-sending.
- **No overlapping ticks:** a timer tick doesn't start while the previous one is still running.
- Bot and scheduler take a Postgres advisory-lock "leader" lock at startup and exit if it's held, as a guard against two instances.

### 1.5 Semantics to get right

| Topic | Decision |
|---|---|
| **Timestamps** | `timestamptz` with `mode: 'date'`; JSON serialises to ISO-8601. Delete every `+ 'Z'` / manual UTC-parsing hack. Frontend DTOs declare these as `string` (ISO). Check the frontend still parses/displays them identically. |
| **Booleans** | Real `boolean` columns. Remove the `=== 1` / `? 1 : 0` patterns as each module is ported (not all are booleans; check each). Frontend types change `number` → `boolean`; fix every consumer. |
| **JSON columns** | `jsonb` typed with `.$type<…>()`. No `safeJSONParse` / `JSON.stringify` for these columns. |
| **Counts / aggregates** | Drizzle `count()` and `sql<number>\`…\`.mapWith(Number)`; raw `int8` returns strings otherwise. |
| **Case-insensitive search** | SQLite `LIKE` was case-insensitive; use `ilike()` where intended. |
| **`GROUP BY` strictness** | Postgres rejects non-aggregated columns SQLite allowed. Standings and stats queries need care. |
| **Ordering** | No implicit rowid order. Every list query that relied on insertion order gets an explicit `orderBy`. |
| **Relative time** | `sql\`now() - interval '30 minutes'\`` or compute the `Date` in TS. One convention per module. |
| **Response shapes** | Must not change. DTO types make shape changes visible as frontend type errors. |

---

## Stage 2: Port domains (queries + routes + tests together)

For each domain, in order:

1. Write/rewrite the Drizzle domain module(s) following Stage 1.
2. Write the Hono router(s) for that domain's `route.ts` files and mount them.
3. Port every caller in `src/lib`, `lib`, the bot, the scheduler and the stats-processor that touches that domain's tables.
4. Rewrite that domain's tests (PGlite fixtures, `app.request()` for API tests); add tests for any race fixes and claim logic.
5. Delete the domain's old `route.ts` files, old queries and old tests.
6. Typecheck + run the ported tests. Green before moving on.

Order:

1. **System:** `system_status`, `db-status`, health, metrics (add `pg` pool metrics to `/api/metrics`), migrator/seeder wiring
2. **Settings:** app/ui/announcer/scheduler/discord settings, log-level (logger reads level via Drizzle), welcome-flow, auth routes
3. **Games:** games, modes, maps, map notes/codes, channels
4. **Discord queues:** all queue tables + the claim contract (1.4); the `queue-contracts` tests guard the web↔bot contract
5. **Matches:** matches, `match_teams`, participants, `match_games`, placements, scoring, transitions, reminders (D1: delete dual-write code here)
6. **Tournaments + brackets**
7. **Series + standings**
8. **Stats, feed, scorecards, uploads** (uploads go straight to the `blobs` design in 7.4), event images, debug
9. **Remaining process call sites** in bot / scheduler / stats-processor; then delete `lib/database/connection.ts`, the `Database` class, `lib/database/transaction.ts`, `src/lib/transaction.ts`, `tests/mocks/database.ts`, `processes/stats-processor/modules/db-types.ts`, and the old SQLite test harness

`src/lib/{auth,rate-limit,welcome-check}.ts` become Hono middleware/helpers in step 2; `src/lib/api-response.ts` is deleted once the last route using it is gone.

**Checkpoint 2:** `src/app/api` contains no `route.ts` files; the grep checks in Stage 8 for SQL strings pass; full suite green on PGlite.

---

## Stage 3: Frontend → Vite + React Router

### 3.1 Port

| Next.js | Replacement |
|---|---|
| File-based routing (40 pages, `welcome/layout.tsx`, `not-found.tsx`) | `react-router` v7 (library/data mode) route table in `src/client/routes.tsx`; nested route for welcome layout; `*` → NotFound. Same URLs as today. |
| `useRouter()` ×69 | `useNavigate()` (`router.push(x)` → `navigate(x)`, `router.back()` → `navigate(-1)`, `router.refresh()` → refetch) |
| `usePathname()` / `useSearchParams()` | `useLocation().pathname` / RR `useSearchParams()` |
| `redirect()` ×6 | `<Navigate to=… replace />` or loader `redirect` |
| `useParams()` | RR `useParams()` (sync; remove any `use(params)` / `Promise` params) |
| `next/link` ×3 | RR `<Link>` |
| `next/image` ×1 | `<img>` |
| `next/font/google` | `@fontsource-variable/*` (self-hosted) |
| `metadata` export | `<title>` in `index.html` + `useDocumentTitle()` hook |
| `'use client'` directives | Delete |
| `public/` | Vite `publicDir`. Drop `next.svg`/`vercel.svg`. |
| Tailwind 4 via `@tailwindcss/postcss` | `@tailwindcss/vite` |
| `@/` path alias | Vite `resolve.alias` + esbuild alias |

- Code-split pages with `React.lazy` per route (Recharts and bracket views are the heavy ones).
- Keep every polling interval, active-phase condition and post-mutation refetch exactly as it is.
- Apply the boolean/timestamp DTO type changes from 1.5 and fix all consumers.
- Logo/sidebar behaviour (collapse on md+, navigate home on mobile) unchanged.

### 3.2 Server middleware (replaces `src/proxy.ts` and `next.config.ts`)

- `authGate` on `*`, same exemptions (`/login`, `/api/auth/*`, `/api/health*`, `/api/db-status`, `/api/welcome-flow`, static assets).
- Welcome-flow redirect only for **HTML navigation requests** (non-`/api`, non-asset, `Accept: text/html`) before the SPA fallback. Same cookie logic; calls the welcome check function directly instead of fetching its own API.
- `/dev/*` → `/` redirect in production.
- `serveStatic({ root: 'dist/client' })`, long-cache hashed assets, SPA fallback to `index.html` (no-cache).
- `/uploads/*` served from `blobs` (7.4).

### 3.3 Dev, build, lint

- **Dev:** PM2 runs `vite` (port 3000, HMR) and `tsx watch src/server/index.ts` (port 3001). Vite `server.proxy` forwards `/api` and `/uploads` to 3001. `server.host: true` replaces `allowedDevOrigins`. Update `ecosystem.config.js` (migrate oneshot → `lib/db/migrate.ts`; web → `vite` + `tsx watch` server; keep log file paths under `./app_data/data/logs/`).
- **Dev Postgres (D4):** `compose.dev.yml` with one `postgres:18-alpine` service, port bound to `127.0.0.1:5432`, named volume, healthcheck (`pg_isready`). Scripts:
  - `dev:db` → `docker compose -f compose.dev.yml up -d --wait`
  - `dev:all` → `pnpm dev:db && NODE_ENV=development pm2 start ecosystem.config.js`
  - `dev:stop` → stop PM2, then `docker compose -f compose.dev.yml stop`
  - `dev:db:reset` → `down -v` then `up -d --wait` (fresh empty DB; next start migrates + seeds)
  - `.env.example` gets the matching `DATABASE_URL=postgres://matchexec:matchexec@127.0.0.1:5432/matchexec`; the dev processes default to it when `NODE_ENV=development` and it's unset.
- **VS Code tasks (`.vscode/tasks.json`):** keep every existing task and label, switching commands to pnpm (`pnpm dev:all`, `pnpm dev:restart`, `pnpm dev:stop`, `pnpm dev:logs`, `pnpm install`, `pnpm lint`, `pnpm test*`, `pnpm exec vitest run ${relativeFile}`). Add **"Reset Dev Database"** (`pnpm dev:db:reset`) and **"Typecheck"** (`pnpm typecheck`). "Start Dev Server" must work on a machine with Docker and nothing else running. Check `.vscode/launch.json` too (debug configs pointing at `next dev` → server/Vite).
- **Dev helper scripts** that open the SQLite file directly (e.g. `scripts/add-test-match-participants.js`) are ported to `lib/db`, or deleted if obsolete (log which).
- **Build:** `vite build` → `dist/client/`; `esbuild.server.config.mjs` → `dist/server.js`; also `dist/migrate.js` and `dist/import-sqlite.js`.
- **Lint:** replace `eslint-config-next` with `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.

**Checkpoint 3:** the VS Code "Start Dev Server" task (`pnpm dev:all`) brings up Postgres and all processes from a stopped state; every page loads at its old URL, deep links and refresh work, auth on/off both work, welcome redirect works on a fresh DB.

---

## Stage 4: Update every dependency + Dependabot

Done here, once Next.js, `sqlite3`, Umzug and the other removed packages are gone (do the 8.1 package removals now if not already done), so nothing gets updated only to be deleted. (D1's legacy-column cleanup no longer needs a stage; it's folded into 0.5 and Stage 2 step 5.)

### 4.1 Update

- `pnpm update --latest` for dependencies and devDependencies. pnpm's `minimumReleaseAge` keeps every resolved version at least 7 days old. Then `pnpm outdated` should show only versions still inside the 7-day window.
- Majors are included. Work through breakages one package (or one ecosystem group) at a time, re-running typecheck/lint/tests in between. Expect the most churn from: React, Mantine (v9 already; check minor changes), discord.js / `@discordjs/*`, Vitest, ESLint, TypeScript, Tailwind, Recharts, zod.
- Also bump: Node base image (`node:24-alpine` → latest LTS Alpine tag that exists), `postgres:18-alpine` tag, s6-overlay version, GitHub Actions versions in `.github/workflows/*`.
- If a package genuinely can't move to latest (upstream bug, peer conflict), pin it, add a comment in `package.json`-adjacent docs or the Implementation log with the reason, and add a Dependabot `ignore` entry only if it would otherwise open a PR that's known to fail.
- `pnpm audit`: no high/critical advisories left unaddressed (log any accepted ones).

### 4.2 Dependabot (`.github/dependabot.yml`)

Rewrite for pnpm and the new stack. Keep everything that targets **`dev`**.

- `package-ecosystem: "npm"` stays (Dependabot handles pnpm through the npm ecosystem and updates `pnpm-lock.yaml`).
- Every ecosystem (`npm`, `github-actions`, `docker`) keeps `target-branch: "dev"`, the Monday 09:00 weekly schedule, assignee, labels and commit-message prefixes.
- Add `cooldown: { default-days: 7 }` to the `npm` ecosystem (and to `docker`/`github-actions` for consistency), so Dependabot doesn't propose versions that pnpm's 7-day gate would refuse to install.
- Groups (minor + patch unless noted):
  - `patch-updates`: `*`, patch only (unchanged)
  - `mantine`: `@mantine/*`
  - `react`: `react`, `react-dom`, `react-router`, `@types/react*`
  - `vite`: `vite`, `@vitejs/*`, `@tailwindcss/vite`
  - `hono`: `hono`, `@hono/*`
  - `drizzle-pg`: `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `@electric-sql/pglite`
  - `discord`: `discord.js`, `@discordjs/*` (unchanged)
  - `typescript-types`: `@types/*` (unchanged)
  - `tailwind`: `tailwindcss`, `@tailwindcss/*` (unchanged)
  - `eslint`: `eslint*`, `@eslint/*`, `typescript-eslint` (drop `eslint-config-next`)
  - `testing`: `vitest`, `@vitest/*`
  - remove `nextjs-react`
- If the `docker` ecosystem should also track the `postgres` image, make sure the Dockerfile `FROM postgres:18-alpine` line is in a form Dependabot parses, and add an `ignore` for `postgres` major updates (a major bump needs the dump/restore procedure from 7.3, not a PR).
- Validate the file (e.g. with the GitHub schema or `actionlint`-style checker if available).

**Checkpoint 4:** `pnpm install --frozen-lockfile`, typecheck, lint, full suite and `docker build` green on the updated dependencies.

---

## Stage 5: SQLite → Postgres importer

`scripts/import-sqlite.ts` → `dist/import-sqlite.js`, run by the `migrate` service after migrations and before any other service starts. Also a CLI: `node dist/import-sqlite.js --from file.db --database-url …` for k8s users moving a SQLite PVC to external Postgres.

### 5.1 Detect

Run when a legacy file exists (`$DATABASE_PATH` or `/app/app_data/data/matchexec.db`) **and** `system_status.imported_from_sqlite` is unset **and** core tables are empty. If the marker is set but the legacy file wasn't renamed (crash after commit), just do the rename (5.5) and exit.

### 5.2 Atomicity (D5)

The entire import runs in **one Postgres transaction**: all tables, blobs, sequence resets and setting `system_status.imported_from_sqlite`. Any failure or crash rolls everything back, leaving Postgres empty and the legacy file untouched, so a retry starts clean. Progress for the loading screen (table N of M) is written on a **separate** connection so it's visible while the transaction is open.

### 5.3 Steps

1. **Safety copy:** checkpoint-free copy of the `.db` (plus `-wal`/`-shm`) to `backups/pre-postgres-<date>.db`. Open the source read-only from the copy; nothing else is running yet (s6 ordering), so no legacy writer can change it.
2. **Bring the copy current:** apply pending `migrations/legacy-sqlite/*.sql` to the copy with `node:sqlite` (so v0.7 → v0.10 imports cleanly).
3. **Preflight report** (before writing anything): orphan rows per FK, invalid JSON per column, unparseable timestamps, non-0/1 booleans, and D1 legacy-column vs `match_teams`/`match_game_placements` disagreements.
   - **Known issues** found while building the importer get explicit, documented repair rules in the importer source (e.g. a specific known orphan pattern → delete with log).
   - **Anything else fails the import** with an actionable message listing tables/ids, unless `MATCHEXEC_IMPORT_ALLOW_LOSSY=true`, in which case orphans are skipped and invalid JSON becomes null, and the full repair list is logged and stored in `system_status`.
4. **Copy in FK dependency order:** coerce 0/1 → boolean, text timestamps → `timestamptz` (naive SQLite timestamps = UTC), JSON text → `jsonb`; preserve primary keys (`OVERRIDING SYSTEM VALUE`).
5. **Uploads:** copy `public/uploads/**` (and the app_data uploads path if different) into `blobs`, preserving URL paths.
6. **Reset sequences:** `setval` each identity sequence to `max(id)`.
7. **Verify (inside the transaction):** row counts per table (minus reported repairs); every FK relationship resolves; computed results match between source and target for a sample including all series standings, tournament standings and recent match results. Mismatch → throw → rollback.
8. **Commit**, then step 5.5.

### 5.4 Loading screen

Shows phase, current table, and on failure the error summary from `system_status`.

### 5.5 Finish

After commit: rename `matchexec.db` → `matchexec.db.migrated-<date>` (and `-wal`/`-shm`). The file is never deleted.

### 5.6 Tests

Fixture `.db` files from the v0.7 era and v0.8.2, with orphans, malformed JSON and legacy-column disagreements. Cover: clean import, preflight failure, lossy mode, crash mid-import (retry is clean), crash after commit before rename, verification mismatch → rollback.

**Checkpoint 5:** importer round-trips a copy of a real production DB; standings/results comparison passes.

---

## Stage 6: Backups and restore

### 6.1 Dump helper

`lib/backup.ts`: `pg_dump --format=custom --compress=zstd --schema=public` to `*.partial`, rename on success. Used by auto backups, pre-upgrade, pre-restore and manual download.

### 6.2 Automatic backups

- Scheduler cron (D2: `0 4 * * *`, container TZ) → `$MATCHEXEC_BACKUP_DIR/auto/matchexec-<ISO>.dump`.
- Retention: last 14 daily + 4 weekly; prune after each successful run.
- **Pre-upgrade:** `migrate` dumps to `backups/pre-upgrade/` whenever it's about to apply pending migrations to a non-empty DB.
- Settings on `/settings/backup-restore`: enabled (default **on** for embedded DB, **off** for external `DATABASE_URL`), schedule (cron or presets daily/12h/weekly), retention counts, last run time/status/size, "Back up now".
- Failures write a feed event and log at `error`.
- k8s split: backups need a writable dir; chart offers a scheduler PVC (`backups.persistence.enabled`) or relying on DB-native backups.

### 6.3 Manual backup

`POST /api/settings/backup`: dump streamed to the response; keep the optional AES-256-GCM wrapper and `MEXECBAK` header. File: `matchexec-backup-<date>.dump[.enc]`.

### 6.4 Restore

Accepted formats, by magic bytes: `MEXECBAK` → decrypt then inspect; `PGDMP` → pg restore path; `SQLite format 3` → importer path (D3).

**Coordination lives outside the data being restored.** A `control` schema (excluded from dumps) holds `control.maintenance` (state, reason, started_at) and `control.workers` (process id, service, heartbeat, `paused_ack`).

1. **Quiesce:** set maintenance. Web rejects new writes with 503 and waits for in-flight requests to finish (tracked counter). Each worker checks the flag before claiming work, finishes its current job, then sets `paused_ack`. Wait until every worker with a fresh heartbeat has acked. Timeout (e.g. 60s) → abort, clear maintenance, report which process didn't quiesce.
2. **Pre-restore dump** of the current data.
3. **Restore into a fresh target:** `ALTER SCHEMA public RENAME TO prerestore_<ts>; CREATE SCHEMA public;` then `pg_restore --single-transaction --no-owner` (or the importer for SQLite) into the new `public`.
4. **Migrate + validate:** run Drizzle migrations (the backup may be older) and a sanity check (core tables present, migration hash current, row counts non-negative / plausible).
5. **Switch or roll back:** success → drop `prerestore_<ts>` (the pre-restore dump remains). Failure → drop new `public`, rename `prerestore_<ts>` back, report.
6. **Resume:** clear maintenance; workers reload settings and resume.

Backup list UI shows auto + pre-upgrade + pre-restore backups with download / restore / delete.

**Checkpoint 6:** backup → restore round trip on embedded and on external Postgres; restore while a worker is mid-job waits for it; restore with a corrupt file rolls back cleanly; legacy `.db` restore works.

---

## Stage 7: One image, two modes

### 7.1 Embedded Postgres in the image

```dockerfile
FROM postgres:18-alpine AS pg
# runner stage:
COPY --from=pg /usr/local/bin/ /usr/local/pgsql/bin/   # postgres, initdb, pg_ctl, pg_dump, pg_restore, psql, pg_isready
COPY --from=pg /usr/local/lib/postgresql /usr/local/lib/postgresql
COPY --from=pg /usr/local/share/postgresql /usr/local/share/postgresql
```

(Or `apk add postgresql18 postgresql18-client` if the base Alpine has it. Pick whichever is cleaner after testing; both images must agree on Alpine/musl version. Log the choice.)

- `pg_dump`/`pg_restore` present in **both** modes.
- Drop `.next/standalone` + `.next/static` copies; copy `dist/` (client + all bundles). `matchexec-web/run`: `node dist/server.js`.
- Remove `sqlite3` from esbuild externals and `collect-process-deps.mjs`; only natives (`@napi-rs/canvas`, voice deps) stay external. Update the CLAUDE.md "Adding Process Dependencies" section if anything changes.
- Measure image size before/after.

### 7.2 s6 service graph

```
cont-init.d/
  10-adduser               (unchanged)
  20-setup-environment     resolve MATCHEXEC_SERVICES, DATABASE_URL; write /run/matchexec/env
  30-postgres-init         only if embedded: initdb on first boot, chown/chmod 0700 PGDATA,
                           write postgresql.auto.conf overrides, check major version (7.3)
s6-rc.d/
  postgres      (longrun)  only if embedded  → exec postgres -D $PGDATA ; down-signal = SIGINT
  migrate       (oneshot)  deps: postgres (if embedded) → node dist/migrate.js (migrate + import + seed)
  web           (longrun)  deps: migrate
  bot           (longrun)  deps: migrate
  scheduler     (longrun)  deps: migrate
  stats         (longrun)  deps: migrate
```

- **Service selection:** `20-setup-environment` removes services not in `MATCHEXEC_SERVICES` from the `user` bundle (`/etc/s6-overlay/s6-rc.d/user/contents.d/<svc>`) before s6-rc compiles; same for `postgres` when `DATABASE_URL` is set. Each entrypoint also checks `MATCHEXEC_SERVICES` defensively.
- **Embedded config:** `listen_addresses = ''`, `unix_socket_directories = '/run/postgresql'`, `pg_hba`: `local all all trust`, `shared_buffers = $PG_SHARED_BUFFERS`, `max_connections = $PG_MAX_CONNECTIONS`, `max_wal_size = 512MB`, `checkpoint_timeout = 15min`. App uses `postgresql:///matchexec?host=/run/postgresql`.
- **Runs as `abc`** (PUID/PGID). PGDATA = `/app/app_data/postgres`, `chmod 0700` enforced every boot (Unraid users `chmod -R 777` appdata).
- **Shutdown:** `down-signal` = `SIGINT` (fast shutdown). App services stop before Postgres. Tune `S6_KILL_GRACETIME`/`S6_SERVICES_GRACETIME` to fit Docker's default 10s; document `--stop-timeout 30` for Unraid.
- **Healthcheck:** `/api/health`, which also reports DB connectivity.

### 7.3 Postgres major-version check (D6)

`30-postgres-init` reads `$PGDATA/PG_VERSION`. Same major → start. Different major → refuse to start with a clear log message pointing at the docs (dump with the old image, restore with the new). No automatic `pg_upgrade`: `--link` mode shares data files, so the old cluster isn't a safe rollback once the new one has started, and a safe automatic procedure needs its own design and validation in the release that first needs it. Keep the directory layout ready for side-by-side binaries.

### 7.4 Uploads in Postgres

Bot (scorecards) and stats-processor (stat images) write files web serves; in split mode there's no shared disk. Chosen: **`blobs` table (`bytea`)**: no extra infra, included in backups, files are small. (Rejected: RWX PVC, S3.)

- `blobs (id, kind, owner_type, owner_id, path, filename, content_type, size, data bytea, created_at)`, unique on `path`.
- `lib/storage.ts`: `putBlob(ex, …)`, `getBlob(path)`, `deleteBlobsFor(ex, owner)`; bot, stats-processor and event-image upload use it.
- `GET /uploads/*` keeps the existing URL shape (stored URLs and Discord embeds keep working), served from the table with `Cache-Control: immutable` + ETag.
- 10 MB per-blob cap; blobs included in feed/match retention cleanup.

**Checkpoint 7:**
- [ ] Fresh volume: initdb → migrate → all services up
- [ ] v0.8.x volume: SQLite auto-imported, `.db` renamed, data intact, uploads visible
- [ ] `PUID=99 PGID=100` works; restart and `docker stop` are clean (no recovery on next boot)
- [ ] `DATABASE_URL` set → no embedded Postgres process
- [ ] `MATCHEXEC_SERVICES=web` → only web runs; `=bot` → only bot; etc.
- [ ] Mismatched `PG_VERSION` → container refuses to start with the documented message

### 7.5 Kubernetes / Helm

Rewrite `kubernetes/helm/matchexec`:

```yaml
mode: aio            # aio | split

database:
  url: ""            # split: required (or existingSecret key DATABASE_URL)
  existingSecret: ""

web:        { replicas: 2, resources: {}, strategy: RollingUpdate }
bot:        { enabled: true, resources: {} }        # always 1 replica, Recreate
scheduler:  { enabled: true, resources: {} }        # always 1 replica, Recreate
stats:      { enabled: true, resources: {} }

migrations:
  job: true          # helm pre-install/pre-upgrade hook Job with MATCHEXEC_SERVICES=migrate

backups:
  persistence: { enabled: false, size: 5Gi }        # PVC mounted on scheduler pod

aio:
  persistence: { enabled: true, size: 5Gi }         # PGDATA + backups, single pod, Recreate
```

- **`aio`:** one pod, one PVC, `Recreate`, embedded Postgres.
- **`split`:** four Deployments from the same image, `MATCHEXEC_SERVICES` per Deployment, `MATCHEXEC_RUN_MIGRATIONS=false`, migration Job as a Helm hook. Only `web` gets a Service/Ingress/probes on `/api/health`; others get exec probes or a tiny health port.
- **Bot and scheduler always exactly 1 replica**, `Recreate` (template ignores `replicas`). The advisory-lock leader guard (1.4) backs this up.
- `web` scales past 1 (stateless HMAC auth, uploads in Postgres; rate limiter per-replica is accepted).
- Docs: example CloudNativePG `Cluster` + building `DATABASE_URL` from its secret. No bundled Postgres subchart.
- Keep ServiceMonitor/Grafana dashboard.
- Migration doc for existing SQLite chart users: scale down → importer as a one-off Job against the old PVC → switch to `split`.
- `helm lint` and `helm template` for both modes must pass.

---

## Stage 8: Cleanup, docs, final verification

### 8.1 Removals

- `next`, `eslint-config-next`, `sqlite3`, `express` (if unused), Umzug, `@tailwindcss/postcss` (package removals can happen as early as Stage 4); `package-lock.json`, any `.npmrc` settings superseded by `pnpm-workspace.yaml`; `next.config.ts`, `next-env.d.ts`, `.next/`, `src/app/`, `src/proxy.ts`, the webpack fallback hack, `createMockRequest`/`createRouteParams`, `.db-status.json` handling.

### 8.2 Docs

- CLAUDE.md: add a Conventions rule that schema changes must keep the SQLite importer working (D3); replace every `npm run`/`npx` with `pnpm`/`pnpm exec`; document the 7-day `minimumReleaseAge` and Dependabot cooldown; rewrite Architecture, Database, Migrations, Conventions (Drizzle + `Executor`/`tx`, queue-in-transaction, claim contract), Testing (PGlite, `app.request()`, updated test tree and source-to-test table), Tech Stack, Scripts, Known Issues (retire FK mismatch and Phase 8 notes), Docker deps section.
- README, `.env.example`, Unraid template: new `backups/` path, `--stop-timeout 30`, `/mnt/cache/appdata` recommendation, `MATCHEXEC_SERVICES` / `DATABASE_URL` (advanced), memory expectation (~+100–150 MB for Postgres).
- Release notes draft (`RELEASE_NOTES_0.10.md`), including rollback instructions:
  - **Failed first boot** (import failed or rolled back): nothing changed. Re-pin to v0.8.x; the original `matchexec.db` is still in place.
  - **Rollback after running on v0.10:** re-pin to v0.8.x and rename `matchexec.db.migrated-<date>` back (or use `backups/pre-postgres-<date>.db`). This returns to the **pre-migration state**; every write made on v0.10 is lost.

### 8.3 Final exit criteria (the `/goal` is done when all pass)

**Code**
- [ ] `grep -r "from 'next" src lib shared tests processes` is empty; `next` not in `package.json`
- [ ] `sqlite3` gone from `package.json`, esbuild externals and `collect-process-deps.mjs`; `node:sqlite` imported only by the importer
- [ ] `grep -rnE "\.(run|get|all|exec)\(\s*['\`]" src lib processes shared` finds no SQL strings; only raw SQL is Drizzle `sql\`\``
- [ ] No adapter or Next-style handler signatures; every API route is a native Hono handler in `src/server/routes/*`
- [ ] `lib/database/connection.ts`, `lib/database/transaction.ts`, `src/lib/transaction.ts`, `src/lib/api-response.ts`, `tests/mocks/database.ts` deleted
- [ ] `pnpm typecheck` and `pnpm lint` clean
- [ ] npm fully replaced: no `package-lock.json`; `packageManager` set; `pnpm-workspace.yaml` has `minimumReleaseAge: 10080`; `grep -rnE "\bnpm (ci|run|install)|\bnpx " Dockerfile .github scripts s6-overlay ecosystem.config.js package.json README.md CLAUDE.md` is empty (except deliberate end-user docs)
- [ ] `pnpm outdated` shows nothing older than the 7-day window (or only logged, deliberate pins); `pnpm audit` has no unaddressed high/critical
- [ ] Dev: VS Code "Start Dev Server" / "Stop Dev Server" / "Restart Dev Server" / "View Dev Logs" / "Reset Dev Database" tasks all work; `compose.dev.yml` present
- [ ] `.github/dependabot.yml` rewritten per 4.2: all ecosystems `target-branch: "dev"`, 7-day cooldown, new-stack groups, no Next groups
- [ ] Full suite green on PGlite **and** on real Postgres 18; includes concurrency tests for job claiming with real PG connections

**Behaviour**
- [ ] All 40 pages reachable at the same URLs; deep links and refresh work
- [ ] Auth on/off both work; welcome redirect works on a fresh DB
- [ ] Response shapes for main endpoints covered by DTO tests
- [ ] Live updates: a change made through Discord appears in two open browser sessions within the existing polling window
- [ ] Submitting scores updates match results, tournament/series standings and feed events without a manual reload
- [ ] Polling intervals, active/completed phase behaviour and post-mutation refetches unchanged
- [ ] Restarting a worker with pending work processes it eventually, with no lost jobs or duplicate Discord effects
- [ ] Split mode with two web replicas: both see the same committed data and uploaded images

**Deployment / data**
- [ ] Checkpoints 5, 6 and 7 all pass
- [ ] Docker image builds; all s6 services healthy; `/api/health` passes
- [ ] Helm `aio` and `split` render and lint
- [ ] CLAUDE.md, README, `.env.example`, Unraid template and release notes updated

### 8.4 Release (done by the user after the run)

Publish `:beta` / `:0.10.0-rc.N` first and have a few Unraid users test on a **copy** of their appdata, then ship **v0.10.0**.

---

## Risks

| Risk | Mitigation |
|---|---|
| Silent behaviour changes (booleans, dates, `GROUP BY`, case-sensitive `LIKE`, ordering, response shapes, validation strictness) | Rules in 1.1 / 1.5, explicit DTO types, tests on PGlite and real PG, importer computed-result verification on a real prod copy |
| Lost transactional guarantees from leaving single-connection serialisation | Explicit `tx` (1.3); review of all 21 sites; worker claim contract (1.4) with real-PG concurrency tests |
| Dependency majors (Stage 4) breaking things mid-rewrite | Done after the rewrite is green, one group at a time, with tests between each |
| pnpm strict layout breaking Docker dep collection or phantom imports | Switched and verified with a Docker build at Checkpoint 0.1, before any rewrite |
| One very large change set | Strict stage order with checkpoints; per-domain test gating; implementation log; beta tags before release |
| Data loss in import | Single-transaction import, safety copy, preflight with fail-by-default, relationship + standings verification, file never deleted |
| Restore interrupting running work | Control-schema maintenance with worker acks and timeout, restore into fresh schema with rollback |
| Unraid appdata on `/mnt/user` (FUSE) hurting Postgres | Recommend `/mnt/cache/appdata` |
| Stop timeout too short → crash recovery on boot | SIGINT fast shutdown, tuned grace times, `--stop-timeout 30` |
| Image size growth | Offset by dropping Next standalone; measured |
| Future PG major upgrades | Refuse-to-start check now; upgrade procedure designed and validated in that future release |
| PGlite vs real Postgres differences | CI job on `postgres:18`; concurrency tests on real PG only |

---

## Later (out of scope for this run)

- `LISTEN/NOTIFY` to wake the bot on queue inserts (keep polling as fallback); same for settings reload.
- Shared DTO package / full `hc<AppType>()` adoption in the SPA.
- Rate limiting in Postgres.
- `pg_stat_statements` "slow queries" debug page.
- Automatic embedded-Postgres major upgrades.

---

## Implementation log

*(Filled in during the `/goal` run: deviations from this plan, decisions made where it was silent, and anything found in the code that contradicts the survey above. One bullet per item: what, why, where.)*

- **Stage 0.1 baseline (npm, before changes):** `vitest run` 207 files / 2627 tests passed; `tsc --noEmit` clean; `eslint .` 0 errors, 209 warnings. Docker build at HEAD (npm) already FAILED at `next build` (see prerender bullet below).
- **pnpm version:** `packageManager` set to `pnpm@12.6.0` (installed version; plan allowed "latest 10.x or newer"). `package.json`.
- **Build-script setting is `allowBuilds`, not `onlyBuiltDependencies`:** pnpm 12 reports `ERR_PNPM_IGNORED_BUILDS` and points at `allowBuilds` (map of name -> true/false). `pnpm-workspace.yaml` has `minimumReleaseAge: 10080` and `allowBuilds`: `esbuild`, `sqlite3`, `bufferutil` = true; `sharp`, `unrs-resolver` = false (prebuilt binaries come via optional deps; app, tests, lint and Docker all work). `@napi-rs/canvas` and `@snazzah/davey` need no scripts.
- **Phantom dependency:** `eslint.config.mjs` imports `typescript-eslint`, which was undeclared; added as devDependency `typescript-eslint@8.59.2` (the version already in the lockfile). No other undeclared imports found by scanning src/lib/shared/processes/scripts/tests/configs. `package.json`.
- **`pnpm import` / lockfile:** imported from `package-lock.json` (versions preserved), then deleted it. `pnpm-lock.yaml` is new; `.dockerignore` unchanged.
- **`collect-process-deps.mjs` rewritten** to follow pnpm symlinks: resolves each dep Node-style from the requiring package's `realpath` (siblings in `.pnpm/<pkg>/node_modules`), copies with dereference into a flat output, and nests under the parent's `node_modules` only on version conflict. Entries of `PROCESS_DEPS` that are only transitive (`@discordjs/rest|builders|util|ws`, `tslib`; no longer hoisted by pnpm) are resolved from `discord.js`'s real location. Verified: output loads `discord.js`, `@discordjs/voice`, `umzug`, `bufferutil`, `@snazzah/davey`, `@napi-rs/canvas`; Docker container starts with all s6 services. No `pnpm deploy` / hoisted linker needed. `scripts/collect-process-deps.mjs`.
- **Dockerfile:** `corepack enable && corepack install`, `pnpm fetch` then `pnpm install --frozen-lockfile --offline` (BuildKit cache mount for the pnpm store), `pnpm run build`, `pnpm prune --prod`; runner copies `pnpm-lock.yaml` instead of `package-lock.json`. `Dockerfile`.
- **`prepare` script is now `husky || true`:** `pnpm prune --prod` runs the root `prepare` lifecycle (npm prune did not) and failed with `husky: not found` in the Docker builder. Standard husky production pattern. `package.json`.
- **Pre-existing prerender bug fixed (needed for docker build):** `next build` failed at HEAD with npm too: `useSearchParams() should be wrapped in a suspense boundary at /series/create`. Wrapped `<CreateSeriesPage />` in `<Suspense fallback={null}>`. `src/app/series/create/page.tsx`.
- **npm/npx replaced** in `package.json` scripts and lint-staged, `.husky/pre-commit`, `ecosystem.config.js` (`interpreter: 'pnpm'`, `interpreter_args: 'exec tsx'`; dev web `pnpm run dev`), `.github/workflows/{main-checks,pr-checks,claude}.yml` (`pnpm/action-setup@v4` with no version, which reads `packageManager`, plus `cache: 'pnpm'`, `pnpm install --frozen-lockfile`, `pnpm exec vitest`), `scripts/health-check.js`, `scripts/fix-console-statements.js`, `.vscode/tasks.json`, `nosonar-test-coverage.md`, `CLAUDE.md` (commands and prerequisites), s6 `10-adduser` (cache dir `.npm` -> `.cache/pnpm`). README had no npm references.
- **Not changed:** `.claude/settings.json` (permission allowlist/statusline still mention `npx`/`npm run`; an edit was blocked by the tool's permission classifier, so update by hand), historical `docs/scoring-rewrite-plan.md`, and `.github/dependabot.yml` (`package-ecosystem: "npm"` is correct for pnpm). The `version:*` scripts (now `pnpm version ...`) were converted but not exercised.
- **Checkpoint 0.1 results:** `pnpm install --frozen-lockfile` clean; `pnpm test` 207 files / 2627 tests passed; `pnpm lint` 0 errors / 209 warnings (same as baseline); `pnpm typecheck` clean; `docker build -t matchexec:pnpm-test .` succeeded; container ran ~45s, `/api/health` returned `healthy`, all s6 services (web, db-migrator, stats-processor, scheduler, discord-bot) started with no module-not-found errors. Test image removed.
- **Stage 0.2 deps:** added with pnpm (carets, not the repo's usual exact pins; Stage 4 re-pins/updates everything): `hono 4.13.13`, `@hono/node-server 2.1.5`, `@hono/zod-validator 0.9.1`, `zod 4.6.7`, `drizzle-orm 0.45.4`, `pg 8.23.1`, `vite 8.3.5`, `@tailwindcss/vite 4.3.3`, `react-router 8.5.0`, `@fontsource-variable/{geist,geist-mono,outfit} 5.3.0`; dev: `drizzle-kit 0.31.11`, `@electric-sql/pglite 0.5.11`, `@types/pg 8.23.1`, `eslint-plugin-react-refresh 0.5.7`. `@vitejs/plugin-react` and `typescript-eslint` were already present. Nothing removed. Age gate respected (no excludes).
- **`eslint-plugin-react-hooks` pinned to 7.0.1 via `overrides` in `pnpm-workspace.yaml` (+ exact devDependency):** adding it at `^7.1.1` made pnpm upgrade the copy `eslint-config-next` uses, and 7.1.x's React Compiler rules produce 26 lint errors on existing Next code. 7.0.1 is what the npm lockfile had. Revisit (remove the override, fix or disable the new rules) in Stage 3/4 when the pages are ported.
- **Table count:** the plan's survey says 65 tables; a fully migrated scratch DB has 58 domain tables (+ the SQLite-only `migrations` and `sqlite_sequence`). Drizzle schema: 58 ported + `system_status`, `blobs`, `control.maintenance`, `control.workers` = **62 tables**. SQLite `migrations` table is not ported (Drizzle's `public.__drizzle_migrations` replaces it; the importer must not read it). Also `data/games/` has **10** games, not 6 (assettocorsacompetizione, counterstrike2, fortnite, leagueoflegends, mariokart8deluxe, marvelrivals, overwatch2, r6siege, rocketleague, valorant).
- **Drizzle conventions (0.4/0.5):** no `casing` option; every column has an explicit snake_case name, and TS property keys equal the column names (snake_case) so `db.select().from(t)` rows have the same keys as today's JSON responses (response-shape parity). Table exports are camelCase (`matchGames`). `Db` is `PgDatabase<PgQueryResultHKT, Schema>` (driver-agnostic: node-postgres and PGlite both satisfy it); `Tx`/`Executor` as planned. `db` is a lazy Proxy; `getDb()`, `getPool()`, `setDbForTesting(db)`, `resetDb()`/`closeDb()` in `lib/db/index.ts`. Default dev URL and `PG_POOL_MAX` as specified; embedded URL `postgresql:///matchexec?host=/run/postgresql` is exported as `EMBEDDED_DATABASE_URL` for the Stage 7 s6 setup to export as `DATABASE_URL`.
- **Identity columns are `GENERATED BY DEFAULT AS IDENTITY`, not `ALWAYS`:** singleton settings rows are inserted with explicit ids (`id = 1`) and the SQLite importer must preserve ids. (Importer: reset each identity sequence after copying, `setval(pg_get_serial_sequence(...), max(id))`.) `stats_settings.id` is a plain integer default 1 with a `= 1` check. `system_status` and `control.maintenance` are single-row tables enforced by a `id = 1` check.
- **Retired legacy columns (D1), dropped from the baseline:** `matches.blue_team_voice_channel`, `matches.red_team_voice_channel`; `match_games.team_a, team_b, winner_id, participant_winner_id, participant1_id, participant2_id, is_ffa_mode, score_a, score_b, position_results, points_awarded` (the list in docs/scoring-rewrite-plan.md D); `match_participants.team`, `match_participants.team_assignment`. Their indexes (`idx_match_games_{ffa_mode,participant1,participant2,participant_winner,position_results}`) are dropped too. **Kept on purpose:** `scorecard_*.team_side` and `discord_winner_vote_*.team_side/voted_for` (still used by the stats UI/bot and `scorecard_submissions.team_side` is NOT NULL; docs only schedule `scorecard_player_stats.team_side` for removal but the extractor still writes it and the review UI orders by it), `match_participants.team_id` stays **nullable** (participants exist in gather before any team assignment; docs said NOT NULL), `tournament_participants.team_assignment` (a real tournament team id).
- **Nullability tightening:** any column that had a non-null SQLite DEFAULT is now `NOT NULL` with that default (timestamps, counters, booleans, `match_format`, `team_count`, ...). The importer must `COALESCE` explicit NULLs to the default. Exception: `game_modes.team_size` stays nullable (the seeder deliberately stores NULL for variable team size). Booleans: all 0/1 flags converted to `boolean` (list in `lib/db/schema/*.ts`; `matches.announcements` and `tournaments.announcements` are NOT booleans, see next bullet). `updated_at` columns use Drizzle `$onUpdate(() => new Date())` instead of SQLite triggers, so raw-SQL updates must set `updated_at` themselves.
- **JSON/jsonb:** `matches.announcements` (declared `BOOLEAN DEFAULT 1` but actually stores a JSON array of `{id,value,unit}`, or 0/1 on old rows) and `tournaments.announcements` (TEXT JSON) are `jsonb` typed `AnnouncementConfig = Announcement[] | null` (`schema/types.ts`); importer maps 0/NULL -> null, 1 -> default timings (`default_1hour`, `default_30min`, see `parseAnnouncementsField`). Other jsonb: `activity_feed.metadata`, `app_settings.metadata`, queue `announcement_data`/`data`/`result`/`winning_players`, `game_modes.setup_components`, `games.scoring_config`, `matches.{map_codes,maps,position_scoring_override}`, `tournaments.position_scoring_override`, `signup_data`, `*_stats_json`, `scorecard_submissions.{ai_processing_log,suggested_positions}`, `series.scoring_config`, `stats_settings.ai_providers_config`. `scorecard_submissions.ai_raw_response` stays `text` (raw LLM output, not guaranteed JSON). `matches.rules` stays text (free text). `ai_processing_log` is appended with `json_insert` today; in Postgres use `|| jsonb_build_array(...)`.
- **FK decisions (0.5):** SQLite-declared FKs kept with their actions. Changed/added: `matches.tournament_id -> tournaments` CASCADE; `matches.{red,blue}_team_id -> tournament_teams` SET NULL; `match_participants.team_id`, `scorecard_player_stats.team_id -> match_teams` SET NULL; `series.game_id -> games` SET NULL; `series_events.match_id/tournament_id` changed from SET NULL to **CASCADE** (SET NULL would violate the table's CHECK; code already deletes the event first); new CASCADE FKs: `match_id -> matches` on `discord_voice_announcement_queue`, `discord_stats_report_queue`, `stats_processing_queue`; `match_game_id -> match_games` on `stats_processing_queue`, `scorecard_submissions`, `scorecard_player_stats`, `scorecard_dm_messages`, `discord_winner_vote_messages`, `discord_winner_vote_queue`, `discord_scorecard_prompt_queue`; SET NULL `participant_id -> match_participants` on `scorecard_dm_messages`/`discord_winner_vote_messages`, `scorecard_submissions.submitted_by_participant_id`; `tournament_participants.team_assignment -> tournament_teams` SET NULL (replaces the manual `UPDATE ... SET team_assignment = NULL`). Manual child deletes in match/tournament/series delete code (Stage 2) can now be removed except for the cases below.
- **FKs deliberately NOT present (diverges from the SQLite DDL):** `discord_deletion_queue`, `discord_match_messages`, `discord_events`, `team_voice_channels` have no FK to `matches` (they were declared CASCADE but never enforced; the bot reads them AFTER the match row is deleted to remove Discord messages/events, and the scheduler cleans orphaned voice channels, so cascading would lose the cleanup work). Likewise `auto_voice_channels`. **No FKs from `matches`/`match_games`/`tournaments` to `game_modes`/`game_maps`** (including the "malformed matches -> game_maps" one from migration 018; `matches.map_id` is a plain text id): the seeder replaces modes/maps by delete+insert on each `dataVersion` bump and ids can change between versions, so FKs would either block reseeding or make the importer fail on dangling ids. `game_maps (mode_id, game_id) -> game_modes` composite FK IS kept (NO ACTION; seeder deletes maps before modes and inserts modes before maps; passes for all 10 games). `matches.game_id -> games` keeps CASCADE as in SQLite.
- **Queue/worker columns (1.4), applied to all 19 queue/job tables** (`discord_*_queue`, `discord_bot_requests`, `stats_image_queue`, `stats_processing_queue`): `retry_count` renamed **`attempts`**, `error_message` renamed **`last_error`**; added `max_attempts` (default 5), `claimed_at`, `claimed_by`, `next_attempt_at`, `processed_at` where missing; `external_message_id` on the Discord-posting queues (announcement, match_winner, score_notification, player_reminder, reminder, match_reminder, scorecard_prompt, winner_vote, health_alert, match_start). `status` is a checked text enum on every queue (`pending|processing|completed|failed`; `scorecard_prompt`/`winner_vote` use `pending|processing|sent|failed`, so `processing` was added to scorecard_prompt). Importer mapping: `retry_count -> attempts`, `error_message -> last_error`. Partial unique index on `discord_reminder_queue` and the two on `series_events` preserved as Postgres partial indexes.
- **Migration layout (0.3/0.5):** the 27 SQLite files moved with `git mv` to `migrations/legacy-sqlite/`; `lib/database/migrations.ts` default dir and the tests/fixtures (`tests/utils/test-db.ts`, `tests/integration/database/*`, `tests/integration/api/scoring-lifecycle-by-type.test.ts`) read from the new path. Dockerfile still copies `migrations/` (now containing only `legacy-sqlite/`) but does **not** yet copy `drizzle/`; Stage 7 must add `COPY drizzle ./drizzle` and bundle `lib/db/migrate.ts`. `drizzle/0000_baseline.sql` generated with `pnpm exec drizzle-kit generate --name baseline`; migrations table is `public.__drizzle_migrations` (set in both `drizzle.config.ts` and the runtime migrator calls). The schema `.ts` files were generated from the scratch SQLite DB by a one-off script, then hand-edited; they are now the source of truth (do not regenerate from SQLite). `src/server`, `src/client` not created (later stages).
- **Seeder port (0.6):** `lib/db/seed.ts` (`seedDatabase(db, {gamesDir, voicesFile})`). Differences from the SQLite seeder: games are upserted (`INSERT OR REPLACE` would cascade-delete modes/maps/versions under real FKs); each game's seed runs in one transaction (maps -> modes -> stats -> data_versions); it also inserts the 10 default `app_settings` rows and `stats_settings(id=1)` that the SQLite migrations inserted (they are data, not schema, so they are not in the baseline SQL); `ai_screenshot_notes` set from `stats.json` as before.
- **Migrator (0.6):** `lib/db/migrate.ts`: `runMigrations({pool?, migrationsFolder?, seed?})` (advisory lock `7310150001` held on a dedicated pooled connection; node-postgres migrator; sets `system_status` migrating -> seeding -> ready), `applyMigrationsPglite(db)` (dynamic import of `drizzle-orm/pglite/migrator`, for tests), `getExpectedLatestMigration()`, `isSchemaCurrent(pool)`, `waitForSchema({timeoutMs, ...})` (exponential backoff 250ms -> 5s, default timeout `MATCHEXEC_SCHEMA_WAIT_MS` or 5 min; compares the newest `drizzle/meta/_journal.json` hash with the newest `__drizzle_migrations` row), and `migrationHooks.preUpgradeDump` (Stage 6, called only when the DB already has applied migrations and some are pending) / `migrationHooks.importLegacySqlite` (Stage 5, called after migrations, before seeding) as no-op stubs. Migrations folder defaults to `<cwd>/drizzle`, override with `MATCHEXEC_MIGRATIONS_DIR`. CLI: `pnpm db:migrate` (`tsx lib/db/migrate.ts`), `pnpm db:generate`. `lib/db/migrate.ts` and `seed.ts` log with `console` (added to the ESLint no-console exceptions); logs are silent under `VITEST`.
- **System status (0.7):** `lib/db/system-status.ts` (`getSystemStatus`, `setSystemStatus` upsert of row id 1, `markSystemReady`, `isSystemReady`); phases `starting|migrating|seeding|importing|ready|error`; `report` jsonb reserved for the Stage 5 repair report. Old `.db-status.json` code untouched.
- **Stage 0.2-0.7 verification:** new test `tests/integration/database/pg-baseline.test.ts` (PGlite: applies the Drizzle migrations, asserts all 62 declared tables exist, legacy columns absent, all 10 games + voices + default settings seeded and reseed is a no-op, FK cascade, non-FK cleanup rows survive, system_status upsert, lazy db hook, env resolution). Real Postgres 18.6 (`postgres:18-alpine`, port 55432): `pnpm db:migrate` applied the baseline and seeded 10 games (second run no-op), `system_status` = ready/100, `waitForSchema` returned immediately and timed out correctly when the stored hash was altered; container stopped. `pnpm test` 208 files / 2637 tests pass, `pnpm typecheck` clean, `pnpm lint` 0 errors / 209 warnings (same as baseline). Not done / left for later stages: `.env.example` update (DATABASE_URL, PG_POOL_MAX), `compose.dev.yml`, Dockerfile/esbuild changes for the new migrator, CI Postgres service job.
- **Stage 0.8 Hono skeleton (`src/server/`):** `http.ts` (`HttpError` with static helpers, `onError` -> `{ error, ...extra }` same body as `apiError`; unknown errors -> 500 `Internal server error` without leaking the message; malformed JSON `SyntaxError` -> 400 `Invalid JSON body`; `HTTPException` keeps its status; `jsonOk`/`jsonError`; `apiNotFound` -> JSON 404 for `/api/*`; `noStore` middleware sets `Cache-Control: no-store` unless the endpoint set its own), `app.ts` (`onError`, `notFound`, `noStore` on `/api/*`, `authGate` + `welcomeFlow` on `*`, `/api/health` mounted, `export type AppType`; Stage 3 TODO for static/SPA fallback, `/uploads`, `/dev/*`), `index.ts` (`serve(app)`, `await waitForSchema()`, PORT env, default 3000 when `NODE_ENV=production` else 3001, graceful SIGTERM/SIGINT; does not start when `VITEST` is set), `routes/health.ts` (same body as the old route; DB check is `select 1` through Drizzle `db`).
- **Middleware are native re-implementations, old files untouched:** `middleware/auth.ts` (copy of `src/lib/auth.ts` crypto/cookie/internal-token logic over Hono `Context`, same `PUBLIC_PATHS`, same 401 JSON / redirect to `/login?next=`), `middleware/rate-limit.ts` (`checkRateLimit` throws `HttpError(429)`, `rateLimit(prefix,max,windowMs)` middleware, `clientKey`, `resetRateLimits`), `middleware/welcome.ts` (native `getWelcomeState` reading `app_settings` + `isSystemReady()` instead of fetching `/api/welcome-flow`; HTML-navigation-only: GET/HEAD, not `/api`, no file extension, `Accept` contains `text/html`; same cookie `welcome_flow_completed`, 30 days, 307 redirects). The old files (`src/lib/auth.ts`, `rate-limit.ts`, `src/proxy.ts`) stay until Stage 3 / the last Next route is gone.
- **Deviation: `/login` is exempt from the welcome redirect.** The old proxy redirected `/login` -> `/welcome` when setup was incomplete, and with auth enabled `/welcome` is not public, which loops. Not a behaviour anyone can rely on.
- **Test harness opt-in:** `tests/utils/pg-test-db.ts` exports `setupPgTestFile({ seed?, resetBetweenTests? })` (registers beforeAll/afterEach/afterAll; named so react-hooks lint does not treat it as a hook; also `createPgTestDb`, `getPgTestDb`, `resetPgTestDb`, `teardownPgTestDb`, `isRealPostgres`). `tests/setup.ts` skips the legacy SQLite per-file setup/reset for any test whose path is under `tests/integration/server/` or whose basename starts with `pg-` (decided from `expect.getState().testPath`); everything else is unchanged. Same vitest config (forks, fileParallelism). Reset = `TRUNCATE ... RESTART IDENTITY CASCADE` over all `public`/`control` tables except `__drizzle_migrations`; with `seed: true` the reference tables (games, game_modes, game_maps, game_stat_definitions, data_versions, voices, voice_data_versions, app_settings, stats_settings) are preserved.
- **Real Postgres mode:** `TEST_DATABASE_URL` (admin/maintenance connection) -> each test file runs `CREATE DATABASE mxtest_<pid>_<rand>`, applies the baseline with the node-postgres migrator, injects it with `setDbForTesting`, and in teardown `DROP DATABASE ... WITH (FORCE)`. Without it, PGlite in-process. `pnpm test:pg` runs `tests/integration/server` + `tests/integration/database/pg-*` against `TEST_DATABASE_URL` (default `postgres://postgres:postgres@127.0.0.1:55432/postgres`).
- **Fixtures:** `tests/utils/pg-fixtures.ts` (`createGame`, `createGameMode`, `createMatch`, `createTournament`, `seedBasicTestData`, typed via `$inferSelect`), `tests/utils/app-request.ts` (`appRequest(path, { json, headers... })` -> `{status, headers, data, response}`). Old `tests/utils/{test-db,fixtures}.ts` kept for unported tests.
- **Drizzle DB tests are ADDED, not rewritten in place:** `tests/integration/database/pg-{migrations,schema,seeder}.test.ts` (+ the existing `pg-baseline.test.ts`, PGlite only). The old `{migrations,schema,seeder}.test.ts` still cover the SQLite runner the running app uses until the System domain is ported in Stage 2; delete them with the old runner. New server tests: `tests/integration/server/{health,http,auth,welcome,rate-limit}.test.ts`.
- **CI:** new `postgres-test` job (service `postgres:18`, `TEST_DATABASE_URL`) in `.github/workflows/pr-checks.yml` and `main-checks.yml`; existing jobs unchanged. Plan text says "6 games" in Checkpoint 0; it is 10 games.
- **Checkpoint 0 results:** PGlite and real Postgres 18.6 (`postgres:18-alpine` on 127.0.0.1:55432, stopped afterwards, no leftover `mxtest_*` databases) both pass the 9 PG test files / 61 tests (`pnpm test:pg`); seeder seeds 10 games; `/api/health` passes via `app.request()`; full `pnpm test` green; `pnpm typecheck` clean; `pnpm lint` 0 errors / 209 warnings (same as baseline).
