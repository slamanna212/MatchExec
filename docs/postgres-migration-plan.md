# PostgreSQL Migration Plan

**Rationale**: SQLite serializes all writes through a single lock. Once players are actively using the app alongside the Discord bot and scheduler writing queue entries simultaneously, you will hit lock contention and timeouts. PostgreSQL handles concurrent connections and parallel writes natively, making it the correct choice for a multi-user deployment.

**Scope**: 14 migration files, 48 tables, 62 API routes, 3 processes (web, discord-bot, scheduler), Docker infrastructure.

**Approach**: Swap the database driver and rewrite the connection wrapper to keep the same `.all()` / `.get()` / `.run()` / `.exec()` interface that all 62 API routes already use. This limits changes to the connection layer and SQL dialect — not a full rewrite of every route.

---

## Pre-flight Checklist

Before starting, confirm these are available:

- [ ] A PostgreSQL 15+ instance (local Docker, Railway, Supabase, Neon, or self-hosted)
- [ ] `DATABASE_URL` connection string in the format `postgresql://user:password@host:5432/dbname`
- [ ] Node.js 18+ (already satisfied)
- [ ] A full backup of the existing SQLite database (`./app_data/data/matchexec.db`)

---

## Phase 1 — Infrastructure

### 1.1 Add Postgres to Docker Compose

Create `docker-compose.yml` for local development and CI:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: matchexec
      POSTGRES_PASSWORD: matchexec
      POSTGRES_DB: matchexec
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U matchexec"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://matchexec:matchexec@db:5432/matchexec
    depends_on:
      db:
        condition: service_healthy

volumes:
  postgres_data:
```

For production, point `DATABASE_URL` at a managed Postgres instance instead of the `db` service.

### 1.2 Environment Variables

Add to `.env.example` and update all deployment docs:

```
# Replace DATABASE_PATH (SQLite) with:
DATABASE_URL=postgresql://user:password@localhost:5432/matchexec

# Optional: connection pool size (default 10)
DATABASE_POOL_MAX=10
DATABASE_POOL_MIN=2
DATABASE_POOL_IDLE_TIMEOUT_MS=30000
```

Remove `DATABASE_PATH` references everywhere.

### 1.3 Update s6-overlay for Docker

The `db-migrator` oneshot service currently just runs migrations. Add a readiness wait for Postgres before running migrations:

In `s6-overlay/s6-rc.d/db-migrator/run`, prepend a loop that waits for the database to accept connections before calling `npm run migrate`. Example using `pg_isready` or a small Node script.

---

## Phase 2 — Swap the Database Driver

### 2.1 Update `package.json` Dependencies

```bash
npm remove sqlite3
npm install pg pg-pool
npm install --save-dev @types/pg
```

Also remove from `PROCESS_DEPS` in `scripts/collect-process-deps.mjs`:
- Remove `sqlite3`
- Add `pg` and `pg-pool`

Update `esbuild.discord-bot.config.mjs` and `esbuild.scheduler.config.mjs`:
- Remove `sqlite3` from `external`
- Add `pg` and `pg-pool` to `external`

### 2.2 Rewrite `lib/database/connection.ts`

The existing wrapper exposes `.all()`, `.get()`, `.run()`, `.exec()` — keep this interface exactly so no API routes need to change their call signatures.

Replace the `sqlite3`-based implementation with a `pg.Pool`-based one:

```typescript
import { Pool, PoolClient } from 'pg';

export class Database {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: parseInt(process.env.DATABASE_POOL_MAX ?? '10'),
      min: parseInt(process.env.DATABASE_POOL_MIN ?? '2'),
      idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS ?? '30000'),
    });
  }

  // Returns all rows
  async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  // Returns first row or undefined
  async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.pool.query(sql, params);
    return result.rows[0] as T | undefined;
  }

  // Returns { lastID, changes } to match existing sqlite3 interface
  async run(sql: string, params: unknown[] = []): Promise<{ lastID: number | null; changes: number }> {
    // Append RETURNING id if it's an INSERT and doesn't already have RETURNING
    const isInsert = /^\s*INSERT/i.test(sql);
    const hasReturning = /RETURNING/i.test(sql);
    const querySql = isInsert && !hasReturning ? `${sql} RETURNING id` : sql;

    const result = await this.pool.query(querySql, params);
    return {
      lastID: isInsert && result.rows[0]?.id != null ? result.rows[0].id : null,
      changes: result.rowCount ?? 0,
    };
  }

  // Executes raw SQL (used for migrations)
  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
