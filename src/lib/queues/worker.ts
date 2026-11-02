/**
 * Worker concurrency contract (plan 1.4) for every queue / job table.
 *
 *  - claim:       atomic `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *`;
 *                 only the rows returned are owned by the caller. A claim counts as one attempt.
 *  - complete:    `processing` -> `completed` (or `sent`).
 *  - fail:        back to `pending` with exponential backoff (`next_attempt_at`), or to `failed` once
 *                 `attempts >= max_attempts` (or when the failure is permanent). The error is recorded.
 *  - release:     give a claim back without spending an attempt (e.g. "not ready yet").
 *  - abandoned:   claims older than the queue's timeout (crashed worker) are reset to `pending` (or failed).
 *  - external:    `external_message_id` is written right after the Discord post, and checked before re-sending.
 *
 * Every function takes an `Executor` so it can run inside a transaction; none of them performs network calls.
 */
import { hostname } from 'node:os';
import { and, asc, eq, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { beginJob, isPaused } from '../../../lib/maintenance';
import {
  EXTERNAL_RESULT_QUEUES, QUEUE_NAMES, queueConfig, workerColumns,
  type ExternalResultQueue, type FinalStatus, type QueueName, type QueueRow,
} from './registry';

/** Retry delay: `base * 2^(attempts-1)` capped at `max` (30s, 60s, 2m, 4m ... 15m). */
export const DEFAULT_BACKOFF_BASE_MS = 30_000;
export const DEFAULT_BACKOFF_MAX_MS = 15 * 60_000;

export function backoffMs(attempts: number, baseMs = DEFAULT_BACKOFF_BASE_MS, maxMs = DEFAULT_BACKOFF_MAX_MS): number {
  return Math.min(baseMs * 2 ** Math.max(0, attempts - 1), maxMs);
}

/** Identifier written to `claimed_by`: role + host + pid. */
export function makeWorkerId(role: string): string {
  return `${role}:${hostname()}:${process.pid}`;
}

const intervalMs = (ms: number): SQL => sql`(${Math.round(ms)}::double precision * interval '1 millisecond')`;

export interface ClaimOptions {
  /** Max rows to claim (default 5). */
  limit?: number;
  workerId?: string;
  /** Extra readiness condition, e.g. `lte(discordReminderQueue.reminder_time, sql\`now()\`)`. */
  where?: SQL;
}

/**
 * Atomically claim up to `limit` ready rows (`status='pending'` and `next_attempt_at` null or due), oldest first.
 * Safe to call from several connections / processes at once: rows locked by another claimer are skipped.
 */
export async function claimJobs<N extends QueueName>(ex: Executor, queue: N, opts: ClaimOptions = {}): Promise<QueueRow<N>[]> {
  const { table, c } = workerColumns(queue);
  const limit = opts.limit ?? 5;
  const ready = and(
    eq(c.status, 'pending'),
    or(isNull(c.next_attempt_at), lte(c.next_attempt_at, sql`now()`)),
    opts.where,
  );
  const candidates = ex
    .select({ id: c.id })
    .from(table)
    .where(ready)
    .orderBy(asc(c.created_at), asc(c.id))
    .limit(limit)
    .for('update', { skipLocked: true });
  const rows = await ex
    .update(table)
    .set({
      status: 'processing',
      claimed_at: sql`now()`,
      claimed_by: opts.workerId ?? makeWorkerId('worker'),
      attempts: sql`${c.attempts} + 1`,
    } as never)
    .where(inArray(c.id, candidates))
    .returning();
  // RETURNING order is unspecified: keep the oldest-first order the candidates were picked in.
  return (rows as unknown as Array<QueueRow<N> & { created_at: Date; id: string }>).sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id.localeCompare(b.id),
  ) as QueueRow<N>[];
}

/** Claim one specific row (used by request/response style callers). Returns undefined if it is not claimable. */
export async function claimJobById<N extends QueueName>(ex: Executor, queue: N, id: string, workerId?: string): Promise<QueueRow<N> | undefined> {
  const { table, c } = workerColumns(queue);
  const rows = await ex
    .update(table)
    .set({
      status: 'processing',
      claimed_at: sql`now()`,
      claimed_by: workerId ?? makeWorkerId('worker'),
      attempts: sql`${c.attempts} + 1`,
    } as never)
    .where(and(eq(c.id, id), eq(c.status, 'pending')))
    .returning();
  return rows[0] as QueueRow<N> | undefined;
}

