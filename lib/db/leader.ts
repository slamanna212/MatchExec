/**
 * Single-instance guard (plan 1.4): the Discord bot and the scheduler each take a session-level Postgres advisory
 * lock at startup on a DEDICATED connection (not from the pool) and hold it for the life of the process. If the
 * lock is already held, another instance is running: log clearly and exit instead of double-posting to Discord.
 * The lock disappears with the connection, so a crashed process never leaves a stale lock behind.
 */
import { Client } from 'pg';
import { resolveDatabaseUrl } from './index';

const stderr = (message: string): void => { process.stderr.write(`${message}\n`); };

export type LeaderRole = 'discord-bot' | 'scheduler';

/** Advisory lock keys (the migrator uses 7310150001). */
export const LEADER_LOCK_KEYS: Record<LeaderRole, number> = {
  'discord-bot': 7310150101,
  scheduler: 7310150102,
};

export interface LeaderLock {
  role: string;
  /** Release the lock and close the connection (call on graceful shutdown). */
  release(): Promise<void>;
}

export interface LeaderOptions {
  connectionString?: string;
  /** Called if the dedicated connection dies while we are leader (the lock is gone). Default: log + exit(1). */
  onLost?: (error?: Error) => void;
  log?: (message: string) => void;
}

/** Try to become leader for `role`. Returns null when another instance holds the lock. */
export async function tryAcquireLeaderLock(role: LeaderRole, opts: LeaderOptions = {}): Promise<LeaderLock | null> {
  const client = new Client({ connectionString: opts.connectionString ?? resolveDatabaseUrl() });
  await client.connect();
  const key = LEADER_LOCK_KEYS[role];
  let held = false;
  try {
    const res = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS locked', [key]);
    held = res.rows[0]?.locked === true;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
  if (!held) {
    await client.end().catch(() => {});
    return null;
  }

  let released = false;
  const onLost = opts.onLost ?? ((error) => {
    (opts.log ?? stderr)(`[${role}] lost the leader lock connection${error ? `: ${error.message}` : ''}; exiting`);
    process.exit(1);
  });
  client.on('error', (error) => { if (!released) { released = true; onLost(error); } });
  client.on('end', () => { if (!released) { released = true; onLost(); } });

  return {
    role,
    async release() {
      if (released) return;
      released = true;
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [key]).catch(() => {});
      await client.end().catch(() => {});
    },
  };
}

/**
 * Become leader for `role` or exit the process with a clear log line. Call once at startup, after the database
 * is reachable; keep the returned handle for shutdown.
 */
export async function requireLeaderLock(role: LeaderRole, opts: LeaderOptions = {}): Promise<LeaderLock> {
  const log = opts.log ?? stderr;
  const lock = await tryAcquireLeaderLock(role, opts);
  if (!lock) {
    log(`[${role}] another ${role} instance already holds the leader lock (pg advisory lock ${LEADER_LOCK_KEYS[role]}); exiting. ` +
      `Run exactly one ${role} per database.`);
    process.exit(1);
  }
  return lock;
}
