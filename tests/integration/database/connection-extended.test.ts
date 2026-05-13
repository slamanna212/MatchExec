import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';

const workerId = process.env.VITEST_POOL_ID || '0';

function makeDbPath(suffix: string) {
  return path.join(process.cwd(), 'app_data', 'data', `conn-ext-${workerId}-${suffix}.db`);
}

async function openDb(suffix: string): Promise<{ db: Database; dbPath: string }> {
  const dbPath = makeDbPath(suffix);
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
  }
  const db = new Database(dbPath);
  await db.connect();
  return { db, dbPath };
}

async function teardown(db: Database, dbPath: string) {
  try { await db.close(); } catch { }
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
  }
}

describe('Database Connection — extended', () => {
  const openedDbs: Array<{ db: Database; dbPath: string }> = [];

  afterAll(async () => {
    for (const { db, dbPath } of openedDbs) {
      await teardown(db, dbPath);
    }
  });

  describe('WAL mode behavior', () => {
    it('enables WAL journal mode on connect', async () => {
      const ctx = await openDb('wal');
      openedDbs.push(ctx);
      const row = await ctx.db.get<{ journal_mode: string }>('PRAGMA journal_mode');
      expect(row!.journal_mode).toBe('wal');
    });

    it('WAL mode persists after reconnecting (second connect call)', async () => {
      const ctx = await openDb('wal-persist');
      openedDbs.push(ctx);
      await ctx.db.connect(); // redundant second connect
      const row = await ctx.db.get<{ journal_mode: string }>('PRAGMA journal_mode');
      expect(row!.journal_mode).toBe('wal');
    });
  });

  describe('concurrent reads', () => {
    it('handles multiple concurrent reads without corruption', async () => {
      const ctx = await openDb('concurrent');
      openedDbs.push(ctx);
      const { db } = ctx;

      await db.exec('CREATE TABLE IF NOT EXISTS concurrent_test (id INTEGER PRIMARY KEY, val TEXT)');
      for (let i = 0; i < 10; i++) {
        await db.run('INSERT INTO concurrent_test (val) VALUES (?)', [`value-${i}`]);
      }

      const results = await Promise.all(
        Array.from({ length: 10 }, () => db.all<{ val: string }>('SELECT val FROM concurrent_test'))
      );

      for (const rows of results) {
        expect(rows).toHaveLength(10);
      }
    });

    it('reads from multiple concurrent get() calls return consistent data', async () => {
      const ctx = await openDb('concurrent-get');
      openedDbs.push(ctx);
      const { db } = ctx;

      await db.exec('CREATE TABLE IF NOT EXISTS cg_test (id INTEGER PRIMARY KEY, name TEXT)');
      await db.run('INSERT INTO cg_test (id, name) VALUES (1, ?)', ['test-row']);

      const reads = await Promise.all(
        Array.from({ length: 5 }, () => db.get<{ name: string }>('SELECT name FROM cg_test WHERE id = 1'))
      );

      for (const row of reads) {
        expect(row!.name).toBe('test-row');
      }
    });
  });

  describe('exec() for multi-statement SQL', () => {
    it('executes multiple statements separated by semicolons', async () => {
      const ctx = await openDb('exec');
      openedDbs.push(ctx);
      const { db } = ctx;

      await db.exec(`
        CREATE TABLE IF NOT EXISTS exec_a (id INTEGER PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS exec_b (id INTEGER PRIMARY KEY);
      `);

      const tables = await db.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('exec_a', 'exec_b')`
      );
      expect(tables).toHaveLength(2);
    });
  });

  describe('single-connection semantics', () => {
    it('writes and reads with the same connection are immediately consistent', async () => {
      const ctx = await openDb('single-conn');
      openedDbs.push(ctx);
      const { db } = ctx;

      await db.exec('CREATE TABLE IF NOT EXISTS sc_test (id INTEGER PRIMARY KEY, val TEXT)');
      await db.run('INSERT INTO sc_test VALUES (1, ?)', ['written']);
      const row = await db.get<{ val: string }>('SELECT val FROM sc_test WHERE id = 1');
      expect(row!.val).toBe('written');
    });

    it('updates are immediately visible to subsequent reads on same connection', async () => {
      const ctx = await openDb('single-update');
      openedDbs.push(ctx);
      const { db } = ctx;

      await db.exec('CREATE TABLE IF NOT EXISTS su_test (id INTEGER PRIMARY KEY, val TEXT)');
      await db.run('INSERT INTO su_test VALUES (1, ?)', ['initial']);
      await db.run('UPDATE su_test SET val = ? WHERE id = 1', ['updated']);
      const row = await db.get<{ val: string }>('SELECT val FROM su_test WHERE id = 1');
      expect(row!.val).toBe('updated');
    });

    it('run() returns last insert rowid for INSERT', async () => {
      const ctx = await openDb('rowid');
      openedDbs.push(ctx);
      const { db } = ctx;

      await db.exec('CREATE TABLE IF NOT EXISTS rowid_test (id INTEGER PRIMARY KEY, val TEXT)');
      const result = await db.run('INSERT INTO rowid_test (val) VALUES (?)', ['hello']);
      expect(result.lastID).toBeGreaterThan(0);
    });

    it('run() returns affected row count for UPDATE', async () => {
      const ctx = await openDb('changes');
      openedDbs.push(ctx);
      const { db } = ctx;

      await db.exec('CREATE TABLE IF NOT EXISTS changes_test (id INTEGER PRIMARY KEY, val TEXT)');
      await db.run('INSERT INTO changes_test VALUES (1, ?)');
      await db.run('INSERT INTO changes_test VALUES (2, ?)');
      const result = await db.run('UPDATE changes_test SET val = ?', ['x']);
      expect(result.changes).toBe(2);
    });
  });

  describe('close() behavior', () => {
    it('operations after close() throw an error', async () => {
      const ctx = await openDb('after-close');
      openedDbs.push(ctx);
      await ctx.db.close();
      await expect(ctx.db.get('SELECT 1')).rejects.toThrow();
    });
  });
});