export interface CompleteOptions {
  /** `sent` for scorecard_prompt / winner_vote, `completed` (default) for the rest. */
  status?: FinalStatus;
  /** Extra columns to set, e.g. `{ posted_at: new Date() }` or `{ result: {...} }`. */
  set?: Record<string, unknown>;
}

/** Mark a claimed row done. Returns false when the row was no longer `processing` (e.g. reset as abandoned). */
export async function completeJob(ex: Executor, queue: QueueName, id: string, opts: CompleteOptions = {}): Promise<boolean> {
  const { table, c } = workerColumns(queue);
  const rows = await ex
    .update(table)
    .set({ status: opts.status ?? 'completed', processed_at: sql`now()`, last_error: null, next_attempt_at: null, ...opts.set } as never)
    .where(and(eq(c.id, id), eq(c.status, 'processing')))
    .returning({ id: c.id });
  return rows.length > 0;
}

export interface FailOptions {
  /** Never retry (deterministic failure such as "no eligible recipients"). */
  permanent?: boolean;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Extra columns to set (e.g. a `result` payload). */
  set?: Record<string, unknown>;
}

/**
 * Record a failure of a claimed row: back to `pending` with backoff while attempts remain, otherwise `failed`.
 * Returns the resulting status, or undefined when the row was no longer `processing`.
 */
export async function failJob(ex: Executor, queue: QueueName, id: string, error: unknown, opts: FailOptions = {}): Promise<'pending' | 'failed' | undefined> {
  const { table, c } = workerColumns(queue);
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const base = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const max = opts.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const exhausted = sql`${c.attempts} >= ${c.max_attempts}`;
  const set = opts.permanent
    ? { status: 'failed', last_error: message, processed_at: sql`now()`, next_attempt_at: null, ...opts.set }
    : {
        status: sql`CASE WHEN ${exhausted} THEN 'failed' ELSE 'pending' END`,
        last_error: message,
        processed_at: sql`CASE WHEN ${exhausted} THEN now() ELSE ${c.processed_at} END`,
        next_attempt_at: sql`CASE WHEN ${exhausted} THEN NULL
          ELSE now() + least(${base}::double precision * power(2, greatest(${c.attempts} - 1, 0)), ${max}::double precision) * interval '1 millisecond' END`,
        ...opts.set,
      };
  const rows = await ex
    .update(table)
    .set(set as never)
    .where(and(eq(c.id, id), eq(c.status, 'processing')))
    .returning({ status: c.status });
  return rows[0]?.status as 'pending' | 'failed' | undefined;
}

/** Give a claim back without spending an attempt; the row becomes claimable again after `delayMs`. */
export async function releaseJob(ex: Executor, queue: QueueName, id: string, delayMs = 0): Promise<boolean> {
  const { table, c } = workerColumns(queue);
  const rows = await ex
    .update(table)
    .set({
      status: 'pending',
      attempts: sql`greatest(${c.attempts} - 1, 0)`,
      claimed_at: null,
      claimed_by: null,
      next_attempt_at: delayMs > 0 ? sql`now() + ${intervalMs(delayMs)}` : null,
    } as never)
    .where(and(eq(c.id, id), eq(c.status, 'processing')))
    .returning({ id: c.id });
  return rows.length > 0;
}

/** Put a finished/failed row back to `pending` with a fresh attempt budget (manual "retry" actions). */
export async function requeueJob(ex: Executor, queue: QueueName, id: string): Promise<boolean> {
  const { table, c } = workerColumns(queue);
  const rows = await ex
    .update(table)
    .set({ status: 'pending', attempts: 0, last_error: null, claimed_at: null, claimed_by: null, next_attempt_at: null, processed_at: null } as never)
    .where(eq(c.id, id))
    .returning({ id: c.id });
  return rows.length > 0;
}

