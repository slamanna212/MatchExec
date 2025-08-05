#!/usr/bin/env tsx

import { Database, getDatabase } from '../lib/database/connection';
import { MigrationRunner } from '../lib/database/migrations';
import { DatabaseSeeder } from '../lib/database/seeder';

async function runMigrations() {
  console.log('🚀 Starting database migrations and seeding...');
  
  const db = getDatabase();
  
  try {
    // Connect to database
    await db.connect();
    console.log('✅ Database connected');
    
    // Run migrations
    const migrationRunner = new MigrationRunner(db);
    await migrationRunner.runMigrations();
    console.log('✅ Migrations completed');
    
    // Seed database with game data
    const seeder = new DatabaseSeeder(db);
    await seeder.seedDatabase();
    console.log('✅ Database seeding completed');
    
    console.log('🎉 Database initialization finished successfully');
    
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