import { Database, getDatabase } from './connection';
import { createMigrationRunner } from './migrations';
import { DatabaseSeeder } from './seeder';
import { waitForSystemReady } from '../db/system-status';

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

/**
 * Transitional (removed in Stage 2 step 9): waits for the Postgres migrator (`system_status.phase = 'ready'`), then
 * opens the legacy SQLite connection still used by domains that are not ported yet.
 */
export async function waitForDatabaseReady(maxWaitMs = 120000, intervalMs = 500): Promise<Database> {
  await waitForSystemReady({ timeoutMs: maxWaitMs, intervalMs });
  const db = getDatabase();
  await db.connect();
  return db;
}

export { Database, getDatabase };
export * from './connection';
export * from './migrations';
export * from './seeder';