/**
 * Reset claims older than each queue's timeout (the worker crashed mid-job): back to `pending` while attempts
 * remain, otherwise `failed` (`onAbandon: 'fail'` queues always fail). Returns the number of rows touched.
 */
export async function resetAbandonedClaims(ex: Executor, queues: readonly QueueName[] = QUEUE_NAMES, now?: Date): Promise<number> {
  let total = 0;
  for (const queue of queues) {
    const { table, c } = workerColumns(queue);
    const { abandonAfterMs, onAbandon } = queueConfig(queue);
    const cutoff = now ? sql`${now.toISOString()}::timestamptz` : sql`now()`;
    const fail = onAbandon === 'fail' ? sql`true` : sql`${c.attempts} >= ${c.max_attempts}`;
    const rows = await ex
      .update(table)
      .set({
        status: sql`CASE WHEN ${fail} THEN 'failed' ELSE 'pending' END`,
        last_error: 'Claim abandoned (worker timed out); reset',
        processed_at: sql`CASE WHEN ${fail} THEN ${cutoff} ELSE ${c.processed_at} END`,
        claimed_at: null,
        claimed_by: null,
        next_attempt_at: null,
      } as never)
      .where(and(eq(c.status, 'processing'), lte(c.claimed_at, sql`${cutoff} - ${intervalMs(abandonAfterMs)}`)))
      .returning({ id: c.id });
    total += rows.length;
  }
  return total;
}

/**
 * Record the Discord message id of a successful post on the job row, BEFORE any follow-up work, so a retry after
 * a crash can see the post already happened (see `alreadyPosted`).
 */
export async function recordExternalResult(ex: Executor, queue: ExternalResultQueue, id: string, externalMessageId: string): Promise<void> {
  const { table, c } = workerColumns(queue);
  await ex.update(table).set({ external_message_id: externalMessageId } as never).where(eq(c.id, id));
}

/** True when a claimed row already carries an external message id (a previous attempt posted it). */
export function alreadyPosted(row: { external_message_id?: string | null }): boolean {
  return !!row.external_message_id;
}

export function isExternalResultQueue(queue: QueueName): queue is ExternalResultQueue {
  return (EXTERNAL_RESULT_QUEUES as readonly string[]).includes(queue);
}

/** Delete finished rows (`completed`/`sent`/`failed`) whose `column` is older than `olderThanMs`. Returns the count. */
export async function purgeFinished(ex: Executor, queue: QueueName, olderThanMs: number, column: 'processed_at' | 'updated_at' = 'processed_at'): Promise<number> {
  const { table, c } = workerColumns(queue);
  const col = column === 'updated_at' ? (table as unknown as { updated_at: typeof c.id }).updated_at : c.processed_at;
  const rows = await ex
    .delete(table)
    .where(and(inArray(c.status, ['completed', 'sent', 'failed']), lte(col, sql`now() - ${intervalMs(olderThanMs)}`)))
    .returning({ id: c.id });
  return rows.length;
}

/** Number of `failed` rows across the given queues. */
export async function countFailed(ex: Executor, queues: readonly QueueName[]): Promise<number> {
  let total = 0;
  for (const queue of queues) {
    const { table, c } = workerColumns(queue);
    const rows = await ex.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(table).where(eq(c.status, 'failed'));
    total += rows[0]?.n ?? 0;
  }
  return total;
}

/**
 * Wrap a periodic task so a tick never starts while the previous one is still running (no overlapping ticks).
 * Errors are passed to `onError` and never escape (so a `setInterval` callback cannot reject unhandled).
 *
 * Restore coordination (plan 6.4): a tick is skipped while a backup restore is draining or running (`isPaused()`), and a
 * running tick counts as in-flight work so the restore waits for it to finish before it touches the database.
 * Returns false when the tick was skipped (previous run still going, or maintenance).
 */
export function nonOverlapping(task: () => Promise<unknown>, onError: (err: unknown) => void = () => {}): () => Promise<boolean> {
  let running = false;
  return async () => {
    if (running || isPaused()) return false;
    running = true;
    const endJob = beginJob();
    try {
      await task();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      endJob();
    }
    return true;
  };
}