```

> **Note on `lastID`**: The auto-RETURNING approach works for simple INSERTs. For INSERT statements that explicitly use `RETURNING` in queries across the codebase, no change is needed. Audit all callers of `.run()` that read `.lastID` and verify the INSERT has a primary key column named `id` (all tables do).

### 2.3 Update `lib/database-init.ts`

Change the constructor call from accepting a file path to accepting `DATABASE_URL`:

```typescript
// Before
const db = new Database(process.env.DATABASE_PATH ?? './app_data/data/matchexec.db');

// After
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL environment variable is required');
const db = new Database(connectionString);
```

### 2.4 Rewrite the Umzug Storage in `lib/database/migrations.ts`

The current `SQLiteStorage` class reads/writes the `migrations` table using sqlite3. Replace it with a `PostgreSQLStorage` class that uses the same `pg.Pool` connection. The interface is the same — `logMigration`, `unlogMigration`, `executed` — only the SQL dialect changes (already Postgres-compatible basic SQL).

---

## Phase 3 — Rewrite All 14 Migration Files

Each `.sql` file must be rewritten for PostgreSQL syntax. Create new versions replacing the SQLite originals.

### SQL Syntax Conversion Reference

| SQLite | PostgreSQL |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGSERIAL PRIMARY KEY` |
| `INTEGER PRIMARY KEY` (without AUTOINCREMENT) | `INTEGER PRIMARY KEY` (keep as-is, or use `GENERATED ALWAYS AS IDENTITY`) |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMPTZ DEFAULT NOW()` |
| `datetime('now')` | `NOW()` |
| `datetime('now', '+5 minutes')` | `NOW() + INTERVAL '5 minutes'` |
| `datetime('now', '-7 days')` | `NOW() - INTERVAL '7 days'` |
| `datetime(field, '+2 minutes') < datetime('now')` | `field + INTERVAL '2 minutes' < NOW()` |
| `strftime('%Y-%m-%d', field)` | `TO_CHAR(field, 'YYYY-MM-DD')` |
| `last_insert_rowid()` | Use `RETURNING id` |
| `INTEGER` used as boolean (0/1) | `BOOLEAN` with `TRUE`/`FALSE` defaults |
| `TEXT CHECK(col IN (...))` | `TEXT CHECK(col IN (...))` (same) |
| `BLOB` | `BYTEA` |
| Trigger: `CREATE TRIGGER ... BEGIN ... END;` | Different syntax — see below |
| `PRAGMA foreign_keys = ON` | Remove (Postgres enforces FKs by default) |
| `PRAGMA journal_mode=WAL` | Remove (not applicable) |
| `PRAGMA busy_timeout=5000` | Remove (use pool config instead) |
| `PRAGMA table_info(...)` | `information_schema.columns` |

### Trigger Syntax Conversion

SQLite triggers use inline `BEGIN...END`. PostgreSQL requires a trigger function:

```sql
-- SQLite (example: updated_at trigger)
CREATE TRIGGER update_matches_timestamp
AFTER UPDATE ON matches
BEGIN
  UPDATE matches SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- PostgreSQL equivalent
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_matches_timestamp
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

Define `update_timestamp()` once in `001_core_schema_and_matches.sql` and reference it in all subsequent migrations. This replaces the 8+ individual triggers across migrations 003 and 004.

### Per-File Migration Changes

