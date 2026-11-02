/**
 * Restore coordination (plan 6.4). The state lives in the `control` schema (excluded from dumps, never swapped by a restore):
 *
 *   control.maintenance  one row: state = normal | maintenance (draining) | restoring, reason, started_at
 *   control.workers      one row per running process: heartbeat_at + paused_ack
 *
 * Every process (web, bot, scheduler, stats) runs `startWorkerControl()`: once a second it records a heartbeat, reads the
 * maintenance state, and while maintenance is on it reports `paused_ack = true` as soon as it has no work in flight. Work
 * is tracked in-process with `beginJob()` / `trackJob()` (`nonOverlapping` ticks do it for every queue worker and cron job;
 * the web server counts in-flight requests). The restore waits for every worker with a fresh heartbeat to acknowledge.
 *
 * `isPaused()` is a synchronous, in-process view of the state so a worker can check it before claiming work.
 */
import { hostname } from 'node:os';
import type { Pool } from 'pg';
import { getPool } from './db';

export type MaintenanceState = 'normal' | 'maintenance' | 'restoring';

/** Held (session-level) by the process that is running a restore. */
export const RESTORE_LOCK_ID = 7_310_150_002;
/** Reason prefix of a failed rollback: the stale-maintenance recovery never clears this one automatically. */
export const ROLLBACK_FAILED_REASON = 'restore-rollback-failed';

const DEFAULT_TICK_MS = 1000;
const DEFAULT_STALE_MS = 15_000;

// ─── In-process state ────────────────────────────────────────────────────────

const local = { state: 'normal' as MaintenanceState, jobs: 0 };

/** True while the system is draining or restoring: workers must not start new work. */
export function isPaused(): boolean {
  return local.state !== 'normal';
}

export function getLocalState(): MaintenanceState {
  return local.state;
}

/** Set by the heartbeat tick, and immediately by the process that starts or ends a restore. */
export function setLocalState(state: MaintenanceState): void {
  local.state = state;
}

/** Number of jobs currently running in this process. */
export function activeJobCount(): number {
  return local.jobs;
}

/** Mark the start of a unit of work; call the returned function exactly once when it is done. */
export function beginJob(): () => void {
  local.jobs++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    local.jobs--;
  };
}

export async function trackJob<T>(fn: () => Promise<T>): Promise<T> {
  const end = beginJob();
  try {
    return await fn();
  } finally {
    end();
  }
}

/** Test helper. */
export function resetLocalMaintenance(): void {
  local.state = 'normal';
  local.jobs = 0;
}

// ─── control.maintenance ─────────────────────────────────────────────────────

export interface MaintenanceRow {
  state: MaintenanceState;
  reason: string | null;
  started_at: Date | null;
}

export async function getMaintenance(pool: Pool = getPool()): Promise<MaintenanceRow> {
  const r = await pool.query<MaintenanceRow>('SELECT state, reason, started_at FROM control.maintenance WHERE id = 1');
  return r.rows[0] ?? { state: 'normal', reason: null, started_at: null };
}

/** Atomically switch normal -> maintenance. Returns the DB-clock start time, or null when maintenance is already on. */
export async function enterMaintenance(pool: Pool, reason: string): Promise<Date | null> {
  const r = await pool.query<{ started_at: Date }>(
    `INSERT INTO control.maintenance (id, state, reason, started_at) VALUES (1, 'maintenance', $1, now())
     ON CONFLICT (id) DO UPDATE SET state = 'maintenance', reason = EXCLUDED.reason, started_at = now()
       WHERE control.maintenance.state = 'normal'
     RETURNING started_at`,
    [reason],
  );
  return r.rows[0]?.started_at ?? null;
}

export async function setMaintenanceState(pool: Pool, state: 'maintenance' | 'restoring', reason?: string): Promise<void> {
  await pool.query(`UPDATE control.maintenance SET state = $1, reason = COALESCE($2, reason) WHERE id = 1`, [state, reason ?? null]);
}

export async function exitMaintenance(pool: Pool): Promise<void> {
  await pool.query(`UPDATE control.maintenance SET state = 'normal', reason = NULL, started_at = NULL WHERE id = 1`);
}

// ─── control.workers ─────────────────────────────────────────────────────────

export interface WorkerRow {
  worker_id: string;
  service: string;
  pid: number | null;
  heartbeat_at: Date;
  paused_ack: boolean;
}

export async function listFreshWorkers(pool: Pool, staleMs = DEFAULT_STALE_MS): Promise<WorkerRow[]> {
  const r = await pool.query<WorkerRow>(
    `SELECT worker_id, service, pid, heartbeat_at, paused_ack FROM control.workers
     WHERE heartbeat_at > now() - ($1::double precision * interval '1 millisecond') ORDER BY service, worker_id`,
    [staleMs],
  );
  return r.rows;
}

