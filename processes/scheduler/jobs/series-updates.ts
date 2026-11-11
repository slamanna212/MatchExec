import { db as pgDb, type Db, type Executor } from '../../../lib/db';
import { logger } from '../../../src/lib/logger/server';
import { advanceActiveSeries } from '../../../src/lib/series/playoffs';
import { enqueueDueSeriesUpdates, type EnqueueDueResult } from '../../../src/lib/series/updates';

/** Cron expression of the job: every 15 minutes. */
export const SERIES_UPDATES_CRON = '*/15 * * * *';

/**
 * Advances running seasons (`advanceActiveSeries`: completes stages whose events are all played and seeds decided
 * playoffs), then queues the weekly schedule and standings posts that are due for active series (what is due, and the dedupe per
 * `week:<n>`, is decided in `src/lib/series/updates.ts`). The scheduler wraps `run` in `nonOverlapping` and only the
 * leader-lock holder runs cron jobs at all.
 */
export class SeriesUpdatesJob {
  constructor(private db: Executor = pgDb) {}

  async run(now: Date = new Date()): Promise<EnqueueDueResult> {
    // First move seasons along (finished stages complete, decided playoffs are seeded), so this run's posts see it.
    try {
      const advanced = await advanceActiveSeries(this.db as Db);
      if (advanced.completed_stages > 0 || advanced.seeded > 0) {
        logger.info(`Series progression: ${advanced.completed_stages} stage(s) completed, ${advanced.seeded} playoff(s) seeded`);
      }
    } catch (error) {
      logger.error('Series progression failed:', error);
    }
    const result = await enqueueDueSeriesUpdates(this.db, now);
    if (result.enqueued > 0) logger.info(`Series updates: queued ${result.enqueued} post(s) for ${result.series_checked} active series`);
    else logger.debug(`Series updates: nothing due (${result.series_checked} active series)`);
    return result;
  }
}
