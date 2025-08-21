#!/usr/bin/env tsx

import { Database, getDatabase } from '../lib/database/connection';
import { MigrationRunner } from '../lib/database/migrations';
import { DatabaseSeeder } from '../lib/database/seeder';

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
    console.error('❌ Error during database initialization:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    await db.close();
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations().catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
}

export { runMigrations };