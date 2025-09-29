import { Database } from './connection';
import { readDbStatus } from './status';

export class DatabaseReadinessChecker {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async waitForReady(maxWaitTimeMs: number = 60000, checkIntervalMs: number = 1000): Promise<void> {
    const startTime = Date.now();

    console.log('⏳ Waiting for database to be ready...');

    while (Date.now() - startTime < maxWaitTimeMs) {
      // First check the status file to avoid database locks during seeding
      const status = readDbStatus();

      if (status.ready) {
        // Verify database is actually accessible
        try {
          await this.checkDatabaseReady();
          console.log('✅ Database is ready');
          return;
        } catch (error) {
          console.log('⏳ Status indicates ready but database not accessible yet, waiting...');
        }
      } else {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`⏳ ${status.progress} (${elapsed}s elapsed)`);
      }

      await this.sleep(checkIntervalMs);
    }

    throw new Error(`Database not ready after ${maxWaitTimeMs}ms timeout`);
  }

  private async checkDatabaseReady(): Promise<void> {
    // Check if essential tables exist and are accessible
    await this.db.get('SELECT 1 FROM games LIMIT 1');
    await this.db.get('SELECT 1 FROM game_modes LIMIT 1');
    await this.db.get('SELECT 1 FROM matches LIMIT 1');

    // Check if seeding is complete by verifying we have at least one game
    const gameCount = await this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM games');
    if (!gameCount || gameCount.count === 0) {
      throw new Error('Database seeding not complete - no games found');
    }

    // Check if migrations are complete by verifying migration table exists
    await this.db.get('SELECT 1 FROM migrations LIMIT 1');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}