import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDbInstance, resetDbSingleton, setDbForTesting } from '../../../lib/database-init';
import { getTestDb } from '../../utils/test-db';

// This test file manipulates the DB singleton directly.
// After each test we restore the test DB so other infrastructure keeps working.
afterEach(() => {
  resetDbSingleton();
  setDbForTesting(getTestDb() as any);
});

describe('lib/database-init', () => {
  describe('getDbInstance', () => {
    it('returns a resolved database instance', async () => {
      const db = await getDbInstance();
      expect(db).toBeDefined();
    });

    it('returns the same instance on every call (singleton)', async () => {
      const db1 = await getDbInstance();
      const db2 = await getDbInstance();
      const db3 = await getDbInstance();
      expect(db1).toBe(db2);
      expect(db2).toBe(db3);
    });

    it('returns the same pending promise for concurrent calls', () => {
      const p1 = getDbInstance();
      const p2 = getDbInstance();
      expect(p1).toBe(p2);
    });
  });

  describe('resetDbSingleton', () => {
    it('causes the next getDbInstance call to produce a new promise', async () => {
      const promise1 = getDbInstance();
      resetDbSingleton();
      const promise2 = getDbInstance();
      expect(promise1).not.toBe(promise2);
    });

    it('clears env path tracking so a fresh DB can be created after re-inject', async () => {
      const fakeA = { close: vi.fn() } as any;
      const fakeB = { close: vi.fn() } as any;

      setDbForTesting(fakeA);
      const first = await getDbInstance();
      expect(first).toBe(fakeA);

      resetDbSingleton();
      setDbForTesting(fakeB);
      const second = await getDbInstance();
      expect(second).toBe(fakeB);
    });
  });

  describe('setDbForTesting', () => {
    it('injects a custom DB that getDbInstance resolves to', async () => {
      const fakeDb = { run: vi.fn(), get: vi.fn(), all: vi.fn() } as any;
      setDbForTesting(fakeDb);

      const result = await getDbInstance();
      expect(result).toBe(fakeDb);
    });

    it('resolves synchronously (no connect() call on the injected DB)', async () => {
      const fakeDb = { connect: vi.fn() } as any;
      setDbForTesting(fakeDb);

      await getDbInstance();
      expect(fakeDb.connect).not.toHaveBeenCalled();
    });

    it('replaces a previously injected DB with the new one', async () => {
      const fakeDb1 = { id: 'first' } as any;
      const fakeDb2 = { id: 'second' } as any;

      setDbForTesting(fakeDb1);
      setDbForTesting(fakeDb2);

      const result = await getDbInstance();
      expect(result).toBe(fakeDb2);
    });

    it('returns the newly injected DB without calling resetDbSingleton first', async () => {
      const fakeDb = { id: 'injected' } as any;
      setDbForTesting(fakeDb);
      const result = await getDbInstance();
      expect(result).toBe(fakeDb);
    });
  });
});
