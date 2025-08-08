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
        name TEXT NOT NULL UNIQUE,
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
      const rows = await this.db.all<{ name: string }>('SELECT name FROM migrations');
      return rows.map(row => row.name);
    } catch {
      // If migrations table doesn't exist yet, return empty array
      return [];
    }
  }

  private async executeMigration(filename: string): Promise<void> {
    
    const migrationPath = path.join(this.migrationsDir, filename);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    try {
      await this.db.exec(sql);
      await this.db.run('INSERT INTO migrations (name) VALUES (?)', [filename]);
    } catch (error) {
      console.error(`Migration ${filename} failed:`, error);
      throw error;
    }
  }
}