#### `001_core_schema_and_matches.sql`
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL PRIMARY KEY` (migrations table)
- All `DATETIME DEFAULT CURRENT_TIMESTAMP` → `TIMESTAMPTZ DEFAULT NOW()`
- `INTEGER` boolean columns (e.g., `is_active`, `is_team_match`) → `BOOLEAN DEFAULT FALSE/TRUE`
- Add `update_timestamp()` trigger function definition here

#### `002_discord_integration.sql`
- Same `DATETIME` → `TIMESTAMPTZ` conversions
- All `datetime('now')` in DEFAULT values → `NOW()`
- `INTEGER` boolean columns → `BOOLEAN`
- Remove any SQLite-only index syntax if present

#### `003_settings_and_triggers.sql`
- Rewrite all 8 `CREATE TRIGGER` blocks using the PostgreSQL trigger function pattern
- `DATETIME` → `TIMESTAMPTZ`
- Boolean columns → `BOOLEAN`

#### `004_fix_voice_alternation.sql`
- `updated_at DATETIME DEFAULT CURRENT_TIMESTAMP` → `TIMESTAMPTZ DEFAULT NOW()`
- Rewrite the compatibility trigger in PostgreSQL syntax

#### `005_tournaments.sql`
- `DATETIME` → `TIMESTAMPTZ`
- `INTEGER` boolean columns → `BOOLEAN`
- Foreign key syntax is already standard SQL — no changes needed
- `ALTER TABLE matches ADD COLUMN tournament_id INTEGER` — verify FK reference works on Postgres (should be fine)

#### `006_position_scoring.sql`
- `DATETIME` → `TIMESTAMPTZ` on any new columns
- Boolean defaults

#### `007_v0_6.sql`
- `INTEGER PRIMARY KEY AUTOINCREMENT` on `health_alerts_sent` → `BIGSERIAL PRIMARY KEY`
- `DATETIME` → `TIMESTAMPTZ`
- The `DROP TABLE` + `CREATE TABLE` recreations for `discord_bot_requests` and `discord_voice_announcement_queue` are fine to keep — just update the CREATE TABLE syntax
- Boolean columns → `BOOLEAN`

#### `008_ui_updates.sql`
- `DATETIME` → `TIMESTAMPTZ`
- `avatar_url TEXT`, `last_avatar_check DATETIME` → `TIMESTAMPTZ`
- Boolean defaults

#### `009_update_071.sql`
- `scheduled_for DATETIME` → `TIMESTAMPTZ`
- Index creation syntax is standard — no changes

#### `010_map_tournament_enabled.sql`
- `tournament_enabled INTEGER DEFAULT 1` → `tournament_enabled BOOLEAN DEFAULT TRUE`

#### `011_team_captain.sql`
- `is_captain INTEGER DEFAULT 0` → `is_captain BOOLEAN DEFAULT FALSE`

#### `012_scorecard_stats.sql` *(largest migration)*
- All `DATETIME` columns → `TIMESTAMPTZ`
- All `INTEGER` boolean columns → `BOOLEAN`
- `TEXT DEFAULT 'pending'` CHECK constraints — same syntax, verify all status values
- Any `last_insert_rowid()` references → remove (use RETURNING in application layer)
- Triggers for `updated_at` → PostgreSQL function-based triggers

#### `013_performance_indexes.sql`
- Index creation syntax is standard SQL — likely no changes needed
- Verify index names don't conflict with Postgres reserved words

#### `014_discord_improvements.sql`
- `DROP TABLE` + `CREATE TABLE` for `discord_map_code_queue` — update CREATE TABLE syntax
- `INTEGER DEFAULT 0` boolean columns → `BOOLEAN DEFAULT FALSE`
- `DATETIME` → `TIMESTAMPTZ`

---

## Phase 4 — Application Code SQL Dialect Fixes

These changes are in TypeScript/JavaScript files, not migration SQL files.

### 4.1 `datetime()` Replacements (High Volume — ~100+ occurrences)

The heaviest concentration is in:
- `processes/discord-bot/modules/queue-processor.ts` (~60+ uses)
- `processes/scheduler/index.ts` (~10+ uses)
- Various `src/app/api/` routes

**Find all occurrences:**
```bash
grep -rn "datetime(" processes/ src/ --include="*.ts" | wc -l
grep -rn "datetime(" processes/ src/ --include="*.ts"
```

**Replacements to make:**

```sql
-- Timestamp update
updated_at = datetime('now')
→ updated_at = NOW()

-- Simple now reference
WHERE created_at > datetime('now', '-1 hour')
→ WHERE created_at > NOW() - INTERVAL '1 hour'

-- Scheduled check
WHERE datetime(scheduled_for) <= datetime('now')
→ WHERE scheduled_for <= NOW()

-- Relative future check
WHERE datetime(reminder_time, '+5 minutes') > datetime('now')
→ WHERE reminder_time + INTERVAL '5 minutes' > NOW()
```

Write a sed/find-replace pass for the common patterns, then manually verify edge cases.

### 4.2 Boolean Column Handling

SQLite stores booleans as 0/1 integers. Postgres uses true/false. After converting columns to `BOOLEAN`, update all TypeScript code that does:

```typescript
// Before (SQLite returns 0 or 1)
if (row.is_active === 1) { ... }
if (row.tournament_enabled) { ... }  // this one already works

