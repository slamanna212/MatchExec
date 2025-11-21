import type { Database} from './database/connection';
import { getDatabase } from './database/connection';

async function initializeDatabase(): Promise<Database> {
  const db = getDatabase();
  
  // Connect to database (migrations should be run separately at startup)
  await db.connect();
  
  return db;
}

let dbPromise: Promise<Database> | null = null;

export function getDbInstance() {
  if (!dbPromise) {
    dbPromise = initializeDatabase();
  }
  return dbPromise;
}

// Note: Auto-initialization removed to prevent conflicts during startup
// Database initialization is handled by the migration script (scripts/migrate-background.ts)
// which runs as a oneshot service before other processes start
