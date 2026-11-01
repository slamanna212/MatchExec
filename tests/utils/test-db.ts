import * as path from 'path';
import * as fs from 'fs';
import { Database, resetConnectionSingleton } from '../../lib/database/connection';
import { resetDbSingleton, setDbForTesting } from '../../lib/database-init';

// Use worker ID to create unique database per test worker
const workerId = process.env.VITEST_POOL_ID || '1';
const TEST_DB_PATH = path.join(process.cwd(), 'app_data', 'data', `test-matchexec-${workerId}.db`);

let wrappedDb: Database | null = null;

/**
 * TRANSITIONAL (see tests/utils/legacy-pg-bridge.ts): runs before every read through `getTestDb()` so rows that the
 * code under test wrote to the Postgres queue tables are visible to legacy assertions like
 * `SELECT * FROM discord_announcement_queue`. Removed together with the bridge.
 */
type ReadHook = (sql: string) => Promise<void>;
let readHook: ReadHook | null = null;
/** Count of SQLite writes through the wrapper; lets the legacy PG bridge skip re-reading unchanged tables. */
let writeCount = 0;
export function getLegacyWriteCount(): number {
  return writeCount;
}
export function setLegacyReadHook(hook: ReadHook | null): void {
  readHook = hook;
}
let testDbWrapper: TestDatabase | null = null;

/**
 * Callback types for sqlite3-style API
 */
type RunCallback = (err: Error | null) => void;
type GetCallback<T> = (err: Error | null, row: T | undefined) => void;
type AllCallback<T> = (err: Error | null, rows: T[]) => void;

/**
 * TestDatabase wrapper that supports BOTH promise-based and callback-based APIs.
 * This allows tests to use either style:
 *
 * Promise style (recommended):
 *   await db.run('INSERT ...', [params]);
 *   const row = await db.get('SELECT ...', [params]);
 *
 * Callback style (legacy sqlite3 compatibility):
 *   db.run('INSERT ...', [params], (err) => { ... });
 *   db.get('SELECT ...', [params], (err, row) => { ... });
 */
export class TestDatabase {
  constructor(private db: Database) {}

  /**
   * Run a SQL statement (INSERT, UPDATE, DELETE)
   * Supports both promise and callback styles
   */
  // Overload signatures for TypeScript
  run(sql: string): Promise<{ lastID?: number; changes?: number }>;
  run(sql: string, params: unknown[]): Promise<{ lastID?: number; changes?: number }>;
  run(sql: string, callback: RunCallback): void;
  run(sql: string, params: unknown[], callback: RunCallback): void;
  // Implementation
  run(sql: string, paramsOrCallback?: unknown[] | RunCallback, callback?: RunCallback): Promise<{ lastID?: number; changes?: number }> | void {
    let params: unknown[] = [];
    let cb: RunCallback | undefined;

    if (typeof paramsOrCallback === 'function') {
      cb = paramsOrCallback;
    } else if (Array.isArray(paramsOrCallback)) {
      params = paramsOrCallback;
      cb = callback;
    }

    if (cb) {
      // Callback style
      this.db.run(sql, params)
        .then(() => cb!(null))
        .catch((err) => cb!(err));
      return undefined as unknown as Promise<{ lastID?: number; changes?: number }>;
    }

    // Promise style
    return this.db.run(sql, params);
  }

  /**
   * Get a single row
   * Supports both promise and callback styles
   */
  // Overload signatures
  get<T = unknown>(sql: string): Promise<T | undefined>;
  get<T = unknown>(sql: string, params: unknown[]): Promise<T | undefined>;
  get<T = unknown>(sql: string, callback: GetCallback<T>): void;
  get<T = unknown>(sql: string, params: unknown[], callback: GetCallback<T>): void;
  // Implementation
  get<T = unknown>(sql: string, paramsOrCallback?: unknown[] | GetCallback<T>, callback?: GetCallback<T>): Promise<T | undefined> | void {
    let params: unknown[] = [];
    let cb: GetCallback<T> | undefined;

    if (typeof paramsOrCallback === 'function') {
      cb = paramsOrCallback as GetCallback<T>;
    } else if (Array.isArray(paramsOrCallback)) {
      params = paramsOrCallback;
      cb = callback;
    }

    const run = async () => {
      return this.db.get<T>(sql, params);
    };

    if (cb) {
      // Callback style
      run()
        .then((row) => cb!(null, row))
        .catch((err) => cb!(err, undefined));
      return undefined as unknown as Promise<T | undefined>;
    }

    // Promise style
    return run();
  }

