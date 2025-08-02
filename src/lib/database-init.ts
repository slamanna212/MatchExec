import { initializeDatabase } from '../../lib/database';

let dbPromise: Promise<any> | null = null;

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