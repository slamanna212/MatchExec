import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class Database {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.DATABASE_PATH || path.join(process.cwd(), 'app_data', 'data', 'matchexec.db');
  }

  async connect(): Promise<void> {
    // If already connected, return immediately to prevent creating duplicate connections
    if (this.db) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Ensure the directory exists before creating the database file
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        try {
          fs.mkdirSync(dbDir, { recursive: true });
        } catch (err) {
          reject(new Error(`Failed to create database directory ${dbDir}: ${err}`));
          return;
        }
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          // Don't log here to avoid circular dependency with logger
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    if (!this.db) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.db!.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.db = null;
          resolve();
        }
      });
    });
  }

  async run(sql: string, params: unknown[] = []): Promise<{ lastID?: number; changes?: number }> {
    if (!this.db) throw new Error('Database not connected');
    
    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    if (!this.db) throw new Error('Database not connected');
    
    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.db) throw new Error('Database not connected');
    
    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  async exec(sql: string): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    
    return new Promise((resolve, reject) => {
      this.db!.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}