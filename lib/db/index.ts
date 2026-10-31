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
 *   postgresql:///matchexec?host=/run/postgresql   (Unix socket; see Stage 7).
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
export const EMBEDDED_DATABASE_URL = 'postgresql:///matchexec?host=/run/postgresql';

export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.NODE_ENV === 'development') return DEV_DATABASE_URL;
  throw new Error('DATABASE_URL is not set (and NODE_ENV is not "development")');
}

export function resolvePoolMax(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(env.PG_POOL_MAX ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

let poolInstance: Pool | null = null;
let dbInstance: Db | null = null;
let testDb: Db | null = null;

export function getPool(): Pool {
  poolInstance ??= new Pool({ connectionString: resolveDatabaseUrl(), max: resolvePoolMax() });
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
