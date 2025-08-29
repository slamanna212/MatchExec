import { Database, getDatabase } from './connection';
import { MigrationRunner } from './migrations';
import { DatabaseSeeder } from './seeder';
import { DatabaseReadinessChecker } from './ready-checker';

export async function initializeDatabase(): Promise<Database> {
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

export async function waitForDatabaseReady(): Promise<Database> {
  const db = getDatabase();
  
  // Connect to database
  await db.connect();
  
  // Wait for database to be ready (seeded and migrated)
  const readinessChecker = new DatabaseReadinessChecker(db);
  await readinessChecker.waitForReady();
  
  return db;
}

export { Database, getDatabase };
export * from './connection';
export * from './migrations';
export * from './seeder';
export * from './ready-checker';