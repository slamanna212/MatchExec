// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile } from '../utils/pg-test-db';
import { seedQueueFixtures } from '../utils/pg-queue-fixtures';
import { db } from '../../lib/db';
import { discordAnnouncementQueue } from '../../lib/db/schema';
import { postEventAnnouncement } from '../../shared/discord-announcements';
import * as queues from '../../src/lib/discord-queues';

vi.mock('../../src/lib/logger/server', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));

setupPgTestFile();
beforeEach(async () => { await seedQueueFixtures(); });

const event = { id: 'm1', name: 'Test Match', description: 'd', game_id: 'g', type: 'competitive' as const, maps: [], max_participants: 10, guild_id: 'guild' };

describe('postEventAnnouncement (shared/discord-announcements)', () => {
  it('queues one pending standard announcement keyed by the event id', async () => {
    expect(await postEventAnnouncement(event)).toBe(true);
    const rows = await db.select().from(discordAnnouncementQueue);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ match_id: 'm1', announcement_type: 'standard', status: 'pending' });
  });

  it('does not queue a second announcement for the same event, whatever its status', async () => {
    await postEventAnnouncement(event);
    await db.update(discordAnnouncementQueue).set({ status: 'completed' });
    expect(await postEventAnnouncement(event)).toBe(true);
    expect(await db.select().from(discordAnnouncementQueue)).toHaveLength(1);
  });

  it('returns false when the insert fails', async () => {
    const spy = vi.spyOn(queues, 'enqueueAnnouncement').mockRejectedValueOnce(new Error('down'));
    expect(await postEventAnnouncement(event)).toBe(false);
    spy.mockRestore();
  });
});
