/**
 * Postgres access for every MatchExec process (web, bot, scheduler, stats, migrate).
 *
 * - `db` is a lazy handle: importing this module never opens a connection or reads DATABASE_URL, so unit
 *   tests that never touch the database (or inject PGlite via `setDbForTesting`) work without any env.
 * - Column names are written explicitly (snake_case) in `schema/*.ts`; the Drizzle `casing` option is NOT used,
 *   so any driver (node-postgres, PGlite) can be wrapped with just `{ schema }`.
 *
 * Connection string:
 *   DATABASE_URL set            -> use it (external Postgres, k8s).
 *   unset + NODE_ENV=development -> postgres://matchexec:matchexec@127.0.0.1:5432/matchexec (compose.dev.yml).
 *   unset otherwise             -> error on first use.
 * In the all-in-one image the s6 setup exports DATABASE_URL for the embedded server as
 *   postgresql://abc@/matchexec?host=/run/postgresql   (Unix socket; the user must be explicit, the s6 services have no $USER).
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema';

export { schema };

export type Schema = typeof schema;
/** Driver-agnostic Drizzle database: satisfied by node-postgres (prod) and PGlite (tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
/** Transaction handle passed to `db.transaction(async (tx) => ...)`. */
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Anything that can run queries: pass this to domain functions so they work inside or outside a transaction. */
export type Executor = Db | Tx;

export const DEV_DATABASE_URL = 'postgres://matchexec:matchexec@127.0.0.1:5432/matchexec';
/** Connection string the embedded-Postgres image uses (documented here; exported by the s6 service). */
export const EMBEDDED_DATABASE_URL = 'postgresql://abc@/matchexec?host=/run/postgresql';

export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.NODE_ENV === 'development') return DEV_DATABASE_URL;
  throw new Error('DATABASE_URL is not set (and NODE_ENV is not "development")');
}

/** Pool size when PG_POOL_MAX is unset. The web server keeps 10; workers lower it with `setDefaultPoolMax` (see below). */
let defaultPoolMax = 10;

/**
 * Default pool size for this process, used when PG_POOL_MAX is not set. Call before the first query. The background
 * workers need only a few connections each (web 10 + bot 5 + scheduler 4 + stats 3 = 22), which leaves room under the
 * embedded server's PG_MAX_CONNECTIONS=50 for pg_dump, restores and the migrator.
 */
export function setDefaultPoolMax(n: number): void {
  if (Number.isFinite(n) && n > 0) defaultPoolMax = Math.floor(n);
}

export function resolvePoolMax(env: Record<string, string | undefined> = process.env, fallback = defaultPoolMax): number {
  const n = Number.parseInt(env.PG_POOL_MAX ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function msFromEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface PoolTimeouts {
  /** Server-side cap per statement (`statement_timeout`); 0 = none. PG_STATEMENT_TIMEOUT_MS, default 5 min. */
  statementTimeoutMs: number;
  /** Kill a session left idle inside a transaction (`idle_in_transaction_session_timeout`). PG_IDLE_TX_TIMEOUT_MS, default 10 min. */
  idleInTransactionTimeoutMs: number;
  /** Give up waiting for a free pool connection (or a new one) after this long instead of hanging. PG_CONNECT_TIMEOUT_MS, default 15 s. */
  connectionTimeoutMs: number;
  /** Close pooled connections idle this long. PG_IDLE_TIMEOUT_MS, default 30 s. */
  idleTimeoutMs: number;
}

let timeoutOverrides: Partial<PoolTimeouts> = {};

/** Per-process overrides of the timeout defaults (the migrator disables the statement timeout: it waits on a lock). Call before the first query. */
export function setPoolTimeoutDefaults(overrides: Partial<PoolTimeouts>): void {
  timeoutOverrides = { ...timeoutOverrides, ...overrides };
}

/**
 * Generous ceilings that only stop runaway work: a query stuck on a lock, a transaction a crashed handler never closed, or
 * a request that would otherwise wait forever on an exhausted pool. Env vars win over per-process defaults.
 */
export function resolvePoolTimeouts(env: Record<string, string | undefined> = process.env): PoolTimeouts {
  const d: PoolTimeouts = { statementTimeoutMs: 300_000, idleInTransactionTimeoutMs: 600_000, connectionTimeoutMs: 15_000, idleTimeoutMs: 30_000, ...timeoutOverrides };
  return {
    statementTimeoutMs: msFromEnv(env.PG_STATEMENT_TIMEOUT_MS, d.statementTimeoutMs),
    idleInTransactionTimeoutMs: msFromEnv(env.PG_IDLE_TX_TIMEOUT_MS, d.idleInTransactionTimeoutMs),
    connectionTimeoutMs: msFromEnv(env.PG_CONNECT_TIMEOUT_MS, d.connectionTimeoutMs),
    idleTimeoutMs: msFromEnv(env.PG_IDLE_TIMEOUT_MS, d.idleTimeoutMs),
  };
}

let poolInstance: Pool | null = null;
let dbInstance: Db | null = null;
let testDb: Db | null = null;

export function getPool(): Pool {
  if (!poolInstance) {
    const t = resolvePoolTimeouts();
    poolInstance = new Pool({
      connectionString: resolveDatabaseUrl(),
      max: resolvePoolMax(),
      connectionTimeoutMillis: t.connectionTimeoutMs,
      idleTimeoutMillis: t.idleTimeoutMs,
      // 0 leaves the server default (no limit)
      ...(t.statementTimeoutMs > 0 ? { statement_timeout: t.statementTimeoutMs } : {}),
      ...(t.idleInTransactionTimeoutMs > 0 ? { idle_in_transaction_session_timeout: t.idleInTransactionTimeoutMs } : {}),
    });
  }
  return poolInstance;
}

export function getDb(): Db {
  if (testDb) return testDb;
  dbInstance ??= drizzle(getPool(), { schema }) as unknown as Db;
  return dbInstance;
}

/** Lazy `db`: every property access resolves the real instance (test override first). */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

/** Inject a PGlite-backed (or any) Drizzle instance; `db`/`getDb()` return it until `resetDb()`. */
export function setDbForTesting(testInstance: Db): void {
  testDb = testInstance;
}

/** Clear the test override and close the real pool (if one was opened). */
export async function resetDb(): Promise<void> {
  testDb = null;
  dbInstance = null;
  if (poolInstance) {
    const p = poolInstance;
    poolInstance = null;
    await p.end();
  }
}

/** Close the pool at process shutdown. */
export const closeDb = resetDb;
