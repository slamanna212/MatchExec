# MatchExec Platform Migration Plan

**Status:** Draft · **Written:** 2026-10-31 · **Baseline:** v0.8.2

This plan covers three linked changes:

1. **Replace Next.js** with a Vite SPA (frontend) and a Hono server (API).
2. **Replace SQLite with PostgreSQL 18**, using Drizzle ORM for schema, migrations and typed queries.
3. **One image, two deployment modes.** An all-in-one container (Unraid / `docker run`) with Postgres built in, and a split mode for Kubernetes where `MATCHEXEC_SERVICES` picks which process each pod runs. This mode also brings automatic backups.

Each phase is shippable on its own. Phase 1 can ship while still on SQLite.

**Guiding rule: clean rewrites, no compatibility layers.** No adapter that mounts old Next-style handlers onto Hono, no `db.run/get/all` wrapper over Postgres, no `?`-placeholder translation, no type-parser tricks to make Postgres look like SQLite. Every route is rewritten as a native Hono handler, and every query is rewritten in Drizzle. The only code that touches SQLite after v0.10 is the one-time importer, which is a data-migration tool rather than a runtime layer.

---

## Current state (what the code actually looks like)

Survey of the codebase as of v0.8.2:

| Area | Finding | Implication |
|---|---|---|
| Pages | 40 `page.tsx`; 36 are `'use client'`, the other 4 just render a client component | No real SSR. The app is already an SPA. |
| Server data in pages/layouts | None. No page or layout calls `getDbInstance` | Every page loads data via `fetch('/api/...')`. Nothing is lost by dropping Next. |
| Next APIs in UI | `useRouter` ×69, `usePathname` ×6, `useSearchParams` ×6, `redirect()` ×6, `next/link` ×3, `next/image` ×1, `next/font/google` (Geist, Geist Mono, Outfit), `metadata` export | Small, mechanical replacement surface |
| API routes | 77 `route.ts` under `src/app/api` + `src/app/uploads/[...path]` | Port to Hono; most handler bodies already use standard `Request`/`Response` |
| Next in libs | `src/lib/{api-response,auth,rate-limit,welcome-check}.ts` import `next/server` | Replace with a small HTTP helper module |
| Middleware | `src/proxy.ts`: auth gate + welcome-flow redirect | Becomes Hono middleware |
| Processes | web, discord-bot, scheduler, stats-processor, db-migrator (oneshot) | Maps directly onto `MATCHEXEC_SERVICES` |
| DB driver | `sqlite3` callback API, wrapped in `lib/database/connection.ts` (`run/get/all/exec`) | One choke point, which helps the port |
| DB call sites | ~780 `db.run/get/all/exec` calls: `src/lib` 252, `src/app/api` 221, `discord-bot` 177, `lib` 50, `stats-processor` 42, `scheduler` 39 | All rewritten in Drizzle, domain by domain (Phase 3). This is the bulk of the work. |
| Transactions | `withTransaction` (21 call sites) uses `BEGIN IMMEDIATE` on **one shared connection** with an AsyncLocalStorage lock; inner code calls the *global* `db`, not a tx handle | Replaced by Drizzle `db.transaction(async tx => …)` with `tx` passed explicitly. Every function that takes part in a transaction accepts an executor argument (Phase 3.4). |
| Schema | 65 tables, 26 SQLite migrations, managed by Umzug | Replaced by one Drizzle baseline for Postgres |
| SQLite-isms | `datetime('now'…)` ×73, `INSERT OR IGNORE` ×27, `INSERT OR REPLACE` ×5, `BOOLEAN` cols ×19 + ~113 `=== 1`/`? 1 : 0` patterns, `GROUP_CONCAT` ×3, `json_extract` ×2, `AUTOINCREMENT`, `PRAGMA`, `sqlite_master`, `VACUUM INTO`, `lastID` | Concrete dialect work list (Phase 3.5) |
| Shared filesystem | `.db-status.json` next to the DB (migration status for the loading screen); `public/uploads/` written by **discord-bot** (scorecards) and **stats-processor** (stat images), served by web | **Breaks in split k8s mode.** Status moves into the DB; uploads move into Postgres (Phase 4.4). |
| Cross-process signalling | Bot polls queue tables every 3s, settings every 30s | Works as-is on Postgres. `LISTEN/NOTIFY` is an optional later upgrade. |
| In-memory state in web | `src/lib/rate-limit.ts` uses an in-process `Map` | Per-replica only once web scales past 1. Acceptable for now (noted). |
| Backup/restore | Manual: `VACUUM INTO` → optional AES-256-GCM (`MEXECBAK` header) → download. Restore swaps the `.db` file. | Rebuild on `pg_dump`/`pg_restore`; keep the encryption format; legacy `.db` restores go through the importer |
| Docker | `node:24-alpine`, s6-overlay 3.2, Next standalone + esbuild bundles + `collect-process-deps.mjs` | Simplifies: no standalone output, server becomes one more esbuild bundle |
| Helm | One Deployment, `replicas: 1`, `strategy: Recreate`, RWO PVC for SQLite | Rewritten for `aio` / `split` modes |
| Tests | 197 test files, Vitest, real SQLite per test file via `tests/utils/test-db.ts`; API tests call route handlers directly with `NextRequest` mocks | Phase 1 rewrites API tests to `app.request()`. Phase 3 rewrites fixtures in Drizzle and runs on PGlite. |

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
| `PG_SHARED_BUFFERS` | `128MB` | Embedded Postgres tuning (also `PG_MAX_CONNECTIONS`, default `50`) |
| `MATCHEXEC_BACKUP_DIR` | `/app/app_data/backups` | Where auto/manual backups are written |
| `PUID` / `PGID` | `1001` | Unchanged. Embedded Postgres runs as this user too. |
| `DATABASE_PATH` | — | **Deprecated.** Only read by the SQLite importer to find a legacy DB. |
| `HOSTNAME` | — | Removed (Next.js-specific) |

