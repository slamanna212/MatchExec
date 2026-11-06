// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createMatch, seedBasicTestData } from '../../utils/pg-fixtures';
import { insertSeries, linkEvent } from '../../utils/pg-series-fixtures';
import { discordSeriesUpdateQueue } from '../../../lib/db/schema';

vi.mock('../../../src/lib/logger/server', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));

import { SERIES_UPDATES_CRON, SeriesUpdatesJob } from '../../../processes/scheduler/jobs/series-updates';
import { logger } from '../../../src/lib/logger/server';

setupPgTestFile();

const NOW = new Date('2026-03-10T12:00:00Z');
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe('SeriesUpdatesJob', () => {
  let gameId: string;
  let modeId: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
  });

  async function addMatch(seriesId: string, week: number, startHours: number, status: 'gather' | 'complete' = 'gather') {
    const m = await createMatch(gameId, modeId, { start_date: at(startHours), start_time: at(startHours), status });
    await linkEvent(seriesId, 'match', m.id, { week });
  }

  it('runs every 15 minutes', () => {
    expect(SERIES_UPDATES_CRON).toBe('*/15 * * * *');
  });

  it('queues due posts for active series and reports what it did', async () => {
    const s = await insertSeries({ status: 'active' });
    await addMatch(s.id, 1, -60, 'complete');
    await addMatch(s.id, 2, 20);
    const result = await new SeriesUpdatesJob().run(NOW);
    expect(result).toEqual({ series_checked: 1, enqueued: 2 });
    const rows = await getPgTestDb().select().from(discordSeriesUpdateQueue);
    expect(rows.map((r) => `${r.kind}/${r.dedupe_key}`).sort()).toEqual(['standings/week:1', 'weekly_schedule/week:2']);
    expect(logger.info).toHaveBeenCalled();
  });

  it('does nothing (and stays quiet at info level) when nothing is due, and a second run adds nothing', async () => {
    const s = await insertSeries({ status: 'active' });
    await addMatch(s.id, 1, 500);
    expect(await new SeriesUpdatesJob().run(NOW)).toEqual({ series_checked: 1, enqueued: 0 });
    expect(logger.info).not.toHaveBeenCalled();

    await addMatch(s.id, 2, 10);
    await new SeriesUpdatesJob().run(NOW);
    expect(await new SeriesUpdatesJob().run(NOW)).toMatchObject({ enqueued: 0 });
    expect(await getPgTestDb().select().from(discordSeriesUpdateQueue)).toHaveLength(1);
  });

  it('honours announcements = false', async () => {
    const s = await insertSeries({ status: 'active', announcements: false });
    await addMatch(s.id, 1, 10);
    expect(await new SeriesUpdatesJob().run(NOW)).toEqual({ series_checked: 0, enqueued: 0 });
  });
});
