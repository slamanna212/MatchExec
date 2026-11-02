// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  activeJobCount, beginJob, getLocalState, isPaused, resetLocalMaintenance, setLocalState, trackJob, waitForQuiesce,
} from '../../../lib/maintenance';
import { nonOverlapping } from '../../../src/lib/queues/worker';

afterEach(() => resetLocalMaintenance());

describe('in-process maintenance state', () => {
  it('beginJob / trackJob count work in flight; ending twice is harmless', async () => {
    const end = beginJob();
    expect(activeJobCount()).toBe(1);
    end();
    end();
    expect(activeJobCount()).toBe(0);
    await expect(trackJob(async () => { expect(activeJobCount()).toBe(1); return 7; })).resolves.toBe(7);
    await expect(trackJob(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(activeJobCount()).toBe(0);
  });

  it('isPaused follows the local state', () => {
    expect(isPaused()).toBe(false);
    setLocalState('maintenance');
    expect(isPaused()).toBe(true);
    setLocalState('restoring');
    expect(getLocalState()).toBe('restoring');
    setLocalState('normal');
    expect(isPaused()).toBe(false);
  });
});

describe('nonOverlapping and maintenance', () => {
  it('a running tick counts as in-flight work and is released on success and on error', async () => {
    let seen = -1;
    const tick = nonOverlapping(async () => { seen = activeJobCount(); });
    expect(await tick()).toBe(true);
    expect(seen).toBe(1);
    expect(activeJobCount()).toBe(0);
    const failing = nonOverlapping(async () => { throw new Error('boom'); }, () => undefined);
    expect(await failing()).toBe(true);
    expect(activeJobCount()).toBe(0);
  });

  it('is skipped (returns false, task not run) while paused, and runs again afterwards', async () => {
    let runs = 0;
    const tick = nonOverlapping(async () => { runs++; });
    setLocalState('maintenance');
    expect(await tick()).toBe(false);
    setLocalState('restoring');
    expect(await tick()).toBe(false);
    expect(runs).toBe(0);
    setLocalState('normal');
    expect(await tick()).toBe(true);
    expect(runs).toBe(1);
  });

  it('still refuses to overlap itself', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const tick = nonOverlapping(() => gate);
    const first = tick();
    expect(await tick()).toBe(false);
    release();
    expect(await first).toBe(true);
  });
});

describe('waitForQuiesce', () => {
  const startedAt = new Date('2026-11-02T10:00:00Z');
  const poolWith = (rows: () => unknown[]): Pool => ({ query: async () => ({ rows: rows() }) }) as unknown as Pool;
  const worker = (id: string, ack: boolean, at: string) => ({ worker_id: id, service: id.split(':')[0], pid: 1, paused_ack: ack, heartbeat_at: new Date(at) });

  it('succeeds once every fresh worker has acknowledged after maintenance started (and with no workers at all)', async () => {
    expect(await waitForQuiesce(poolWith(() => []), { startedAt, timeoutMs: 100, pollMs: 10 })).toEqual({ ok: true, workers: 0 });
    const ok = poolWith(() => [worker('bot:h:1', true, '2026-11-02T10:00:01Z'), worker('web:h:2', true, '2026-11-02T10:00:02Z')]);
    expect(await waitForQuiesce(ok, { startedAt, timeoutMs: 100, pollMs: 10 })).toEqual({ ok: true, workers: 2 });
  });

  it('an ack from before maintenance started does not count; the culprits are named on timeout', async () => {
    const stale = poolWith(() => [worker('bot:h:1', true, '2026-11-02T09:59:59Z'), worker('web:h:2', true, '2026-11-02T10:00:02Z'), worker('scheduler:h:3', false, '2026-11-02T10:00:02Z')]);
    const res = await waitForQuiesce(stale, { startedAt, timeoutMs: 60, pollMs: 10 });
    expect(res).toEqual({ ok: false, pending: ['bot (bot:h:1)', 'scheduler (scheduler:h:3)'] });
  });

  it('waits for a worker that acknowledges later', async () => {
    let calls = 0;
    const pool = poolWith(() => (++calls < 4 ? [worker('bot:h:1', false, '2026-11-02T10:00:05Z')] : [worker('bot:h:1', true, '2026-11-02T10:00:06Z')]));
    expect(await waitForQuiesce(pool, { startedAt, timeoutMs: 2000, pollMs: 10 })).toEqual({ ok: true, workers: 1 });
    expect(calls).toBeGreaterThanOrEqual(4);
  });
});
