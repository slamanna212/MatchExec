// @vitest-environment node
/**
 * Races on the series write paths (plan 1.3): event add / reorder / remove and status changes are serialised by a row lock
 * on the series. The first block runs everywhere (on PGlite one connection serialises requests, so the invariants still
 * hold); the second needs real Postgres (`pnpm test:pg`): a background transaction holds the series row lock while
 * competing requests are fired, and pg_stat_activity (wait_event_type = 'Lock') proves they queued behind it.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { setupPgTestFile, getPgTestDb, isRealPostgres } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import { addEventApi, createSeriesApi, transitionSeriesApi } from '../../utils/pg-series-fixtures';
import { seriesEvents, series } from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import { lockSeries, transitionSeriesStatus } from '@/lib/series';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});

const newMatchId = async () => (await createMatch(gameId, modeId, { status: 'complete' })).id;
const ordersOf = async (sid: string) => (await pg().select({ o: seriesEvents.event_order }).from(seriesEvents).where(eq(seriesEvents.series_id, sid)).orderBy(asc(seriesEvents.event_order))).map((r) => r.o);

describe('series write races', () => {
  it('parallel auto-order adds all succeed with distinct consecutive orders', async () => {
    const sid = await createSeriesApi();
    const ids = await Promise.all(Array.from({ length: 8 }, newMatchId));
    const results = await Promise.all(ids.map((m) => addEventApi(sid, { event_type: 'match', match_id: m })));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
    expect(await ordersOf(sid)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('adding the same match twice in parallel creates one event and answers 409 to the loser', async () => {
    const sid = await createSeriesApi();
    const m = await newMatchId();
    const results = await Promise.all(Array.from({ length: 4 }, () => addEventApi(sid, { event_type: 'match', match_id: m })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await ordersOf(sid)).toHaveLength(1);
  });

  it('two events claiming the same explicit order: one wins, the other gets 409', async () => {
    const sid = await createSeriesApi();
    const [a, b] = [await newMatchId(), await newMatchId()];
    const results = await Promise.all([a, b].map((m) => addEventApi(sid, { event_type: 'match', match_id: m, event_order: 4 })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('parallel swaps keep orders unique, positive and complete', async () => {
    const sid = await createSeriesApi();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await addEventApi(sid, { event_type: 'match', match_id: await newMatchId() })).data.id);
    await Promise.all([
      appRequest(`/api/series/${sid}/events/${ids[0]}`, { method: 'PATCH', json: { event_order: 4 } }),
      appRequest(`/api/series/${sid}/events/${ids[1]}`, { method: 'PATCH', json: { event_order: 3 } }),
      appRequest(`/api/series/${sid}/events/${ids[2]}`, { method: 'PATCH', json: { event_order: 1 } }),
      appRequest(`/api/series/${sid}/events/${ids[3]}`, { method: 'PATCH', json: { event_order: 2 } }),
    ]);
    const orders = await ordersOf(sid);
    expect(orders.every((o) => o > 0)).toBe(true);
    expect([...orders].sort()).toEqual([1, 2, 3, 4]);
  });

  it('an add racing the series start either lands before it or is refused after it', async () => {
    const sid = await createSeriesApi();
    const m = await newMatchId();
    const [add, start, edit] = await Promise.all([
      addEventApi(sid, { event_type: 'match', match_id: m }),
      transitionSeriesApi(sid, 'active'),
      appRequest(`/api/series/${sid}/events/nope`, { method: 'PATCH', json: { points_multiplier: 2 } }),
    ]);
    expect(start.status).toBe(200);
    expect([201]).toContain(add.status); // 'active' series still accept events
    expect([404, 409]).toContain(edit.status);
  });

  it('concurrent transitions: exactly one wins the compare-and-set', async () => {
    const sid = await createSeriesApi();
    const results = await Promise.all([transitionSeriesApi(sid, 'active'), transitionSeriesApi(sid, 'active'), transitionSeriesApi(sid, 'cancelled')]);
    const [row] = await pg().select({ status: series.status }).from(series).where(eq(series.id, sid));
    expect(['active', 'cancelled']).toContain(row.status);
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => [200, 400, 409].includes(r.status))).toBe(true);
  });
});

describe.skipIf(!isRealPostgres())('real overlap on Postgres', () => {
  /** Hold the series row lock in a background transaction until `release()`; resolves with the release time. */
  async function hold(sid: string, whileHeld?: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>) {
    let locked!: () => void;
    let open!: () => void;
    const ready = new Promise<void>((r) => { locked = r; });
    const gate = new Promise<void>((r) => { open = r; });
    const done = db.transaction(async (tx) => {
      await lockSeries(tx, sid);
      await whileHeld?.(tx);
      locked();
      await gate;
      return Date.now();
    });
    await ready;
    return { release: (): Promise<number> => { open(); return done; } };
  }

  let dbName = '';
  beforeAll(async () => {
    const res = await pg().execute(sql`SELECT current_database() AS name`);
    dbName = (res as unknown as { rows: Array<{ name: string }> }).rows[0].name;
  });

  /**
   * Poll pg_stat_activity until `n` backends of this test database are blocked on a lock (no timers in the assertions).
   * Uses its own connection: the test pool is small and the holder plus the blocked requests can occupy all of it.
   */
  async function waitForLockWaiters(n: number, timeoutMs = 10_000): Promise<void> {
    const monitor = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    try {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const { rows } = await monitor.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'`, [dbName]);
        if (rows[0].n >= n) return;
        if (Date.now() > deadline) throw new Error(`expected ${n} backends waiting on a lock, saw ${rows[0].n}`);
        await new Promise((r) => setImmediate(r));
      }
    } finally {
      await monitor.end();
    }
  }

  it('event adds queue behind the series lock and still get distinct orders', async () => {
    const sid = await createSeriesApi();
    const ids = await Promise.all(Array.from({ length: 4 }, newMatchId));
    const holder = await hold(sid);
    let finished = 0;
    const pending = Promise.all(ids.map(async (m) => {
      const res = await addEventApi(sid, { event_type: 'match', match_id: m });
      finished++;
      return res;
    }));
    await waitForLockWaiters(4);
    expect(finished).toBe(0); // all four are blocked on the lock the holder still owns
    const releaseTime = await holder.release();
    const results = await pending;
    expect(finished).toBe(4);
    expect(releaseTime).toBeGreaterThan(0);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(await ordersOf(sid)).toEqual([1, 2, 3, 4]);
  });

  it('an edit and a series start racing on the lock never interleave: the edit lands before the start or is refused after it', async () => {
    const sid = await createSeriesApi();
    const ev = (await addEventApi(sid, { event_type: 'match', match_id: await newMatchId() })).data.id;
    const holder = await hold(sid);
    const pending = Promise.all([
      appRequest(`/api/series/${sid}/events/${ev}`, { method: 'PATCH', json: { points_multiplier: 4 } }),
      transitionSeriesApi(sid, 'active'),
    ]);
    await waitForLockWaiters(2);
    await holder.release();
    const [edit, start] = await pending;
    expect(start.status).toBe(200);
    expect([200, 409]).toContain(edit.status);
    const [row] = await pg().select({ m: seriesEvents.points_multiplier }).from(seriesEvents).where(eq(seriesEvents.id, ev));
    expect(row.m).toBe(edit.status === 200 ? 4 : 1);
  });

  it('a status change committed while an edit is queued on the lock turns the edit into a 409 (the early check passed)', async () => {
    const sid = await createSeriesApi();
    const ev = (await addEventApi(sid, { event_type: 'match', match_id: await newMatchId() })).data.id;
    // the holder starts the series inside its own transaction; the PATCH below already passed the route's lock-free
    // status check ('created') and is now waiting for the row lock
    const holder = await hold(sid, (tx) => transitionSeriesStatus(tx, sid, 'created', 'active'));
    const pending = appRequest(`/api/series/${sid}/events/${ev}`, { method: 'PATCH', json: { points_multiplier: 4 } });
    await waitForLockWaiters(1);
    await holder.release();
    const edit = await pending;
    expect(edit.status).toBe(409);
    expect(edit.data.error).toMatch(/before the series starts/);
    const [row] = await pg().select({ m: seriesEvents.points_multiplier }).from(seriesEvents).where(eq(seriesEvents.id, ev));
    expect(row.m).toBe(1);
  });
});
