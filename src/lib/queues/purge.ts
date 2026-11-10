/**
 * Retention for the queue / job tables (run daily by the scheduler). Finished rows are only history once a worker is done
 * with them, but without a purge every queue grows forever while the bot polls it every few seconds.
 *
 *  - `completed` / `sent` rows: kept `COMPLETED_RETENTION_MS` (7 days) after they finished
 *  - `failed` rows: kept `FAILED_RETENTION_MS` (30 days), so they stay visible for troubleshooting
 *  - rows that double as a dedupe record are kept while they still guard something:
 *      reminder / playerReminder  "a reminder for this match exists" -> kept until the match is complete/cancelled/deleted
 *      statsReport                 one report per match (unique)      -> same
 *      seriesUpdate with a dedupe_key ('week:3')                      -> kept until the series is complete/cancelled
 *  - `voice_cleanup_schedules`: deadlines more than 7 days in the past (the channels are long gone)
 *
 * `pending` and `processing` rows are never touched. Rows finished before `processed_at` existed fall back to `created_at`.
 */
import { and, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { discordSeriesUpdateQueue, matches, series, voiceCleanupSchedules } from '../../../lib/db/schema';
import { QUEUE_NAMES, workerColumns, type QueueName } from './registry';

const DAY_MS = 24 * 60 * 60 * 1000;
export const COMPLETED_RETENTION_MS = 7 * DAY_MS;
export const FAILED_RETENTION_MS = 30 * DAY_MS;
export const VOICE_SCHEDULE_RETENTION_MS = 7 * DAY_MS;

/** Queues whose rows also act as "already queued for this match" records. */
const MATCH_GATED: readonly QueueName[] = ['reminder', 'playerReminder', 'statsReport'];

const cutoff = (now: Date, ms: number): SQL => sql`${new Date(now.getTime() - ms).toISOString()}::timestamptz`;

/** Extra condition a finished row must meet before it may be deleted (see the module comment). */
function retentionGuard(queue: QueueName): SQL | undefined {
  if (MATCH_GATED.includes(queue)) {
    const { table } = workerColumns(queue);
    const matchId = (table as unknown as { match_id: typeof matches.id }).match_id;
    return sql`NOT EXISTS (SELECT 1 FROM ${matches} WHERE ${matches.id} = ${matchId} AND ${matches.status} NOT IN ('complete', 'cancelled'))`;
  }
  if (queue === 'seriesUpdate') {
    return or(
      sql`${discordSeriesUpdateQueue.dedupe_key} IS NULL`,
      sql`NOT EXISTS (SELECT 1 FROM ${series} WHERE ${series.id} = ${discordSeriesUpdateQueue.series_id} AND ${series.status} NOT IN ('complete', 'cancelled'))`,
    );
  }
  return undefined;
}

/** Delete expired finished rows of one queue. Returns the number deleted. */
export async function purgeQueue(ex: Executor, queue: QueueName, now = new Date()): Promise<number> {
  const { table, c } = workerColumns(queue);
  const finishedAt = sql`coalesce(${c.processed_at}, ${c.created_at})`;
  const expired = or(
    and(inArray(c.status, ['completed', 'sent']), sql`${finishedAt} < ${cutoff(now, COMPLETED_RETENTION_MS)}`),
    and(inArray(c.status, ['failed']), sql`${finishedAt} < ${cutoff(now, FAILED_RETENTION_MS)}`),
  );
  const rows = await ex.delete(table).where(and(expired, retentionGuard(queue))).returning({ id: c.id });
  return rows.length;
}

export interface PurgeResult {
  /** Rows deleted per queue (queues with nothing deleted are omitted). */
  queues: Partial<Record<QueueName, number>>;
  voiceCleanupSchedules: number;
  total: number;
}

/** Apply the retention rules to every queue and to `voice_cleanup_schedules`. */
export async function purgeQueues(ex: Executor, now = new Date()): Promise<PurgeResult> {
  const result: PurgeResult = { queues: {}, voiceCleanupSchedules: 0, total: 0 };
  for (const queue of QUEUE_NAMES) {
    const n = await purgeQueue(ex, queue, now);
    if (n > 0) result.queues[queue] = n;
    result.total += n;
  }
  const schedules = await ex
    .delete(voiceCleanupSchedules)
    .where(lt(voiceCleanupSchedules.cleanup_after, new Date(now.getTime() - VOICE_SCHEDULE_RETENTION_MS)))
    .returning({ id: voiceCleanupSchedules.match_id });
  result.voiceCleanupSchedules = schedules.length;
  result.total += schedules.length;
  return result;
}
