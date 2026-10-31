import { AsyncLocalStorage } from 'async_hooks';

/**
 * Minimal shape of the database wrapper needed for transactions. Matches both
 * lib/database/connection.ts `Database` and the test-db wrapper.
 */
interface TransactionalDb {
  run(sql: string, params?: unknown[]): Promise<unknown>;
}

// One shared sqlite connection serves every request in a process, so two
// overlapping BEGINs on it would fail ("cannot start a transaction within a
// transaction"). Transactions are therefore serialised per connection, and a
// nested withTransaction() call inside an active one just runs inline.
const locks = new WeakMap<object, Promise<void>>();
const activeTx = new AsyncLocalStorage<object>();

/**
 * Run `fn` inside a single SQLite transaction (BEGIN IMMEDIATE / COMMIT, or
 * ROLLBACK if `fn` throws). Re-entrant: nested calls on the same db join the
 * outer transaction instead of starting a new one.
 *
 * Keep side effects that must not be rolled back (Discord queue inserts that
 * other processes poll, feed events) outside the callback where practical.
 */
export async function withTransaction<T>(db: TransactionalDb, fn: () => Promise<T>): Promise<T> {
  if (activeTx.getStore() === db) {
    return fn();
  }

  const previous = locks.get(db) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  locks.set(db, previous.then(() => current));

  await previous;
  try {
    return await activeTx.run(db, async () => {
      await db.run('BEGIN IMMEDIATE');
      try {
        const result = await fn();
        await db.run('COMMIT');
        return result;
      } catch (error) {
        try {
          await db.run('ROLLBACK');
        } catch {
          // ROLLBACK fails if SQLite already rolled back (e.g. on SQLITE_FULL); ignore.
        }
        throw error;
      }
    });
  } finally {
    release();
  }
}