---

## Phase 1: Next.js → Vite + React Router + Hono (still SQLite)

**Goal:** remove Next.js entirely with no behaviour change and the database untouched.

### 2.1 New layout

```
src/
  client/                 # Vite SPA root
    main.tsx              # createRoot, MantineProvider, Router
    routes.tsx            # route table (mirrors current src/app paths)
    pages/                # moved from src/app/**/page.tsx (+ *Client.tsx)
    index.html
  server/                 # Hono server (bundled by esbuild like the other processes)
    index.ts              # entrypoint: serve(app) on PORT
    app.ts                # new Hono(); middleware; mounts routers; static + SPA fallback
    middleware/           # auth, welcome-flow, rate-limit, error handler
    routes/               # one Hono router per domain
      matches.ts          # /api/matches/** (today ~25 route.ts files)
      tournaments.ts
      series.ts
      games.ts
      settings.ts
      channels.ts
      auth.ts  health.ts  feed.ts  stats.ts  welcome.ts  uploads.ts  debug.ts …
    validation/           # zod schemas for request bodies/params (@hono/zod-validator)
  components/  lib/  …    # unchanged in Phase 1 (lib loses its next/server imports)
```

### 2.2 API rewrite: native Hono routers

All 77 `route.ts` files are rewritten as native Hono handlers, grouped into one router per domain. No adapter, and no Next-style `(request, { params })` signatures survive.

```ts
// src/server/routes/matches.ts
export const matches = new Hono()
  .get('/', async c => c.json(await listMatches(parseListQuery(c.req.query()))))
  .post('/', zValidator('json', createMatchSchema), async c => {
    const match = await createMatch(c.req.valid('json'));
    return c.json(match, 201);
  })
  .get('/:matchId', async c => {
    const match = await getMatch(c.req.param('matchId'));
    return match ? c.json(match) : c.json({ error: 'Match not found' }, 404);
  })
  .post('/:matchId/transition', zValidator('json', transitionSchema), …);

// src/server/app.ts
app.route('/api/matches', matches);
```

- **Validation:** `zod` schemas + `@hono/zod-validator` replace the hand-rolled `validateRequiredFields` checks in handlers. Request bodies are typed end to end.
- **Errors:** one `app.onError` handler plus an `HttpError` class replaces the per-route `try/catch` + `apiError()` boilerplate. `src/lib/api-response.ts` is deleted.
- **Thin handlers:** while rewriting each route, inline SQL moves out of the handler into the domain module in `src/lib` that owns it (e.g. `src/lib/matches.ts`). Handlers only parse input, call domain functions and shape the response. That way Phase 3 rewrites data access in one place per domain, without touching the HTTP layer again.
- **Typed client (optional, recommended):** export `type AppType = typeof app` and use Hono's `hc<AppType>()` client in the SPA, so frontend `fetch` calls get compile-time checked paths, params and response types. This can be adopted page by page.
- `src/lib/{auth,rate-limit,welcome-check}.ts` are rewritten as Hono middleware/helpers; their `next/server` imports go away.
- **Tests:** `tests/integration/api/*` are rewritten to call `app.request('/api/…', init)` against the real Hono app. `createMockRequest`/`createRouteParams` are deleted.

### 2.3 Middleware (replaces `src/proxy.ts`)

- `authGate`: Hono middleware on `*`, same exemptions (`/login`, `/api/auth/*`, `/api/health*`, `/api/db-status`, `/api/welcome-flow`, static assets).
- Welcome-flow redirect: middleware that runs only for **HTML navigation requests** (non-`/api`, non-asset, `Accept: text/html`) before the SPA fallback. Same cookie logic, but it calls the welcome check function directly instead of `fetch`-ing its own API.
- `/dev/*` → `/` redirect in production (from `next.config.ts`).
- Static: `serveStatic({ root: 'dist/client' })`, long-cache hashed assets, then SPA fallback to `index.html`.
- `/uploads/*`: port of `src/app/uploads/[...path]/route.ts` (replaced again in Phase 4.4).

### 2.4 Frontend port

