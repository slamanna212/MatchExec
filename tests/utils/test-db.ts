import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Use worker ID to create unique database per test worker
const workerId = process.env.VITEST_POOL_ID || '1';
const TEST_DB_PATH = path.join(process.cwd(), 'app_data', 'data', `test-matchexec-${workerId}.db`);

let testDb: sqlite3.Database | null = null;

export async function setupTestDatabase(): Promise<sqlite3.Database> {
  // Ensure directory exists first
  const dbDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Close existing connection if any
  if (testDb) {
    try {
      await new Promise<void>((resolve) => {
        testDb!.close(() => resolve());
      });
    } catch {
      // Ignore errors when closing
    }
    testDb = null;
  }

  // Remove existing test database file
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // If we can't delete it, wait a bit and retry
      await new Promise(resolve => setTimeout(resolve, 100));
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
    }
  }

  // Create new test database with explicit file mode
  testDb = new sqlite3.Database(TEST_DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

  // Enable WAL mode for better concurrency
  await runSql(testDb, 'PRAGMA journal_mode=WAL');
  await runSql(testDb, 'PRAGMA synchronous=NORMAL');

  // Run migrations
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await runSql(testDb, sql);
  }

  // Set environment variable so app code uses test database
  process.env.DATABASE_PATH = TEST_DB_PATH;
  // Note: NODE_ENV is handled by vitest automatically

  return testDb;
}

export async function resetTestDatabase(): Promise<void> {
  if (!testDb) return;

  // Get all table names except migrations
  const tables = await allAsync<{ name: string }>(
    testDb,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
  );

  // Delete data from all tables
  for (const table of tables) {
    await runSql(testDb, `DELETE FROM ${table.name}`);
  }
}

export async function teardownTestDatabase(): Promise<void> {
  if (testDb) {
    await new Promise<void>((resolve, reject) => {
      testDb!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    testDb = null;
  }

  // Clean up all test databases for this worker
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Also clean up any other worker databases (in case of cleanup from main process)
  const dataDir = path.join(process.cwd(), 'app_data', 'data');
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      if (file.startsWith('test-matchexec-') && file.endsWith('.db')) {
        try {
          fs.unlinkSync(path.join(dataDir, file));
        } catch {
          // Ignore errors during cleanup
        }
      }
    }
  }
}

export function getTestDb(): sqlite3.Database {
  if (!testDb) throw new Error('Test database not initialized');
  return testDb;
}

// Helper functions
function runSql(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function allAsync<T>(db: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}
