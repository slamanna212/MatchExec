import fs from 'fs';
import path from 'path';
import { Database } from './connection';

export class MigrationRunner {
  private db: Database;
  private migrationsDir: string;

  constructor(db: Database, migrationsDir: string = './migrations') {
    this.db = db;
    this.migrationsDir = migrationsDir;
  }

  async runMigrations(): Promise<void> {

    // Ensure migrations table exists
    await this.createMigrationsTable();

    // Get all migration files
    const migrationFiles = this.getMigrationFiles();
    
    // Get already executed migrations
    const executedMigrations = await this.getExecutedMigrations();

    for (const file of migrationFiles) {
      if (!executedMigrations.includes(file)) {
        await this.executeMigration(file);
      }
    }

  }

  private async createMigrationsTable(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private getMigrationFiles(): string[] {
    if (!fs.existsSync(this.migrationsDir)) {
      return [];
    }

    return fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
  }

  private async getExecutedMigrations(): Promise<string[]> {
    try {
      const rows = await this.db.all<{ filename: string }>('SELECT filename FROM migrations');
      return rows.map(row => row.filename);
    } catch {
      // If migrations table doesn't exist yet, return empty array
      return [];
    }
  }

  private async executeMigration(filename: string): Promise<void> {
    
    const migrationPath = path.join(this.migrationsDir, filename);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    try {
      // Handle specific migration that might have column addition issues
      if (filename === '017_ffa_scoring_support.sql') {
        await this.executeFFAScoringMigration();
      } else {
        await this.db.exec(sql);
      }
      await this.db.run('INSERT INTO migrations (filename) VALUES (?)', [filename]);
    } catch (error) {
      console.error(`Migration ${filename} failed:`, error);
      throw error;
    }
  }

  private async executeFFAScoringMigration(): Promise<void> {
    // Try to add columns safely, ignoring duplicate column errors
    try {
      await this.db.run("ALTER TABLE game_modes ADD COLUMN scoring_type TEXT DEFAULT 'Normal'");
    } catch (error: unknown) {
      if (error instanceof Error && !error.message.includes('duplicate column name')) {
        throw error;
      }
    }

    try {
      await this.db.run("UPDATE game_modes SET scoring_type = 'Normal' WHERE scoring_type = 'wins' OR scoring_type IS NULL");
    } catch {
      // Ignore if column doesn't exist
    }

    try {
      await this.db.run("ALTER TABLE match_games ADD COLUMN participant_winner_id TEXT");
    } catch (error: unknown) {
      if (error instanceof Error && !error.message.includes('duplicate column name')) {
        throw error;
      }
    }

    try {
      await this.db.run("ALTER TABLE match_games ADD COLUMN is_ffa_mode BOOLEAN DEFAULT 0");
    } catch (error: unknown) {
      if (error instanceof Error && !error.message.includes('duplicate column name')) {
        throw error;
      }
    }

    // Create indexes (safe to run multiple times)
    await this.db.run("CREATE INDEX IF NOT EXISTS idx_match_games_participant_winner ON match_games(participant_winner_id)");
    await this.db.run("CREATE INDEX IF NOT EXISTS idx_match_games_ffa_mode ON match_games(is_ffa_mode)");
  }
}