| Next.js | Replacement |
|---|---|
| File-based routing (40 pages, `welcome/layout.tsx`, `not-found.tsx`) | `react-router` v7 (library/data mode) route table in `src/client/routes.tsx`; nested route for welcome layout; `*` → NotFound |
| `useRouter()` ×69 | `useNavigate()` (`router.push(x)` → `navigate(x)`, `router.back()` → `navigate(-1)`, `router.refresh()` → refetch) |
| `usePathname()` / `useSearchParams()` | `useLocation().pathname` / RR `useSearchParams()` |
| `redirect()` ×6 | `<Navigate to=… replace />` or loader `redirect` |
| `useParams()` | RR `useParams()` (sync, so remove any `use(params)` / `Promise` params in pages) |
| `next/link` ×3 | RR `<Link>` |
| `next/image` ×1 | `<img>` |
| `next/font/google` | `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource-variable/outfit` (self-hosted, no Google fetch at build) |
| `metadata` export | `<title>` in `index.html` + small `useDocumentTitle()` hook |
| `'use client'` directives | Delete |
| `public/` | Vite `publicDir`. Drop `next.svg`/`vercel.svg`. |
| Tailwind 4 via `@tailwindcss/postcss` | `@tailwindcss/vite` |
| `@/` path alias | Vite `resolve.alias` + esbuild alias (already used by process bundles) |

Code-split pages with `React.lazy` per route so the initial bundle stays small. Recharts and the bracket views are the heavy ones.

### 2.5 Dev and build

