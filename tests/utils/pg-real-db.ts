/**
 * A real, throw-away Postgres database for the backup/restore tests: they need a connection URL (pg_dump / pg_restore connect
 * on their own), a real pool, and the `control` schema, which PGlite's single connection cannot serve concurrently.
 *
 * Requires TEST_DATABASE_URL (admin connection). `createRealDb()` creates `mxbk_<pid>_<rand>`, applies the migrations, seeds
 * the reference data, points `DATABASE_URL` and the lib/db singletons at it, and returns a handle whose `drop()` undoes all of it.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { resetDb, schema, getPool, type Db } from '../../lib/db';
import { runMigrations } from '../../lib/db/migrate';
import { resetLocalMaintenance } from '../../lib/maintenance';

export const realPostgresUrl = (): string | undefined => process.env.TEST_DATABASE_URL;

export interface RealDb {
  url: string;
  pool: Pool;
  db: Db;
  name: string;
  drop(): Promise<void>;
}

export async function createRealDb(options: { migrate?: boolean } = {}): Promise<RealDb> {
  const adminUrl = realPostgresUrl();
  if (!adminUrl) throw new Error('TEST_DATABASE_URL is not set');
  const name = `mxbk_${process.pid}_${randomBytes(4).toString('hex')}`;
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  const url = u.toString();

  await resetDb();
  resetLocalMaintenance();
  process.env.DATABASE_URL = url;
  const pool = getPool();
  if (options.migrate !== false) await runMigrations({ pool, skipPreUpgradeDump: true, skipLegacyImport: true });
  return {
    url,
    pool,
    name,
    db: drizzle(pool, { schema }) as unknown as Db,
    async drop() {
      resetLocalMaintenance();
      await resetDb();
      delete process.env.DATABASE_URL;
      const dropper = new Pool({ connectionString: adminUrl, max: 1 });
      try {
        await dropper.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await dropper.end();
      }
    },
  };
}
