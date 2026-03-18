import type { Database} from './database/connection';
import { getDatabase } from './database/connection';

async function initializeDatabase(): Promise<Database> {
  const db = getDatabase();
  
  // Connect to database (migrations should be run separately at startup)
  await db.connect();
  
  return db;
}

let dbPromise: Promise<Database> | null = null;
let dbPromiseEnvPath: string | undefined = undefined;

export function getDbInstance(): Promise<Database> {
  const envPath = process.env.DATABASE_PATH;
  if (!dbPromise || dbPromiseEnvPath !== envPath) {
    dbPromiseEnvPath = envPath;
    dbPromise = initializeDatabase();
  }
  return dbPromise;
}

export function resetDbSingleton(): void {
  dbPromise = null;
  dbPromiseEnvPath = undefined;
}

export function setDbForTesting(db: Database): void {
  dbPromise = Promise.resolve(db);
  dbPromiseEnvPath = process.env.DATABASE_PATH;
}

// Note: Auto-initialization removed to prevent conflicts during startup
// Database initialization is handled by the migration script (scripts/migrate-background.ts)
// which runs as a oneshot service before other processes start