// After (Postgres returns true/false)
if (row.is_active) { ... }
```

**Find all integer-boolean comparisons:**
```bash
grep -rn "=== 1\|=== 0\|== 1\|== 0" src/ processes/ --include="*.ts"
```

Also check INSERT/UPDATE statements that set booleans:
```sql
-- Before
INSERT INTO ... (is_active) VALUES (1)
-- After
INSERT INTO ... (is_active) VALUES (TRUE)
```

### 4.3 Parameter Placeholder Syntax

SQLite uses `?` for parameters. PostgreSQL uses `$1`, `$2`, `$3`, etc.

This is the most mechanical but highest-volume change. **Every parameterized query** must be updated.

```sql
-- Before (SQLite)
SELECT * FROM matches WHERE id = ? AND status = ?

-- After (PostgreSQL)
SELECT * FROM matches WHERE id = $1 AND status = $2
```

**Strategy**: Write a utility function or regex to auto-number `?` placeholders, run it across all source files, then manually audit complex cases (subqueries, CTEs with parameters).

A Node.js one-liner to convert in a file:
```javascript
// Converts ? to $1, $2, $3... in a SQL string
function toPostgresParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
```

**Files to update** (all that contain parameterized SQL):
- All 62 files under `src/app/api/`
- `processes/discord-bot/modules/queue-processor.ts`
- `processes/discord-bot/modules/announcement-handler.ts`
- `processes/discord-bot/modules/reminder-handler.ts`
- `processes/scheduler/index.ts`
- Any shared utility files in `src/lib/`

### 4.4 `last_insert_rowid()` Removal

Search for any remaining `last_insert_rowid()` calls in TypeScript:
```bash
grep -rn "last_insert_rowid" src/ processes/ --include="*.ts"
```

These should be replaced by reading `result.lastID` from the `.run()` wrapper (which now appends `RETURNING id` automatically).

### 4.5 PRAGMA Removals

Remove all `PRAGMA` statements from application code (they're already isolated to `lib/database/connection.ts` and a few scripts):

```bash
grep -rn "PRAGMA" src/ processes/ lib/ --include="*.ts"
```

Replace connection-level settings with pg Pool configuration (already handled in Phase 2).

---

## Phase 5 — Utility Scripts

The scripts in `/scripts/` use sqlite3 directly and are not part of the running application — they're one-off maintenance tools.

- `scripts/add-test-participants.js` — update to use pg
- `scripts/add-test-match-participants.js` — update to use pg
- `scripts/fix-discord-bot-requests-schema.js` — likely obsolete after migration
- `scripts/add-tournament-signup-config.js` — update `PRAGMA table_info` to `information_schema.columns`

These can be updated as needed after the main migration, since they're not on the critical path.

---

## Phase 6 — Test Suite Updates

### 6.1 Database Test Utilities

`tests/utils/test-db.ts` creates an in-memory SQLite database for tests. Replace with a test Postgres database (or use `pg-mem` for in-memory Postgres emulation):

**Option A (recommended)**: Use a real Postgres test database
- Set `DATABASE_URL` to a test database in CI (e.g., `postgresql://localhost:5432/matchexec_test`)
- Add a `beforeAll` that truncates all tables, `afterAll` that drops test data

**Option B**: Use `pg-mem` package for in-memory Postgres
```bash
npm install --save-dev pg-mem
```
This avoids needing a real Postgres server for unit tests but has incomplete SQL coverage.

### 6.2 Update `tests/vitest-mocks.ts` and `tests/setup.ts`

Remove any sqlite3-specific mock setup. Update `getMockDbInstance()` in `tests/mocks/database.ts`.

### 6.3 Fix the Known FK Issue

The CLAUDE.md notes a malformed FK on the `matches` table pointing to `game_maps`. When rewriting migration 001 for Postgres, fix this FK correctly. Postgres enforces FKs by default (unlike SQLite), so this must be resolved before tests will pass.

Enable FK verification in the test suite:
```sql
-- SQLite (currently commented out in tests due to the bug)
PRAGMA foreign_keys = ON;

-- Postgres (on by default, no action needed)
```

### 6.4 Run the Full Test Suite

```bash
DATABASE_URL=postgresql://localhost:5432/matchexec_test npm run test
```

Expect failures on the ~48 known DB isolation tests — these existed before the migration. Focus on fixing any new failures introduced by the Postgres conversion.

---

## Phase 7 — Docker Updates

### 7.1 Remove SQLite from Dockerfile

- Remove the `sqlite3` build dependencies (`python3`, `make`, `g++` for native compilation) from the build stage — **only if** no other native module still needs them. Check `PROCESS_DEPS` and esbuild externals.
- Remove the `app_data/data/` volume mount for the SQLite file
- Add `DATABASE_URL` as a required environment variable

### 7.2 s6-overlay: Wait for Postgres

