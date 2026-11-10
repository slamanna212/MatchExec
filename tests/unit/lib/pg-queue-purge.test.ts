// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { seedQueueFixtures } from '../../utils/pg-queue-fixtures';
import { db } from '../../../lib/db';
import {
  discordAnnouncementQueue, discordReminderQueue, discordSeriesUpdateQueue, discordStatsReportQueue, matches, series,
  voiceCleanupSchedules,
} from '../../../lib/db/schema';
import { purgeQueue, purgeQueues } from '../../../src/lib/queues/purge';

setupPgTestFile({ resetBetweenTests: true });
beforeEach(async () => { await seedQueueFixtures(); });

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);
const ids = async (table: typeof discordAnnouncementQueue | typeof discordReminderQueue | typeof discordStatsReportQueue | typeof discordSeriesUpdateQueue) =>
  (await db.select({ id: table.id }).from(table)).map((r) => r.id).sort();

describe('purgeQueue retention', () => {
  it('deletes completed rows after 7 days and failed rows after 30, never pending/processing', async () => {
    await db.insert(discordAnnouncementQueue).values([
      { id: 'done-old', match_id: 'm1', status: 'completed', processed_at: ago(8 * DAY) },
      { id: 'done-new', match_id: 'm1', status: 'completed', processed_at: ago(6 * DAY) },
      { id: 'failed-8d', match_id: 'm1', status: 'failed', processed_at: ago(8 * DAY) },
      { id: 'failed-31d', match_id: 'm1', status: 'failed', processed_at: ago(31 * DAY) },
      { id: 'pending-old', match_id: 'm1', status: 'pending', created_at: ago(90 * DAY) },
      { id: 'processing-old', match_id: 'm1', status: 'processing', created_at: ago(90 * DAY) },
      // finished before processed_at existed: falls back to created_at
      { id: 'legacy-done', match_id: 'm1', status: 'completed', processed_at: null, created_at: ago(40 * DAY) },
    ]);
    expect(await purgeQueue(db, 'announcement')).toBe(3);
    expect(await ids(discordAnnouncementQueue)).toEqual(['done-new', 'failed-8d', 'pending-old', 'processing-old']);
  });

  it('keeps reminder and stats-report rows while their match is still in play (they dedupe re-enqueues)', async () => {
    await db.insert(discordReminderQueue).values([
      { id: 'r-live', match_id: 'm1', reminder_type: 'match_reminder', minutes_before: 10, reminder_time: ago(10 * DAY), scheduled_for: ago(10 * DAY), status: 'completed', processed_at: ago(10 * DAY) },
      { id: 'r-done', match_id: 'm2', reminder_type: 'match_reminder', minutes_before: 10, reminder_time: ago(10 * DAY), scheduled_for: ago(10 * DAY), status: 'completed', processed_at: ago(10 * DAY) },
    ]);
    await db.insert(discordStatsReportQueue).values([
      { id: 's-live', match_id: 'm1', status: 'completed', processed_at: ago(10 * DAY) },
      { id: 's-done', match_id: 'm2', status: 'completed', processed_at: ago(10 * DAY) },
    ]);
    await db.update(matches).set({ status: 'complete' }).where(eq(matches.id, 'm2'));

    await purgeQueues(db);
    expect(await ids(discordReminderQueue)).toEqual(['r-live']);
    expect(await ids(discordStatsReportQueue)).toEqual(['s-live']);
  });

  it('keeps series posts with a dedupe key until the series is finished; keyless posts follow the normal window', async () => {
    await db.insert(series).values([
      { id: 'active', name: 'Active', status: 'active', scoring_type: 'Normal' },
      { id: 'over', name: 'Over', status: 'complete', scoring_type: 'Normal' },
    ] as never);
    const old = { status: 'completed' as const, processed_at: ago(10 * DAY) };
    await db.insert(discordSeriesUpdateQueue).values([
      { id: 'a-week', series_id: 'active', kind: 'weekly_schedule', dedupe_key: 'week:1', ...old },
      { id: 'a-nokey', series_id: 'active', kind: 'standings', dedupe_key: null, ...old },
      { id: 'o-week', series_id: 'over', kind: 'weekly_schedule', dedupe_key: 'week:1', ...old },
    ] as never);
    await purgeQueue(db, 'seriesUpdate');
    expect(await ids(discordSeriesUpdateQueue)).toEqual(['a-week']);
  });

  it('purgeQueues covers every queue and removes voice cleanup deadlines older than a week', async () => {
    await db.insert(discordAnnouncementQueue).values({ id: 'x', match_id: 'm1', status: 'completed', processed_at: ago(8 * DAY) });
    await db.insert(voiceCleanupSchedules).values([
      { match_id: 'old', cleanup_after: ago(8 * DAY) },
      { match_id: 'recent', cleanup_after: ago(1 * DAY) },
    ]);
    const result = await purgeQueues(db);
    expect(result).toEqual({ queues: { announcement: 1 }, voiceCleanupSchedules: 1, total: 2 });
    expect((await db.select().from(voiceCleanupSchedules)).map((r) => r.match_id)).toEqual(['recent']);
  });
});
