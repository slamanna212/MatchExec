// @vitest-environment node
/**
 * Real-Postgres concurrency tests for the worker claim contract (plan 1.4). Several independent connections claim
 * at the same time; no row may ever be handed to two workers. Skipped without TEST_DATABASE_URL (`pnpm test:pg`).
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { schema, type Db } from '../../../lib/db';
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, resolveMigrationsFolder } from '../../../lib/db/migrate';
import { LEADER_LOCK_KEYS, requireLeaderLock, tryAcquireLeaderLock } from '../../../lib/db/leader';
import { discordAnnouncementQueue, discordStatsReportQueue, statsProcessingQueue } from '../../../lib/db/schema';
import {
  claimJobs, completeJob, enqueueMatchReminder, enqueueStatsReport, failJob, resetAbandonedClaims,
} from '../../../src/lib/discord-queues';

const url = process.env.TEST_DATABASE_URL;
const WORKERS = 8;

const dbName = `mxtest_${process.pid}_${randomBytes(4).toString('hex')}`;
const pools: Pool[] = [];
let workers: Db[] = [];
let testUrl = '';

function withDatabase(base: string, name: string): string {
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
}

describe.skipIf(!url)('discord queues: real Postgres concurrency', () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: url, max: 1 });
    try { await admin.query(`CREATE DATABASE "${dbName}"`); } finally { await admin.end(); }
    testUrl = withDatabase(url!, dbName);
    // one pool (= one backend connection) per worker
    for (let i = 0; i < WORKERS; i++) pools.push(new Pool({ connectionString: testUrl, max: 1 }));
    workers = pools.map((p) => drizzle(p, { schema }) as unknown as Db);
    await migrate(workers[0] as never, { migrationsFolder: resolveMigrationsFolder(), migrationsTable: MIGRATIONS_TABLE, migrationsSchema: MIGRATIONS_SCHEMA });
    // matches are FK parents of most queues: one fixture match + game
    await workers[0]!.execute(sql`INSERT INTO games (id, name, genre, min_players, max_players) VALUES ('g', 'G', 'FPS', 2, 12)`);
    await workers[0]!.execute(sql`INSERT INTO matches (id, game_id, name, start_date, start_time, status, match_format, rounds) VALUES ('m', 'g', 'M', now(), now(), 'created', 'competitive', 3)`);
  }, 60_000);

  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
    const dropper = new Pool({ connectionString: url, max: 1 });
    try { await dropper.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`); } finally { await dropper.end(); }
  }, 60_000);

  async function seedAnnouncements(n: number) {
    await workers[0]!.execute(sql`TRUNCATE discord_announcement_queue`);
    const rows = Array.from({ length: n }, (_, i) => ({ id: `a${String(i).padStart(4, '0')}`, match_id: 'm', announcement_type: 'standard' as const }));
    await workers[0]!.insert(discordAnnouncementQueue).values(rows);
  }

  it('many connections draining one queue never claim a row twice and never lose one', async () => {
    const TOTAL = 300;
    await seedAnnouncements(TOTAL);

    const claimedBy = await Promise.all(workers.map(async (w, i) => {
      const mine: string[] = [];
      for (;;) {
        const batch = await claimJobs(w, 'announcement', { limit: 7, workerId: `w${i}` });
        if (batch.length === 0) break;
        for (const r of batch) {
          expect(r.claimed_by).toBe(`w${i}`);
          expect(r.attempts).toBe(1);
        }
        mine.push(...batch.map((r) => r.id));
      }
      return mine;
    }));

    const all = claimedBy.flat();
    expect(new Set(all).size).toBe(all.length); // no duplicates
    expect(all).toHaveLength(TOTAL); // nothing lost
    // work was actually spread over several connections
    expect(claimedBy.filter((c) => c.length > 0).length).toBeGreaterThan(1);

    const rows = await workers[0]!.select().from(discordAnnouncementQueue);
    expect(rows.every((r) => r.status === 'processing' && r.attempts === 1)).toBe(true);
  }, 60_000);

  it('a single row raced for by every connection has exactly one owner', async () => {
    for (let round = 0; round < 10; round++) {
      await seedAnnouncements(1);
      const results = await Promise.all(workers.map((w, i) => claimJobs(w, 'announcement', { limit: 1, workerId: `w${i}` })));
      expect(results.flat()).toHaveLength(1);
    }
  }, 60_000);

  it('claim + complete + fail running concurrently keeps every row accounted for exactly once', async () => {
    const TOTAL = 200;
    await seedAnnouncements(TOTAL);
    await workers[0]!.update(discordAnnouncementQueue).set({ max_attempts: 1 });

    const outcomes = await Promise.all(workers.map(async (w, i) => {
      const done: string[] = [];
      const failed: string[] = [];
      for (;;) {
        const batch = await claimJobs(w, 'announcement', { limit: 5, workerId: `w${i}` });
        if (batch.length === 0) break;
        for (const [j, r] of batch.entries()) {
          if (j % 2 === 0) { expect(await completeJob(w, 'announcement', r.id)).toBe(true); done.push(r.id); }
          else { expect(await failJob(w, 'announcement', r.id, 'x')).toBe('failed'); failed.push(r.id); }
        }
      }
      return { done, failed };
    }));

    const done = outcomes.flatMap((o) => o.done);
    const failed = outcomes.flatMap((o) => o.failed);
    expect(new Set([...done, ...failed]).size).toBe(TOTAL);
    const counts = await workers[0]!.execute(sql`SELECT status, count(*)::int AS n FROM discord_announcement_queue GROUP BY status ORDER BY status`);
    const byStatus = Object.fromEntries((counts as unknown as { rows: Array<{ status: string; n: number }> }).rows.map((r) => [r.status, r.n]));
    expect(byStatus).toEqual({ completed: done.length, failed: failed.length });
  }, 60_000);

  it('abandoned reset racing with fresh claims never duplicates ownership', async () => {
    await seedAnnouncements(60);
    // half the rows look like they were claimed by a crashed worker long ago
    await workers[0]!.execute(sql`UPDATE discord_announcement_queue SET status = 'processing', attempts = 1, claimed_by = 'dead', claimed_at = now() - interval '1 hour' WHERE id < 'a0030'`);

    const results = await Promise.all(workers.map(async (w, i) => {
      if (i % 2 === 0) { await resetAbandonedClaims(w, ['announcement']); return [] as string[]; }
      const mine: string[] = [];
      for (let k = 0; k < 20; k++) mine.push(...(await claimJobs(w, 'announcement', { limit: 10, workerId: `w${i}` })).map((r) => r.id));
      return mine;
    }));
    const claimed = results.flat();
    expect(new Set(claimed).size).toBe(claimed.length);

    // after one more reset + drain every row ends up claimed exactly once overall
    await resetAbandonedClaims(workers[0]!, ['announcement']);
    const rest = (await Promise.all(workers.map(async (w, i) => (await claimJobs(w, 'announcement', { limit: 100, workerId: `r${i}` })).map((r) => r.id)))).flat();
    expect(new Set([...claimed, ...rest]).size).toBe(claimed.length + rest.length);
    expect(claimed.length + rest.length).toBe(60);
  }, 60_000);

  it('a worker killed mid-claim loses nothing: abandoned claims are reset and every job is processed exactly once', async () => {
    const TOTAL = 20;
    await seedAnnouncements(TOTAL);
    const effects = new Map<string, number>(); // id -> times the "Discord effect" ran
    const process_ = async (w: Db, id: string) => {
      if (await completeJob(w, 'announcement', id)) effects.set(id, (effects.get(id) ?? 0) + 1);
    };

    // Worker A claims a batch, runs the effect for only some of it, then its backend is killed (crash / OOM / SIGKILL).
    const victimPool = new Pool({ connectionString: testUrl, max: 1 });
    victimPool.on('error', () => undefined); // the killed backend emits a FATAL 57P01 on the idle client
    const victim = drizzle(victimPool, { schema }) as unknown as Db;
    const claimedByVictim = await claimJobs(victim, 'announcement', { limit: 8, workerId: 'victim' });
    expect(claimedByVictim).toHaveLength(8);
    for (const r of claimedByVictim.slice(0, 3)) await process_(victim, r.id);
    const victimPid = ((await victim.execute(sql`SELECT pg_backend_pid() AS pid`)) as unknown as { rows: Array<{ pid: number }> }).rows[0]!.pid;
    await workers[0]!.execute(sql`SELECT pg_terminate_backend(${victimPid})`);
    await victimPool.end().catch(() => undefined);

    // A surviving worker drains what is still pending. The 5 jobs the victim claimed but never finished stay 'processing'.
    const survivor = workers[1]!;
    for (;;) {
      const batch = await claimJobs(survivor, 'announcement', { limit: 6, workerId: 'survivor' });
      if (batch.length === 0) break;
      for (const r of batch) await process_(survivor, r.id);
    }
    const stuck = await workers[0]!.select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.status, 'processing'));
    expect(stuck.map((r) => r.id).sort()).toEqual(claimedByVictim.slice(3).map((r) => r.id).sort());
    expect(stuck.every((r) => r.claimed_by === 'victim')).toBe(true);

    // Before the abandon timeout nothing is touched (a slow-but-alive worker is never raced)...
    expect(await resetAbandonedClaims(survivor, ['announcement'])).toBe(0);
    // ...after it, the restarted worker's tick resets exactly the abandoned claims and finishes them once.
    expect(await resetAbandonedClaims(survivor, ['announcement'], new Date(Date.now() + 60 * 60 * 1000))).toBe(5);
    const restarted = workers[2]!;
    const again = await claimJobs(restarted, 'announcement', { limit: 50, workerId: 'restarted' });
    expect(again.map((r) => r.id).sort()).toEqual(stuck.map((r) => r.id).sort());
    expect(again.every((r) => r.attempts === 2)).toBe(true);
    for (const r of again) await process_(restarted, r.id);

    expect(effects.size).toBe(TOTAL);
    expect([...effects.values()].every((n) => n === 1)).toBe(true);
    const finalStatus = await workers[0]!.select({ status: discordAnnouncementQueue.status }).from(discordAnnouncementQueue);
    expect(finalStatus.every((r) => r.status === 'completed')).toBe(true);
  }, 60_000);

  it('a stats job is claimed by only one of several stats processors', async () => {
    await workers[0]!.execute(sql`INSERT INTO match_games (id, match_id) VALUES ('mg', 'm') ON CONFLICT DO NOTHING`);
    await workers[0]!.execute(sql`INSERT INTO scorecard_submissions (id, match_id, match_game_id, team_side, screenshot_url) VALUES ('s1', 'm', 'mg', 'blue', '/x') ON CONFLICT DO NOTHING`);
    await workers[0]!.execute(sql`TRUNCATE stats_processing_queue`);
    await workers[0]!.insert(statsProcessingQueue).values({ id: 'job', submission_id: 's1', match_id: 'm', match_game_id: 'mg' });
    const results = await Promise.all(workers.map((w, i) => claimJobs(w, 'statsProcessing', { limit: 1, workerId: `sp${i}` })));
    expect(results.flat()).toHaveLength(1);
  });

  it('unique-index enqueues stay unique under concurrent inserts', async () => {
    await workers[0]!.execute(sql`TRUNCATE discord_stats_report_queue, discord_reminder_queue`);
    const reports = await Promise.all(workers.map((w) => enqueueStatsReport(w, 'm')));
    expect(reports.filter((r) => r !== null)).toHaveLength(1);
    expect(await workers[0]!.select().from(discordStatsReportQueue)).toHaveLength(1);

    const when = new Date(Date.now() + 60_000);
    const reminders = await Promise.all(workers.map((w) => enqueueMatchReminder(w, { matchId: 'm', minutesBefore: 30, reminderTime: when })));
    expect(reminders.filter((r) => r !== null)).toHaveLength(1);
  });

  describe('leader lock', () => {
    it('only one process holds the lock per role; it is released with release() and independent per role', async () => {
      const first = await tryAcquireLeaderLock('discord-bot', { connectionString: testUrl });
      expect(first).not.toBeNull();
      expect(await tryAcquireLeaderLock('discord-bot', { connectionString: testUrl })).toBeNull();
      // another role is not blocked
      const scheduler = await tryAcquireLeaderLock('scheduler', { connectionString: testUrl });
      expect(scheduler).not.toBeNull();

      await first!.release();
      const again = await tryAcquireLeaderLock('discord-bot', { connectionString: testUrl });
      expect(again).not.toBeNull();
      await again!.release();
      await scheduler!.release();
    });

    it('is freed automatically when the holder connection dies (crash)', async () => {
      const lost: unknown[] = [];
      const holder = await tryAcquireLeaderLock('scheduler', { connectionString: testUrl, onLost: (e) => lost.push(e ?? 'ended') });
      expect(holder).not.toBeNull();
      expect(await tryAcquireLeaderLock('scheduler', { connectionString: testUrl })).toBeNull();

      // terminate the holder's backend from outside
      const key = LEADER_LOCK_KEYS.scheduler;
      await workers[0]!.execute(sql`SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype = 'advisory' AND granted AND ((classid::bigint << 32) | objid::bigint) = ${key}::bigint`);
      await new Promise((r) => setTimeout(r, 300));
      expect(lost.length).toBeGreaterThan(0); // the process learns it lost leadership
      const next = await tryAcquireLeaderLock('scheduler', { connectionString: testUrl });
      expect(next).not.toBeNull();
      await next!.release();
    });

    it('requireLeaderLock logs a clear message and exits when the lock is held', async () => {
      const holder = await tryAcquireLeaderLock('discord-bot', { connectionString: testUrl });
      const exit = process.exit;
      const logs: string[] = [];
      let exitCode: number | undefined;
      process.exit = ((code?: number) => { exitCode = code; throw new Error('exit'); }) as never;
      try {
        await expect(requireLeaderLock('discord-bot', { connectionString: testUrl, log: (m) => logs.push(m) })).rejects.toThrow('exit');
      } finally {
        process.exit = exit;
        await holder!.release();
      }
      expect(exitCode).toBe(1);
      expect(logs.join('\n')).toMatch(/another discord-bot instance already holds the leader lock/);
      // the lock is acquirable again by a legitimate single instance
      const ok = await requireLeaderLock('discord-bot', { connectionString: testUrl });
      await ok.release();
    });
  });

  it('sanity: every worker is a distinct backend connection', async () => {
    const pids = await Promise.all(workers.map(async (w) => {
      const res = await w.execute(sql`SELECT pg_backend_pid() AS pid`);
      return (res as unknown as { rows: Array<{ pid: number }> }).rows[0]!.pid;
    }));
    expect(new Set(pids).size).toBe(WORKERS);
    expect(await workers[0]!.select({ n: sql<number>`1` }).from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.id, 'none'))).toEqual([]);
  });
});