Update the `db-migrator` service to wait for Postgres to be ready before running migrations. Add a small readiness check script:

```bash
#!/bin/sh
# /app/scripts/wait-for-postgres.sh
until pg_isready -h "$PGHOST" -p "${PGPORT:-5432}" -U "$PGUSER"; do
  echo "Waiting for Postgres..."
  sleep 2
done
```

Or implement the wait in Node.js within `migrate-background.ts` by attempting a connection with retries before running umzug.

### 7.3 Update Health Check

The Dockerfile health check (`curl -f http://localhost:3000/api/health`) is fine. Verify that `/api/health` route also checks Postgres connectivity, not a SQLite file existence.

---

## Phase 8 — Data Migration (Existing Data)

If you need to migrate existing data from the SQLite database to Postgres:

1. Export SQLite data:
```bash
sqlite3 ./app_data/data/matchexec.db .dump > sqlite_dump.sql
```

2. The dump will be SQLite SQL — it cannot be imported directly into Postgres. Use one of:
   - **pgloader**: Dedicated tool that reads SQLite and writes to Postgres directly
     ```bash
     pgloader sqlite:///path/to/matchexec.db postgresql://user:pass@localhost/matchexec
     ```
   - **Manual export**: Export as CSV per table and import with `COPY`

3. After import, run a row count comparison across all 48 tables to verify completeness.

4. Reset sequences (Postgres auto-increment counters) after bulk import:
```sql
SELECT setval('matches_id_seq', (SELECT MAX(id) FROM matches));
-- Repeat for every BIGSERIAL/SERIAL column
```

---

## Execution Order Summary

1. [ ] **Phase 1** — Set up Postgres instance, create `DATABASE_URL`, add Docker Compose
2. [ ] **Phase 2** — Swap `sqlite3` for `pg`/`pg-pool`, rewrite connection wrapper, update umzug storage
3. [ ] **Phase 3** — Rewrite all 14 migration files for Postgres syntax
4. [ ] **Phase 4.3** — Convert `?` placeholders to `$1`/`$2`/... (highest volume, do first in Phase 4)
5. [ ] **Phase 4.1** — Replace `datetime()` calls with Postgres equivalents
6. [ ] **Phase 4.2** — Fix boolean column comparisons in TypeScript
7. [ ] **Phase 4.4** — Remove `last_insert_rowid()` references
8. [ ] **Phase 4.5** — Remove PRAGMA statements
9. [ ] **Phase 5** — Update utility scripts
10. [ ] **Phase 6** — Update test suite
11. [ ] **Phase 7** — Update Docker/s6-overlay
12. [ ] **Phase 8** — Migrate existing data (if needed)

---

## Estimated Effort

| Phase | Effort | Notes |
|---|---|---|
| Infrastructure setup | 1–2 hours | Mostly config files |
| Driver swap + connection rewrite | 2–3 hours | High-impact, surgical |
| 14 migration file rewrites | 4–6 hours | Systematic, repeatable |
| `?` → `$N` placeholder conversion | 3–5 hours | High volume, semi-automatable |
| `datetime()` replacements | 2–4 hours | ~100 occurrences |
| Boolean comparison fixes | 1–2 hours | Grep-and-fix |
| Test suite updates | 2–4 hours | Depends on pg-mem vs real DB choice |
| Docker updates | 1–2 hours | Mostly s6-overlay and Dockerfile |
| Data migration | 1–3 hours | Depends on data volume |
| **Total** | **~17–31 hours** | Spread across multiple sessions |

---

## Notes

- **No Prisma**: This plan deliberately avoids Prisma to minimize rewrite scope. The existing raw SQL + wrapper pattern is preserved. Prisma would require rewriting all 62 API routes' query logic — roughly tripling the total effort. Reconsider Prisma only if a full ORM rewrite is desired as a separate project.
- **Connection pooling**: `pg-pool` is included in the `pg` package. The pool handles the concurrent connection problem that SQLite cannot.
- **Transactions**: Audit any code that calls `.exec('BEGIN')` or `.exec('COMMIT')` directly — these work the same in Postgres but verify they're not nested unexpectedly.
- **Case sensitivity**: Postgres identifiers are case-sensitive when quoted. Since all table/column names in this codebase are lowercase with underscores, this should not be an issue.
- **JSON columns**: Any `TEXT` columns storing JSON (check `match_games.results`, `scoring_config`, etc.) can optionally be converted to `JSONB` for better query performance, but this is an enhancement, not a requirement.
