#!/usr/bin/env tsx

import { getDatabase } from '../lib/database/connection';
import { MigrationRunner } from '../lib/database/migrations';
import { DatabaseSeeder } from '../lib/database/seeder';
import { markDbNotReady } from '../lib/database/status';

async function runMigrationsInBackground() {
  // Mark as not ready immediately
  markDbNotReady('Starting database initialization...');

  const db = getDatabase();

  try {
    // Connect to database
    await db.connect();

    markDbNotReady('Running migrations...');

    // Run migrations
    const migrationRunner = new MigrationRunner(db);
    await migrationRunner.runMigrations();

    // Seed database with game data
    const seeder = new DatabaseSeeder(db);
    await seeder.seedDatabase();

    console.log('✅ Background database initialization completed');
  } catch (error) {
    console.error('❌ Error during database initialization:', error);
    markDbNotReady('Database initialization failed');
    process.exit(1);
  } finally {
    // Close the database connection
    await db.close();
  }
}

// Run migrations in background (non-blocking)
if (require.main === module) {
  runMigrationsInBackground().catch((error) => {
    console.error('❌ Background migration script failed:', error);
    process.exit(1);
  });
}

export { runMigrationsInBackground };