export async function pruneDeadWorkers(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM control.workers WHERE heartbeat_at < now() - interval '1 hour'`);
}

export interface QuiesceOptions {
  startedAt: Date;
  timeoutMs?: number;
  pollMs?: number;
  staleMs?: number;
}

export type QuiesceResult = { ok: true; workers: number } | { ok: false; pending: string[] };

/**
 * Wait until every worker with a fresh heartbeat has acknowledged the pause (an ack counts only when its heartbeat is newer than
 * the moment maintenance was switched on). On timeout, lists the processes that did not quiesce.
 */
export async function waitForQuiesce(pool: Pool, options: QuiesceOptions): Promise<QuiesceResult> {
  const timeoutMs = options.timeoutMs ?? Number.parseInt(process.env.MATCHEXEC_QUIESCE_TIMEOUT_MS ?? '60000', 10);
  const pollMs = options.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const workers = await listFreshWorkers(pool, options.staleMs);
    const pending = workers.filter((w) => !(w.paused_ack && w.heartbeat_at.getTime() >= options.startedAt.getTime()));
    if (pending.length === 0) return { ok: true, workers: workers.length };
    if (Date.now() >= deadline) return { ok: false, pending: pending.map((w) => `${w.service} (${w.worker_id})`) };
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// ─── Heartbeat loop ──────────────────────────────────────────────────────────

export interface WorkerControlOptions {
  service: string;
  pool?: Pool;
  workerId?: string;
  intervalMs?: number;
  /** Extra in-flight work besides `beginJob()` jobs (the web server's request counter). */
  busy?: () => number;
  /** Called when maintenance ends (the process should reload its settings). */
  onResume?: () => void | Promise<void>;
  /** Called when maintenance starts. */
  onPause?: () => void | Promise<void>;
  /** Log sink for recoverable problems (default: silent). */
  log?: (message: string, error?: unknown) => void;
}

export interface WorkerControl {
  workerId: string;
  /** One heartbeat now (the interval calls this too). */
  tick(): Promise<void>;
  stop(): Promise<void>;
}

export function makeControlWorkerId(service: string): string {
  return `${service}:${hostname()}:${process.pid}`;
}

/**
 * Maintenance state older than its restore: the restoring process holds RESTORE_LOCK_ID for the whole restore, so a non-normal
 * state with a FREE lock means that process died. Returns true when the state was reset.
 */
export async function recoverStaleMaintenance(pool: Pool): Promise<boolean> {
  const row = await getMaintenance(pool);
  if (row.state === 'normal' || row.reason?.startsWith(ROLLBACK_FAILED_REASON)) return false;
  const client = await pool.connect();
  try {
    const got = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS ok', [RESTORE_LOCK_ID]);
    if (!got.rows[0]?.ok) return false;
    try {
      await client.query(`UPDATE control.maintenance SET state = 'normal', reason = NULL, started_at = NULL WHERE id = 1 AND state <> 'normal'`);
      return true;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [RESTORE_LOCK_ID]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

export function startWorkerControl(options: WorkerControlOptions): WorkerControl {
  const pool = options.pool ?? getPool();
  const workerId = options.workerId ?? makeControlWorkerId(options.service);
  const intervalMs = options.intervalMs ?? Number.parseInt(process.env.MATCHEXEC_WORKER_TICK_MS ?? String(DEFAULT_TICK_MS), 10);
  const log = options.log ?? (() => undefined);
  let running = false;
  let stopped = false;
  let current: Promise<void> = Promise.resolve();

  const runTick = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      const before = local.state;
      let state = (await getMaintenance(pool)).state;
      if (state !== 'normal' && (await recoverStaleMaintenance(pool).catch(() => false))) {
        log('cleared stale maintenance state (the restoring process is gone)');
        state = 'normal';
      }
      // From here to the heartbeat write there is no await between flagging the pause and sampling the busy count, so a
      // job cannot slip in between "state flagged" and "ack computed".
      local.state = state;
      const busy = local.jobs + (options.busy?.() ?? 0);
      const ack = state !== 'normal' && busy === 0;
      await pool.query(
        `INSERT INTO control.workers (worker_id, service, pid, heartbeat_at, paused_ack) VALUES ($1, $2, $3, now(), $4)
         ON CONFLICT (worker_id) DO UPDATE SET heartbeat_at = now(), paused_ack = EXCLUDED.paused_ack, service = EXCLUDED.service, pid = EXCLUDED.pid`,
        [workerId, options.service, process.pid, ack],
      );
      if (before === 'normal' && state !== 'normal') await options.onPause?.();
      if (before !== 'normal' && state === 'normal') await options.onResume?.();
    } catch (error) {
      log('worker heartbeat failed', error);
    } finally {
      running = false;
    }
  };

  // The interval skips a tick while the previous one is still running; an explicit tick() waits for it and then runs a fresh one.
  const tick = async (): Promise<void> => {
    await current;
    current = runTick();
    await current;
  };

  const timer = setInterval(() => { if (!running) current = runTick(); }, intervalMs);
  timer.unref();
  current = runTick();

  return {
    workerId,
    tick,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pool.query('DELETE FROM control.workers WHERE worker_id = $1', [workerId]).catch(() => undefined);
    },
  };
}
