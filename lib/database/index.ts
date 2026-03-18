import { Database, getDatabase } from './connection';
import { createMigrationRunner } from './migrations';
import { DatabaseSeeder } from './seeder';
import { readDbStatus } from './status';

export async function initializeDatabase(): Promise<Database> {
  const db = getDatabase();
  
  // Connect to database
  await db.connect();
  
  // Run migrations
  const migrationRunner = createMigrationRunner(db);
  await migrationRunner.up();
  
  // Seed database with game data
  const seeder = new DatabaseSeeder(db);
  await seeder.seedDatabase();
  
  return db;
}

export async function waitForDatabaseReady(maxWaitMs = 120000, intervalMs = 500): Promise<Database> {
  const startTime = Date.now();
  let ready = false;

  // Poll the status file FIRST — do not connect until migrator says DB is ready.
  // Connecting early would acquire a shared lock, preventing the migrator from
  // getting the exclusive lock it needs during migrations.
  while (Date.now() - startTime < maxWaitMs) {
    const status = readDbStatus();
    if (status.ready) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  if (!ready) {
    throw new Error(`Database not ready after ${maxWaitMs}ms timeout`);
  }

  // Now safe to connect — migrations and seeding are complete
  const db = getDatabase();
  await db.connect();
  return db;
}

export { Database, getDatabase };
export * from './connection';
export * from './migrations';
export * from './seeder';
export * from './ready-checker';