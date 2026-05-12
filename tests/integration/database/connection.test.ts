import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Database } from '../../../lib/database/connection';

const workerId = process.env.VITEST_POOL_ID || '0';
const dbPath = path.join(process.cwd(), 'app_data', 'data', `test-connection-${workerId}.db`);

describe('Database Connection', () => {
  let db: Database;

  beforeAll(async () => {
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
    }
    db = new Database(dbPath);
    await db.connect();
  });

  afterAll(async () => {
    await db.close();
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
    }
  });

  describe('PRAGMA configuration', () => {
    it('should enable WAL journal mode', async () => {
      const row = await db.get<{ journal_mode: string }>('PRAGMA journal_mode');
      expect(row).toBeDefined();
      expect(row!.journal_mode).toBe('wal');
    });

    it('should set busy timeout to 5000ms', async () => {
      const row = await db.get<{ timeout: number }>('PRAGMA busy_timeout');
      expect(row).toBeDefined();
      expect(row!.timeout).toBe(5000);
    });

    it('should set synchronous mode to NORMAL', async () => {
      const row = await db.get<{ synchronous: number }>('PRAGMA synchronous');
      expect(row).toBeDefined();
      expect(row!.synchronous).toBe(1); // NORMAL = 1 in SQLite
    });
  });

  describe('connection lifecycle', () => {
    it('should throw when calling run() before connect()', async () => {
      const unconnected = new Database(`${dbPath  }-unused`);
      await expect(unconnected.run('SELECT 1')).rejects.toThrow('Database not connected');
    });

    it('should throw when calling get() before connect()', async () => {
      const unconnected = new Database(`${dbPath  }-unused`);
      await expect(unconnected.get('SELECT 1')).rejects.toThrow('Database not connected');
    });

    it('should throw when calling all() before connect()', async () => {
      const unconnected = new Database(`${dbPath  }-unused`);
      await expect(unconnected.all('SELECT 1')).rejects.toThrow('Database not connected');
    });

    it('should not error when connect() is called on an already-connected instance', async () => {
      await expect(db.connect()).resolves.not.toThrow();
      // Verify DB still works after redundant connect
      const row = await db.get<{ journal_mode: string }>('PRAGMA journal_mode');
      expect(row!.journal_mode).toBe('wal');
    });

    it('should close the connection without error', async () => {
      const closeDbPath = path.join(process.cwd(), 'app_data', 'data', `test-close-${workerId}.db`);
      const closeDb = new Database(closeDbPath);
      await closeDb.connect();
      await expect(closeDb.close()).resolves.not.toThrow();
      for (const p of [closeDbPath, `${closeDbPath}-wal`, `${closeDbPath}-shm`]) {
        if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { } }
      }
    });
  });
});