- **Dev:** PM2 runs `vite` (port 3000, HMR) and `tsx watch src/server/index.ts` (port 3001). Vite `server.proxy` forwards `/api` and `/uploads` to 3001. `allowedDevOrigins` is replaced by `server.host: true`.
- **Build:** `vite build` → `dist/client/`; `esbuild.server.config.mjs` → `dist/server.js` (same pattern as bot/scheduler).
- **Lint:** drop `eslint-config-next`; use `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.
- **Remove:** `next`, `eslint-config-next`, `next.config.ts`, `next-env.d.ts`, `.next/`, the `webpack` fallback hack, the `express` dependency (check it's unused once Hono lands).

### 2.6 Docker changes in Phase 1

- Drop `.next/standalone` + `.next/static` copies; copy `dist/` (client + all process bundles).
- `matchexec-web/run`: `node dist/server.js`.
- Web's runtime deps are bundled by esbuild. Only natives (`sqlite3` until Phase 3, `@napi-rs/canvas`, voice deps) stay external via `collect-process-deps.mjs`.
- Expect noticeably faster builds and a smaller image (no standalone `node_modules` copy).

### 2.7 Phase 1 exit criteria

- [ ] `grep -r "from 'next" src lib shared tests` is empty; `next` not in `package.json`
- [ ] All 40 pages reachable at the same URLs; deep links and refresh work (SPA fallback)
- [ ] Auth on/off both work; welcome redirect works on a fresh DB
- [ ] No adapter or Next-style handler signatures: every API route is a native Hono handler in `src/server/routes/*`; `src/lib/api-response.ts`, `createMockRequest`, `createRouteParams` deleted
- [ ] API tests run through `app.request()`; request bodies validated with zod
- [ ] Full test suite green; `npm run typecheck` and `lint` clean
- [ ] Docker image builds; all s6 services healthy; `/api/health` passes
- [ ] Ship as **v0.9.0** (still SQLite)

---

## Phase 2 (prerequisite cleanup): finish scoring "Phase 8" on SQLite

CLAUDE.md lists legacy columns that are still dual-written (`matches.blue_team_voice_channel`, `red_team_voice_channel`, `match_games.winner_id` etc., `match_participants.team_assignment`). **Drop them before the Postgres port**, so that:

- the Postgres baseline schema is the clean target schema rather than a copy of transitional cruft,
- the SQLite importer has fewer columns to map,
- dozens of dual-write call sites disappear instead of being rewritten in Drizzle only to be deleted later.

Ship as `027_drop_legacy_columns.sql` in **v0.9.x**, after the scoring rewrite has run in production long enough. If the scoring rewrite isn't ready to retire yet, Phase 3 can still proceed and the legacy columns just come along in the baseline.

---

## Phase 3: PostgreSQL 18 + Drizzle

### 3.1 Stack

- **Driver:** `pg` (node-postgres), pure JS, so `sqlite3` drops out of the Docker native-deps list.
- **ORM:** `drizzle-orm` + `drizzle-kit` (migrations).
- **Tests:** `@electric-sql/pglite` (Postgres compiled to WASM, in-process) via Drizzle's PGlite driver. It's fast, needs no Docker in dev, and keeps the per-file isolation the suite has today. CI also runs the suite against a real `postgres:18` service container.
- **Importer:** `node:sqlite` (built into Node 24, no native module) to read legacy `.db` files.

### 3.2 Schema: one Drizzle baseline

- Write `lib/database/schema/*.ts` (Drizzle `pgTable` definitions) for all 65 tables, grouped by domain (`matches.ts`, `tournaments.ts`, `series.ts`, `discord.ts`, `settings.ts`, `games.ts`, `stats.ts`, …).
  - Start from `sqlite3 matchexec.db .schema` of a fully-migrated DB as the source of truth.
- Type mapping rules:
  | SQLite | Postgres |
  |---|---|
  | `INTEGER PRIMARY KEY [AUTOINCREMENT]` | `integer generated always as identity` (or `serial`) |
  | `TEXT` ids (e.g. match ids) | `text` (unchanged) |
  | `BOOLEAN` / 0-1 `INTEGER` flags | `boolean` |
  | `DATETIME` / `TEXT` timestamps | `timestamptz` |
  | JSON stored in `TEXT` (`setup_components`, `position_scoring_override`, `scoring_config`, …) | `jsonb` |
  | `REAL` | `double precision` |
- **Add the foreign keys that SQLite never enforced** (CLAUDE.md: FKs off, malformed `matches → game_maps` FK). Postgres enforces them. Use `ON DELETE CASCADE` where code currently deletes children manually; those manual deletes then become harmless no-ops. Expect the importer (3.7) to surface orphan rows, which it must handle (log + skip).
- Generate `drizzle/0000_baseline.sql` with `drizzle-kit generate`. From then on every schema change is a TS edit + `drizzle-kit generate`.
- Move the 26 SQLite migrations to `migrations/legacy-sqlite/`. The importer still uses them (3.7); nothing else does.

### 3.3 Data access: Drizzle everywhere, rewritten domain by domain

There is no wrapper that keeps `db.run/get/all` alive. `lib/database/connection.ts`, the `Database` class, `tests/mocks/database.ts` and `processes/stats-processor/modules/db-types.ts` are all **deleted**. Every one of the ~780 call sites is rewritten in Drizzle.

```ts
// lib/db/index.ts
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: env.PG_POOL_MAX });
export const db = drizzle(pool, { schema, casing: 'snake_case' });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;
```

**Rules for the rewritten code**
- **Query builder first:** `db.select().from(matches).where(eq(matches.id, id))`, `db.insert(...).values(...).returning()`, `.onConflictDoNothing()` / `.onConflictDoUpdate()`. Use the relational API (`db.query.matches.findFirst({ with: { teams: true } })`) for nested reads such as match + teams + participants.
- **Raw SQL** only through Drizzle's typed `sql\`\`` template, and only where the builder can't express something (window functions in standings, recursive bracket queries). Never string-concatenated.
- **Inserts return rows** via `.returning()`, so there's no `lastID` concept.
- **Types come from the schema:** `typeof matches.$inferSelect` / `$inferInsert`. Hand-written row interfaces in `shared/types.ts` that mirror tables are deleted. API response DTOs stay as explicit types (see 3.5).
- **One domain module owns each table group** (`src/lib/matches.ts`, `tournaments.ts`, `series.ts`, `scoring.ts`, `discord-queues.ts`, `settings.ts`, …). Route handlers (already thin after Phase 1), the bot, the scheduler and the stats-processor all call these modules. Processes no longer write ad-hoc SQL against shared tables.
- **Discord bot / scheduler / stats-processor** import `db` from `lib/db` instead of constructing a `Database`. Their 258 call sites are rewritten in the same pass.

**Rewrite order** (each domain is done fully, including its tests, before moving on):
1. `lib/db`, schema, migrator, seeder, `system_status`
2. settings / app_settings / ui / announcer / scheduler settings (simple CRUD, good warm-up)
3. games, modes, maps, channels
4. Discord queues (shared contract between web and bot; the `queue-contracts` tests guard it)
5. matches, match_teams, participants, match_games, placements, scoring
6. tournaments + brackets
7. series + standings
8. stats, feed, scorecards, blobs (4.4), metrics, health
9. bot / scheduler / stats-processor remaining call sites

The app can't run half on SQLite and half on Postgres, so all of Phase 3 lands before v0.10 ships. The order above is about reviewability and keeping tests meaningful, not about partial releases.

### 3.4 Transactions: explicit `tx`, no ambient magic

`withTransaction` and `lib/database/transaction.ts` (with their AsyncLocalStorage lock) are deleted. Transactions use Drizzle directly and pass `tx` explicitly:

```ts
await db.transaction(async tx => {
  const [match] = await tx.insert(matches).values(input).returning();
  await createDefaultTeams(tx, match.id);          // takes `Executor`
});

export async function createDefaultTeams(ex: Executor, matchId: string) { … }
```

- Any domain function that might run inside a transaction takes an `ex: Executor` first argument (default `db` at the call site). This replaces today's implicit "inner code uses the global `db` and happens to share the connection".
- Nested calls just keep passing `tx`. Use `tx.transaction()` (savepoint) only where a partial rollback is actually wanted.
- The per-connection serialisation lock goes away, because Postgres handles concurrent transactions natively.
- Each of the 21 current `withTransaction` sites gets reviewed for read-then-write races that `BEGIN IMMEDIATE` was hiding (bracket progression, series event ordering, scorecard assignment, team assignment). Fix them with `.for('update')` on the read or `pg_advisory_xact_lock(<key>)`.
- Discord queue inserts that other processes poll stay outside the transaction where practical (existing guidance).

### 3.5 Semantics to get right while rewriting

Rewriting in Drizzle removes the SQLite syntax (`datetime('now')`, `INSERT OR IGNORE`, `GROUP_CONCAT`, `json_extract`, `PRAGMA`, `sqlite_master`, `VACUUM INTO` all simply don't exist in the new code). What does need deliberate attention:

| Topic | Decision |
|---|---|
| **Timestamps** | Columns are `timestamptz` with `mode: 'date'`, so the server works with `Date` objects. JSON responses serialise them to ISO-8601 automatically. Delete every `+ 'Z'` / manual UTC-parsing hack in server code. Frontend DTO types declare these fields as `string` (ISO). |
| **Booleans** | Real `boolean` columns. The ~113 `=== 1` / `? 1 : 0` patterns go away as each module is rewritten (not all are booleans, so check each). Frontend types change from `number` to `boolean` for these fields. |
| **JSON columns** | `jsonb` typed with `.$type<SetupComponent[]>()` etc. No more `safeJSONParse` on read / `JSON.stringify` on write for these columns. |
| **Counts / aggregates** | Use Drizzle's `count()` (returns `number`) and `sql<number>\`…\`.mapWith(Number)` for sums. Raw `int8` comes back as a string otherwise. |
| **Case-insensitive search** | SQLite `LIKE` was case-insensitive; use `ilike()` where that behaviour is intended. |
| **`GROUP BY` strictness** | Postgres rejects non-aggregated columns that SQLite allowed. Standings and stats queries need care. |
| **Ordering** | Postgres has no implicit rowid order. Every list query that relied on insertion order gets an explicit `orderBy`. |
| **Relative time** | `sql\`now() - interval '30 minutes'\`` or compute the `Date` in TS and compare. Pick one convention per module. |
| **API response shapes** | Rewriting queries must not silently change JSON shapes the frontend relies on. Each domain gets explicit response DTO types (ideally inferred through the Hono typed client from Phase 1), so shape changes show up as frontend type errors. |

### 3.6 Migrations and readiness

- `migrate` service = `drizzle-orm/node-postgres/migrator` + seeder (`data/games/*` with `dataVersion`), wrapped in `pg_advisory_lock(<const>)` so two migrators (e.g. a k8s Job plus a stray pod) can't collide.
- **Replace `.db-status.json`** with a `system_status` table (`phase`, `message`, `progress`, `updated_at`). The loading screen (`/api/db-status`) and `ready-checker.ts` read from it. This works across pods.
- Non-migrate services on startup: wait until `__drizzle_migrations` reports the expected latest migration hash (polling with backoff), then start. This replaces the s6 `db-migrator` dependency for split mode.

### 3.7 SQLite → Postgres importer (automatic, first boot)

`scripts/import-sqlite.ts`, bundled as `dist/import-sqlite.js` and run by the `migrate` service:

1. **Detect:** legacy file exists (`$DATABASE_PATH` or `/app/app_data/data/matchexec.db`) **and** Postgres has no imported data (`system_status.imported_from_sqlite` unset and core tables empty).
2. **Safety copy:** copy the `.db` (plus `-wal`/`-shm`) to `backups/pre-postgres-<date>.db` before touching anything.
3. **Bring the legacy DB current:** open it with `node:sqlite`, apply any pending `migrations/legacy-sqlite/*.sql` (so a user jumping from v0.7 → v0.10 still imports cleanly).
4. **Copy in dependency order**, in one Postgres transaction per table batch:
   - coerce 0/1 → boolean, text timestamps → `timestamptz` (treat naive SQLite timestamps as UTC), JSON text → `jsonb` (invalid JSON → null + warning),
   - orphan rows that violate the new FKs → skip + log a summary (count per table),
   - preserve primary keys exactly (`OVERRIDING SYSTEM VALUE` for identity columns).
5. **Reset sequences:** `setval` each identity sequence to `max(id)`.
6. **Verify:** compare row counts per table (minus logged skips). Mismatch → roll back, leave the `.db` in place, mark the migrate service failed with a clear log message.
7. **Finish:** rename `matchexec.db` → `matchexec.db.migrated-<date>`, set `system_status.imported_from_sqlite`.
8. The loading screen shows import progress (table N of 65) via `system_status`.

Also exposed as a CLI (`node dist/import-sqlite.js --from file.db --database-url …`) for k8s users moving an existing SQLite PVC to an external Postgres.

### 3.8 Tests on Postgres

- `tests/utils/test-db.ts` is rewritten: each test file gets a fresh `PGlite()` instance wrapped in `drizzle-orm/pglite`, the migrations are applied, and the instance is injected as `db` (via a `lib/db` test hook). Same per-file isolation as today.
- `tests/utils/fixtures.ts` (`seedBasicTestData`, `createMatch`, `createTournament`) is rewritten with Drizzle inserts and typed return values. No raw SQL seeding.
- `tests/mocks/database.ts` is deleted. Unit tests that mocked the DB either use PGlite directly or mock the domain module they depend on.
- `tests/integration/database/{migrations,schema,seeder}.test.ts` are rewritten for Drizzle migrations.
- Each domain's tests are rewritten in the same step as that domain's queries (3.3 order), and the suite is expected to be green after every domain.
- New tests: transaction rollback / race behaviour (`FOR UPDATE` paths), importer (fixture `.db` files from the v0.7 era and v0.8.2, with orphans and malformed JSON), DTO shapes for the main endpoints.
- CI: matrix job against a `postgres:18` service so PGlite-vs-real drift gets caught.

### 3.9 Phase 3 exit criteria

- [ ] `sqlite3` removed from `package.json`, esbuild externals and `collect-process-deps.mjs`
- [ ] `lib/database/connection.ts`, `lib/database/transaction.ts`, `src/lib/transaction.ts`, `tests/mocks/database.ts` deleted
- [ ] `grep -rnE "\.(run|get|all|exec)\(\s*['\`]" src lib processes shared` finds no SQL strings; the only raw SQL is Drizzle `sql\`\`` templates
- [ ] `node:sqlite` imported only by the importer
- [ ] Full suite green on PGlite **and** on real Postgres 18
- [ ] Importer round-trips a copy of a real production DB with matching row counts
- [ ] FK enforcement on; CLAUDE.md "FK schema mismatch" known issue retired; CLAUDE.md "Database" / "Conventions" sections rewritten for Drizzle

---

## Phase 4: One image, two modes

### 4.1 Embedded Postgres in the image

- Copy Postgres 18 binaries from the official image rather than relying on Alpine package timing:
  ```dockerfile
  FROM postgres:18-alpine AS pg
  # runner stage:
  COPY --from=pg /usr/local/bin/ /usr/local/pgsql/bin/   # postgres, initdb, pg_ctl, pg_dump, pg_restore, psql, pg_isready
  COPY --from=pg /usr/local/lib/postgresql /usr/local/lib/postgresql
  COPY --from=pg /usr/local/share/postgresql /usr/local/share/postgresql
  ```
  (Alternatively `apk add postgresql18 postgresql18-client` if the base Alpine has it. Pick whichever is cleaner after testing. Both base images must agree on musl/Alpine version.)
- Expected size cost: ~40–60 MB. Offset by dropping Next standalone `node_modules`.
- `pg_dump`/`pg_restore` are present in **both** modes (backups against external DBs need them).

### 4.2 s6 service graph

```
cont-init.d/
  10-adduser               (unchanged)
  20-setup-environment     resolve MATCHEXEC_SERVICES, DATABASE_URL; write /run/matchexec/env
  30-postgres-init         only if embedded: initdb on first boot, chown/chmod 0700 PGDATA,
                           write postgresql.conf overrides, detect major-version mismatch
s6-rc.d/
  postgres      (longrun)  only if embedded  → exec postgres -D $PGDATA ; down-signal = SIGINT
  migrate       (oneshot)  deps: postgres (if embedded)   → node dist/migrate.js (import + migrate + seed)
  web           (longrun)  deps: migrate
  bot           (longrun)  deps: migrate
  scheduler     (longrun)  deps: migrate
  stats         (longrun)  deps: migrate
```

- **Service selection:** `20-setup-environment` removes (or marks down) services not in `MATCHEXEC_SERVICES` by deleting their entries from the `user` bundle at boot (`/etc/s6-overlay/s6-rc.d/user/contents.d/<svc>`) before s6-rc compiles. Same for `postgres` when `DATABASE_URL` is set. Each process entrypoint also checks `MATCHEXEC_SERVICES` defensively.
- **Embedded Postgres config** (`postgresql.auto.conf` written by init):
  - `listen_addresses = ''` (Unix socket only, nothing exposed), `unix_socket_directories = '/run/postgresql'`
  - `pg_hba`: `local all all trust`. Socket-only, inside the container.
  - `shared_buffers = $PG_SHARED_BUFFERS`, `max_connections = $PG_MAX_CONNECTIONS`, `max_wal_size = 512MB`, `checkpoint_timeout = 15min`
  - App connects with `DATABASE_URL=postgresql:///matchexec?host=/run/postgresql` (set internally)
- **Runs as `abc`** (PUID/PGID). Postgres refuses to run as root, which suits this. PGDATA = `/app/app_data/postgres`, chmod `0700` (Postgres refuses group/world-readable data dirs. Init must enforce this every boot, since Unraid users love `chmod -R 777` on appdata).
- **Shutdown:** `down-signal` = `SIGINT` (Postgres "fast" shutdown; the default SIGTERM is "smart" and waits for clients). Make app services stop before Postgres (reverse dependency order handles it). Set `S6_KILL_GRACETIME`/`S6_SERVICES_GRACETIME` so the whole stop fits in Docker's default **10s**; document `--stop-timeout 30` in the Unraid template as extra margin.
- **Healthcheck:** unchanged (`/api/health`). In `all` mode `/api/health` also reports DB connectivity.

### 4.3 Postgres major-version upgrades (designing for 18 → 19 now)

- `30-postgres-init` reads `$PGDATA/PG_VERSION`. Same major → start normally.
- Different major (future): the image for that release ships **both** the old and new major binaries (`/usr/local/pgsql/18/bin`, `/usr/local/pgsql/19/bin`). Init then:
  1. takes a `pg_dump` with the old binaries into `backups/pre-pg<new>-<date>.dump`,
  2. runs `pg_upgrade --link` into a new data dir,
  3. on success swaps dirs and keeps the old one as `postgres.pg18.bak` until the next boot succeeds, then deletes it,
  4. on failure leaves the old cluster untouched and starts the old binaries, logging loudly.
- Not needed for 18, but the version check and directory layout ship in Phase 4 so it's ready.

### 4.4 Uploads move into Postgres

Bot (scorecards) and stats-processor (stat images) write files that web serves. In split mode they're different pods with no shared disk. Options considered:

| Option | Verdict |
|---|---|
| RWX PVC shared by pods | Requires NFS/RWX storage class; reintroduces the k8s storage problem |
| S3-compatible object storage | Extra dependency for self-hosters |
| **`blobs` table in Postgres (`bytea`)** | **Chosen.** Zero extra infra, included in backups automatically, files are small (screenshots, generated PNGs). |

- New table `blobs (id, kind, owner_type, owner_id, filename, content_type, size, data bytea, created_at)`.
- `lib/storage.ts`: `putBlob()`, `getBlob()`, `deleteBlobsFor(owner)`; bot, stats-processor and `upload/event-image` use it.
- `GET /uploads/*` keeps the existing URL shape (so stored URLs and Discord embeds keep working) and is served from the table with `Cache-Control: immutable` + ETag.
- The importer copies existing `public/uploads/**` files into `blobs`.
- Add a size cap (e.g. 10 MB per blob) and include blobs in feed/match retention cleanup.

### 4.5 Phase 4 exit criteria

- [ ] `docker run -v appdata:/app/app_data ghcr.io/…/matchexec` on a **fresh** volume: initdb → migrate → all services up
- [ ] Same on a **v0.8.x volume**: SQLite auto-imported, `.db` renamed, data intact, uploads visible
- [ ] `PUID=99 PGID=100` (Unraid) works; restart and `docker stop` are clean (no recovery on next boot)
- [ ] `DATABASE_URL` set → no embedded Postgres process running
- [ ] `MATCHEXEC_SERVICES=web` → only web runs; `=bot` → only bot; etc.

---

## Phase 5: Backups

### 5.1 Automatic backups (new)

- **Job:** scheduler cron (default `0 4 * * *`, container TZ) runs `pg_dump --format=custom --compress=zstd` into `$MATCHEXEC_BACKUP_DIR/auto/matchexec-<ISO>.dump`. Written to `*.partial`, then renamed on success.
- **Retention:** keep last N daily (default 14) + optional weekly (default 4). Older ones pruned after each successful run.
- **Pre-upgrade snapshot:** the `migrate` service takes a dump to `backups/pre-upgrade/` **whenever it's about to apply pending migrations** (i.e. on version upgrade). This is the most valuable backup you can give Unraid users who auto-update.
- **Settings** (`app_settings`, new section on `/settings/backup-restore`):
  - enabled (default **on** for embedded DB, **off** for external `DATABASE_URL`, since k8s users usually have DB-level backups like CNPG/Barman)
  - schedule (cron or simple presets: daily/12h/weekly)
  - retention daily/weekly counts
  - last run time, last status, size, plus a "Back up now" button
- **Status/alerts:** failures write a feed event and log at `error`. Optionally DM/announce to an admin channel (reuse notifications).
- **k8s split mode:** backups need a writable dir. Either mount a small PVC on the scheduler pod (`backups.persistence.enabled`), or leave auto-backups off and rely on DB-native backups. The chart exposes both.

### 5.2 Manual backup and restore (rebuilt)

- **Backup** (`POST /api/settings/backup`): `pg_dump -Fc` streamed to the response. Keep the existing optional AES-256-GCM wrapper and `MEXECBAK` header. File: `matchexec-backup-<date>.dump[.enc]`.
- **Restore** (`POST /api/settings/restore`) accepts three formats, detected by magic bytes:
  - `MEXECBAK` → decrypt, then inspect the inner payload
  - `PGDMP` (pg custom dump) → `pg_restore --clean --if-exists --single-transaction --no-owner`
  - `SQLite format 3` (legacy v0.8 backups) → run through the **importer** (3.7) into a clean schema
- **Restore safety:**
  - take an automatic pre-restore dump first,
  - set `system_status.maintenance = true` → bot/scheduler/stats pause their loops (they check the flag each tick) and web returns 503 for writes,
  - restore, run migrations (backup may be from an older version), clear maintenance.
- **Backup list UI:** show auto + pre-upgrade + pre-restore backups with download / restore / delete actions.

---

## Phase 6: Kubernetes / Helm

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

- **`mode: aio`**: today's chart plus embedded Postgres. One pod, one PVC, `Recreate`. For people who want k8s without a DB operator.
- **`mode: split`**: four Deployments from the same image, `MATCHEXEC_SERVICES` set per Deployment, `MATCHEXEC_RUN_MIGRATIONS=false`, migration Job as a Helm hook. Only `web` gets a Service/Ingress/probes on `/api/health`; the others get exec probes or a tiny health port.
- **Bot and scheduler must stay at exactly 1 replica** (one Discord gateway session; cron must not double-fire). Enforce in the template (ignore `replicas` for them) and use `Recreate` so an old and a new bot never overlap. Optionally add a Postgres advisory-lock "leader" check at startup as a belt-and-braces guard.
- `web` can scale past 1: auth is stateless HMAC cookies and uploads are in Postgres. The in-memory rate limiter (`src/lib/rate-limit.ts`) becomes per-replica, which is acceptable for now; move it to Postgres later if needed.
- Docs: example CloudNativePG `Cluster` manifest + how to build `DATABASE_URL` from its generated secret. No bundled Postgres subchart.
- Keep ServiceMonitor/Grafana dashboard. Add `pg` pool metrics to `/api/metrics`.
- Migration doc for existing SQLite chart users: scale down → run the importer as a one-off Job against the old PVC → switch to `split`.

---

## Phase 7 (optional, later): improvements Postgres enables

- **`LISTEN/NOTIFY` for Discord queues**: trigger on queue-table insert → `NOTIFY discord_queue` → bot reacts instantly. Keep the 3s poll as a fallback. Same for settings reload (replaces the 30s poll).
- Move typed DTOs into a shared package consumed by both the Hono routes and the SPA via `hc<AppType>()`, if not already done in Phase 1.
- Move rate limiting to Postgres (or accept per-replica limits).
- `pg_stat_statements` in embedded mode for a "slow queries" debug page.

---

## Release plan

| Version | Contents | Risk |
|---|---|---|
| **v0.9.0** | Phase 1: Vite + Hono, still SQLite | Medium: UI/routing regressions; DB untouched |
| **v0.9.x** | Phase 2: drop legacy scoring columns (SQLite migration 027) | Low/medium |
| **v0.10.0** | Phases 3 + 4 + 5: Postgres 18, Drizzle, embedded PG, auto import, uploads to DB, auto/manual backups | **High.** Data migration. Needs a beta tag and real-user testing first. |
| **v0.10.x** | Phase 6: Helm `aio`/`split` | Medium |
| later | Phase 7 | Low |

**v0.10 rollout safeguards**
- Publish `:beta` / `:0.10.0-rc.N` tags first; ask a few Unraid users to test on a **copy** of their appdata.
- The importer never deletes the SQLite file (rename only), and a `pre-postgres` copy is made. Rollback = re-pin to `0.9.x` and rename the file back. Document this in release notes.
- Release notes + Unraid template update: new `backups/` path, `--stop-timeout`, `MATCHEXEC_SERVICES` (advanced), `DATABASE_URL` (advanced), memory expectation (~+100–150 MB for Postgres).

---

## Risks and open questions

| Risk | Mitigation |
|---|---|
| Silent behaviour changes (booleans, dates, `GROUP BY`, case-sensitive `LIKE`, ordering, API response shapes) | Decisions in 3.5 applied per domain, explicit DTO types so shape changes are compile errors, tests on both PGlite and real PG, importer verification on a real prod DB copy |
| Lost transactional guarantees from moving off single-connection serialisation | Explicit `tx` passing (3.4); review all 21 `withTransaction` sites for read-then-write races → `FOR UPDATE` / advisory locks |
| Big-bang size of Phase 3 (no incremental release possible) | Domain-by-domain rewrite order with the suite green after each domain; long-lived `:beta` tag; real-DB import testing before release |
| Orphan rows rejected by newly-enforced FKs | Importer skips + reports; consider a pre-0.10 cleanup migration on SQLite to delete known orphans |
| Unraid appdata on `/mnt/user` (FUSE/shfs) hurting Postgres performance/fsync | Recommend `/mnt/cache/appdata` in template docs (same advice as for SQLite apps) |
| Container stop timeout too short → crash recovery on boot | SIGINT fast shutdown, tuned s6 grace times, template `--stop-timeout 30`. Recovery is safe anyway, just slower. |
| Image size growth | Offset by dropping Next standalone; measure before/after |
| Future PG major upgrades | Version detection and layout built in Phase 4; dual-binary `pg_upgrade` path in that future release |
| PGlite vs real Postgres differences in tests | CI job on `postgres:18` |
| Effort | Phase 1: 77 routes rewritten as Hono routers + API tests moved to `app.request()` + 40 pages ported. Phase 3 is the bulk: ~780 call sites, 21 transaction sites, 65-table schema and the test fixtures, all rewritten in Drizzle. Expect Phase 3 to be several times the size of Phase 1. |

**Open questions for you**
1. Phase 2 (drop legacy scoring columns) before Postgres: is the scoring rewrite stable enough to retire them?
2. Auto-backup defaults: 04:00 daily, keep 14 daily + 4 weekly. OK?
3. Should restoring a **legacy `.db` backup** stay supported forever, or only for the 0.10.x line?
4. Keep PM2 for local dev, or switch dev to a simple `concurrently` script now that web is just Vite + a Node server? (PM2 still works fine; this is taste.)
