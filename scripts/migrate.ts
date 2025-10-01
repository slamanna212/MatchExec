#!/usr/bin/env tsx

import { getDatabase } from '../lib/database/connection';
import { MigrationRunner } from '../lib/database/migrations';
import { DatabaseSeeder } from '../lib/database/seeder';
import { logger } from '../src/lib/logger/server';

async function runMigrations() {
  
  const db = getDatabase();
  
  try {
    // Connect to database
    await db.connect();
    
    // Run migrations
    const migrationRunner = new MigrationRunner(db);
    await migrationRunner.runMigrations();
    
    // Seed database with game data
    const seeder = new DatabaseSeeder(db);
    await seeder.seedDatabase();
    
    
  } catch (error) {
    logger.error('❌ Error during database initialization:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    await db.close();
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations().catch((error) => {
    logger.error('❌ Migration script failed:', error);
    process.exit(1);
  });
}

export { runMigrations };