  /**
   * Get all matching rows
   * Supports both promise and callback styles
   */
  // Overload signatures
  all<T = unknown>(sql: string): Promise<T[]>;
  all<T = unknown>(sql: string, params: unknown[]): Promise<T[]>;
  all<T = unknown>(sql: string, callback: AllCallback<T>): void;
  all<T = unknown>(sql: string, params: unknown[], callback: AllCallback<T>): void;
  // Implementation
  all<T = unknown>(sql: string, paramsOrCallback?: unknown[] | AllCallback<T>, callback?: AllCallback<T>): Promise<T[]> | void {
    let params: unknown[] = [];
    let cb: AllCallback<T> | undefined;

    if (typeof paramsOrCallback === 'function') {
      cb = paramsOrCallback as AllCallback<T>;
    } else if (Array.isArray(paramsOrCallback)) {
      params = paramsOrCallback;
      cb = callback;
    }

    const run = async () => {
      return this.db.all<T>(sql, params);
    };

    if (cb) {
      // Callback style
      run()
        .then((rows) => cb!(null, rows))
        .catch((err) => cb!(err, []));
      return undefined as unknown as Promise<T[]>;
    }

    // Promise style
    return run();
  }

  /**
   * Execute raw SQL (for multiple statements, schema changes, etc.)
   */
  exec(sql: string): Promise<void> {
    return this.db.exec(sql);
  }

  /**
   * Close the database connection
   */
  close(): Promise<void> {
    return this.db.close();
  }

  /**
   * Connect to the database
   */
  connect(): Promise<void> {
    return this.db.connect();
  }
}

export async function setupTestDatabase(): Promise<TestDatabase> {
  // Ensure directory exists first
  const dbDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Close existing connection if any
  if (wrappedDb) {
    try {
      await wrappedDb.close();
    } catch {
      // Ignore errors when closing
    }
    wrappedDb = null;
    testDbWrapper = null;
  }

  // Remove existing test database files (including WAL/SHM companion files)
  const dbFilesToRemove = [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`];
  for (const filePath of dbFilesToRemove) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }

  // Set environment variable so app code uses test database
  process.env.DATABASE_PATH = TEST_DB_PATH;
  // Note: NODE_ENV is handled by vitest automatically

  // Force DB singletons to reconnect with the new test database path
  resetConnectionSingleton();
  resetDbSingleton();

  // Create Database wrapper and connect
  wrappedDb = new Database(TEST_DB_PATH);
  await wrappedDb.connect();
  // Count every write (fixtures AND application code share this connection) for the legacy PG bridge.
  const counted = wrappedDb;
  for (const method of ['run', 'exec'] as const) {
    const original = counted[method].bind(counted) as (...args: unknown[]) => unknown;
    (counted as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => { writeCount++; return original(...args); };
  }
  // Reads (from fixtures/assertions AND application code, which share this connection) first let the legacy PG bridge
  // copy Postgres-side changes into SQLite.
  for (const method of ['get', 'all'] as const) {
    const original = counted[method].bind(counted) as (...args: unknown[]) => Promise<unknown>;
    (counted as unknown as Record<string, unknown>)[method] = async (sql: string, ...rest: unknown[]) => {
      if (readHook && typeof sql === 'string') await readHook(sql);
      return original(sql, ...rest);
    };
  }

  // Inject wrappedDb into getDbInstance() so API routes use the same connection
  setDbForTesting(wrappedDb);

  // Enable WAL mode for better concurrency
  await wrappedDb.exec('PRAGMA journal_mode=WAL');
  await wrappedDb.exec('PRAGMA synchronous=NORMAL');
  // Note: Foreign key constraints are left off (SQLite default).
  // The schema issue with matches.map_id referencing game_maps was fixed in migration 018.

  // Run migrations
  const migrationsDir = path.join(process.cwd(), 'migrations', 'legacy-sqlite');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await wrappedDb.exec(sql);
  }

  // Create and return the test wrapper
  testDbWrapper = new TestDatabase(wrappedDb);
  return testDbWrapper;
}

export async function resetTestDatabase(): Promise<void> {
  if (!wrappedDb) return;

  // Get all table names except migrations
  const tables = await wrappedDb.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
  );

  // Delete data from all tables
  for (const table of tables) {
    await wrappedDb.exec(`DELETE FROM ${table.name}`);
  }

}

export async function teardownTestDatabase(): Promise<void> {
  if (wrappedDb) {
    await wrappedDb.close();
    wrappedDb = null;
    testDbWrapper = null;
  }

  // Clean up only this worker's database files (WAL/SHM companion files included).
  // Do NOT delete other workers' databases — they may still be running in parallel.
  for (const filePath of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { }
    }
  }
}

export function getTestDb(): TestDatabase {
  if (!testDbWrapper) throw new Error('Test database not initialized');
  return testDbWrapper;
}
