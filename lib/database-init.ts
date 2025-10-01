import { Database, getDatabase } from './database/connection';

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
  getDbInstance().catch((error) => {
    // Use console.error here as logger may not be ready yet during initialization
    console.error('Failed to initialize database:', error);
  });
}
