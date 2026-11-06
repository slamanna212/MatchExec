import { db as pgDb, type Executor } from '../../../lib/db';
import { logger } from '../../../src/lib/logger/server';
import { enqueueDueSeriesUpdates, type EnqueueDueResult } from '../../../src/lib/series/updates';

/** Cron expression of the job: every 15 minutes. */
export const SERIES_UPDATES_CRON = '*/15 * * * *';

/**
 * Queues the weekly schedule and standings posts that are due for active series (what is due, and the dedupe per
 * `week:<n>`, is decided in `src/lib/series/updates.ts`). The scheduler wraps `run` in `nonOverlapping` and only the
 * leader-lock holder runs cron jobs at all.
 */
export class SeriesUpdatesJob {
  constructor(private db: Executor = pgDb) {}

  async run(now: Date = new Date()): Promise<EnqueueDueResult> {
    const result = await enqueueDueSeriesUpdates(this.db, now);
    if (result.enqueued > 0) logger.info(`Series updates: queued ${result.enqueued} post(s) for ${result.series_checked} active series`);
    else logger.debug(`Series updates: nothing due (${result.series_checked} active series)`);
    return result;
  }
}
