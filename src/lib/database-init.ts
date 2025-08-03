import { Database, getDatabase } from '../../lib/database/connection';
import { MigrationRunner } from '../../lib/database/migrations';
import { DatabaseSeeder } from '../../lib/database/seeder';

async function initializeDatabase(): Promise<Database> {
  const db = getDatabase();
  
  // Connect to database
  await db.connect();
  
  // Run migrations
  const migrationRunner = new MigrationRunner(db);
  await migrationRunner.runMigrations();
  
  // Seed database with game data
  const seeder = new DatabaseSeeder(db);
  await seeder.seedDatabase();
  
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