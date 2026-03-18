import { Umzug } from 'umzug';
import fs from 'fs';
import path from 'path';
import type { Database } from './connection';

class SQLiteStorage {
  constructor(private readonly db: Database) {}

  async executed(): Promise<string[]> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const rows = await this.db.all<{ filename: string }>('SELECT filename FROM migrations ORDER BY filename');
    return rows.map(r => r.filename);
  }

  async logMigration({ name }: { name: string }): Promise<void> {
    await this.db.run('INSERT INTO migrations (filename) VALUES (?)', [name]);
  }

  async unlogMigration({ name }: { name: string }): Promise<void> {
    await this.db.run('DELETE FROM migrations WHERE filename = ?', [name]);
  }
}

type UmzugLogger = Record<'debug' | 'info' | 'error' | 'warn', (msg: unknown) => void>;

export function createMigrationRunner(
  db: Database,
  migrationsDir = path.join(process.cwd(), 'migrations'),
  logger: UmzugLogger | undefined = console
): Umzug {
  return new Umzug({
    migrations: {
      glob: ['*.sql', { cwd: migrationsDir }],
      resolve: ({ name, path: filePath }) => ({
        name,
        up: async () => {
          const sql = fs.readFileSync(filePath!, 'utf8');
          try {
            await db.run('BEGIN');
            await db.exec(sql);
            await db.run('COMMIT');
          } catch (error) {
            await db.run('ROLLBACK').catch((e: unknown) => {
              const msg = e instanceof Error ? e.message : String(e);
              if (!msg.includes('no transaction is active')) {
                console.error(`Failed to rollback migration ${name}:`, e);
              }
            });
            throw error;
          }
        },
      }),
    },
    storage: new SQLiteStorage(db),
    logger,
  });
}
