import * as path from 'path';
import * as fs from 'fs';
import { Database, resetConnectionSingleton } from '../../lib/database/connection';
import { resetDbSingleton, setDbForTesting } from '../../lib/database-init';

// Use worker ID to create unique database per test worker
const workerId = process.env.VITEST_POOL_ID || '1';
const TEST_DB_PATH = path.join(process.cwd(), 'app_data', 'data', `test-matchexec-${workerId}.db`);

let wrappedDb: Database | null = null;
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

    if (cb) {
      // Callback style
      this.db.get<T>(sql, params)
        .then((row) => cb!(null, row))
        .catch((err) => cb!(err, undefined));
      return undefined as unknown as Promise<T | undefined>;
    }

    // Promise style
    return this.db.get<T>(sql, params);
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

    if (cb) {
      // Callback style
      this.db.all<T>(sql, params)
        .then((rows) => cb!(null, rows))
        .catch((err) => cb!(err, []));
      return undefined as unknown as Promise<T[]>;
    }

    // Promise style
    return this.db.all<T>(sql, params);
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

  // Inject wrappedDb into getDbInstance() so API routes use the same connection
  setDbForTesting(wrappedDb);

  // Enable WAL mode for better concurrency
  await wrappedDb.exec('PRAGMA journal_mode=WAL');
  await wrappedDb.exec('PRAGMA synchronous=NORMAL');
  // Note: Foreign key constraints are intentionally left off (SQLite default).
  // Enabling PRAGMA foreign_keys=ON reveals a pre-existing schema issue where
  // the "matches" table has a malformed FK reference to "game_maps". This should
  // be fixed in the migration schema, then FK constraints can be enabled here.

  // Run migrations
  const migrationsDir = path.join(process.cwd(), 'migrations');
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

  // Clean up all test databases for this worker (including WAL/SHM companion files)
  for (const filePath of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { }
    }
  }

  // Also clean up any other worker databases (in case of cleanup from main process)
  const dataDir = path.join(process.cwd(), 'app_data', 'data');
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      if (file.startsWith('test-matchexec-') && file.endsWith('.db')) {
        const dbPath = path.join(dataDir, file);
        for (const filePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
          try { fs.unlinkSync(filePath); } catch { }
        }
      }
    }
  }
}

export function getTestDb(): TestDatabase {
  if (!testDbWrapper) throw new Error('Test database not initialized');
  return testDbWrapper;
}
