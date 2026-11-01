// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { seedQueueFixtures } from '../../utils/pg-queue-fixtures';
import { beforeEach } from 'vitest';
import { db } from '../../../lib/db';
import { discordAnnouncementQueue } from '../../../lib/db/schema';
import { getAnnouncementStatus, processMatchAnnouncements } from '../../../src/lib/reminder-helpers';

vi.mock('@/lib/logger/server', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));

setupPgTestFile();
beforeEach(async () => { await seedQueueFixtures(); });

const hour = { id: '1hour', value: 1, unit: 'hours' as const };

describe('getAnnouncementStatus', () => {
  it('pending / scheduled when nothing is queued, depending on the announcement time', async () => {
    const future = await getAnnouncementStatus(db, 'm1', hour, new Date(Date.now() + 3_600_000));
    expect(future).toEqual({ status: 'pending', sentAt: null, errorMessage: null });
    expect((await getAnnouncementStatus(db, 'm1', hour, new Date(Date.now() - 3_600_000))).status).toBe('scheduled');
  });

  it('reports a completed queue row as sent (ISO timestamp) and keeps other statuses and errors', async () => {
    const posted = new Date('2025-12-01T13:30:00Z');
    await db.insert(discordAnnouncementQueue).values({ id: 'q1', match_id: 'm1', announcement_type: 'timed', announcement_data: hour, status: 'completed', posted_at: posted });
    const done = await getAnnouncementStatus(db, 'm1', hour, new Date(Date.now() + 3_600_000));
    expect(done).toEqual({ status: 'sent', sentAt: posted.toISOString(), errorMessage: null });

    const min = { id: '30min', value: 30, unit: 'minutes' as const };
    await db.insert(discordAnnouncementQueue).values({ id: 'q2', match_id: 'm1', announcement_type: 'timed', announcement_data: min, status: 'failed', last_error: 'boom' });
    expect(await getAnnouncementStatus(db, 'm1', min, new Date())).toEqual({ status: 'failed', sentAt: null, errorMessage: 'boom' });
    await db.update(discordAnnouncementQueue).set({ status: 'pending', last_error: null }).where(eq(discordAnnouncementQueue.id, 'q2'));
    expect((await getAnnouncementStatus(db, 'm1', min, new Date())).status).toBe('pending');
  });
});

describe('processMatchAnnouncements', () => {
  it('returns [] when announcements are disabled', async () => {
    expect(await processMatchAnnouncements(db, 'm1', false, new Date().toISOString(), new Date().toISOString())).toEqual([]);
    expect(await processMatchAnnouncements(db, 'm1', 0, new Date().toISOString(), new Date().toISOString())).toEqual([]);
  });

  it('processes JSON string and boolean-true (default) announcements', async () => {
    const start = new Date(Date.now() + 7_200_000).toISOString();
    const one = await processMatchAnnouncements(db, 'm1', JSON.stringify([hour]), start, new Date().toISOString());
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ id: 'announcement_1hour', match_id: 'm1' });
    expect(await processMatchAnnouncements(db, 'm1', true, start, new Date().toISOString())).toHaveLength(2);
  });
});
