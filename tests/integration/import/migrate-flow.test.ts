/**
 * The real start-up sequence on real Postgres (skipped on PGlite): migrate -> import (with live progress written on a separate
 * connection while the import transaction is open) -> seed -> ready, exactly what `dist/migrate.js` does in the container.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { Pool } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import { count } from 'drizzle-orm';
import { makeLegacyHome, useLegacyHomes } from '../../utils/import-harness';
import * as s from '../../../lib/db/schema';
import { runMigrations, migrationHooks } from '../../../lib/db/migrate';
import { getSystemStatus } from '../../../lib/db/system-status';
import { installLegacyImportHook } from '../../../lib/import-sqlite';

useLegacyHomes();
const url = process.env.TEST_DATABASE_URL;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); });

async function freshDatabase(): Promise<Pool> {
  const name = `mximport_${process.pid}_${randomBytes(4).toString('hex')}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  const u = new URL(url!);
  u.pathname = `/${name}`;
  const pool = new Pool({ connectionString: u.toString(), max: 6 });
  cleanup.push(async () => {
    await pool.end();
    const a = new Pool({ connectionString: url, max: 1 });
    await a.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await a.end();
  });
  return pool;
}

describe.skipIf(!url)('migrate service with a legacy database (real Postgres)', () => {
  it('migrates, imports with live progress on another connection, seeds and reaches ready', async () => {
    const home = makeLegacyHome({ uploads: true });
    const pool = await freshDatabase();
    const original = migrationHooks.importLegacySqlite;
    const seen: string[] = [];
    const watcher = new Pool({ connectionString: pool.options.connectionString, max: 1 });
    cleanup.push(() => watcher.end());
    const poll = setInterval(() => {
      void watcher.query("SELECT phase, message FROM system_status WHERE id = 1").then((r) => { if (r.rows[0]) seen.push(`${r.rows[0].phase}:${r.rows[0].message}`); }).catch(() => undefined);
    }, 20);
    try {
      installLegacyImportHook({ legacyPath: home.dbPath, backupDir: home.backupDir, uploadsDirs: [home.uploadsDir] });
      await runMigrations({ pool, seed: true });
    } finally {
      clearInterval(poll);
      migrationHooks.importLegacySqlite = original;
    }
    const db = drizzle(pool, { schema: s });
    expect((await getSystemStatus(db as never))?.phase).toBe('ready');
    expect((await getSystemStatus(db as never))?.imported_from_sqlite).toBe(true);
    const [{ n }] = await db.select({ n: count() }).from(s.matches);
    expect(n).toBe(12);
    const [{ g }] = await db.select({ g: count() }).from(s.games);
    expect(g).toBeGreaterThan(10); // the 10 bundled games are seeded after the import (+ the imported test game)
    expect(fs.existsSync(home.dbPath)).toBe(false);
    // the loading screen saw the table-by-table progress while the transaction was open
    expect(seen.some((m) => m.startsWith('importing:Importing '))).toBe(true);
  });
});
