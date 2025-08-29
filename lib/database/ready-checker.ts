import { Database } from './connection';

export class DatabaseReadinessChecker {
  private db: Database;
  
  constructor(db: Database) {
    this.db = db;
  }

  async waitForReady(maxWaitTimeMs: number = 60000, checkIntervalMs: number = 1000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTimeMs) {
      try {
        await this.checkDatabaseReady();
        console.log('✅ Database is ready');
        return;
      } catch {
        const elapsed = Date.now() - startTime;
        console.log(`⏳ Database not ready yet (${elapsed}ms elapsed), checking again in ${checkIntervalMs}ms...`);
        await this.sleep(checkIntervalMs);
      }
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