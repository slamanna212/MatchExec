import { Database, getDatabase } from '../../lib/database/connection';

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

// Initialize database when module is loaded
if (typeof window === 'undefined') {
  getDbInstance().catch(console.error);
}