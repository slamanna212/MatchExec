import { Database, getDatabase } from './connection';
import { MigrationRunner } from './migrations';
import { DatabaseSeeder } from './seeder';

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

export { Database, getDatabase };
export * from './connection';
export * from './migrations';
export * from './seeder';