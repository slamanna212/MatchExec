import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

// Mock the database-init that discord-announcements dynamically imports
vi.mock('../../src/lib/database-init', () => ({
  getDbInstance: vi.fn(),
}));

import { postEventAnnouncement } from '../../shared/discord-announcements';
import { getDbInstance } from '../../src/lib/database-init';

const mockGetDbInstance = getDbInstance as ReturnType<typeof vi.fn>;

describe('postEventAnnouncement (shared/discord-announcements)', () => {
  let mockDb: { get: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      get: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue(undefined),
    };
    mockGetDbInstance.mockResolvedValue(mockDb);
  });

  const sampleEvent = {
    id: 'match-abc',
    name: 'Test Match',
    description: 'A test match',
    game_id: 'game-1',
    type: 'competitive' as const,
    maps: [],
    max_participants: 10,
    guild_id: 'guild-123',
  };

  it('returns true and inserts a pending announcement queue entry', async () => {
    const result = await postEventAnnouncement(sampleEvent);

    expect(result).toBe(true);
    expect(mockDb.run).toHaveBeenCalledOnce();
    const [sql, params] = mockDb.run.mock.calls[0];
    expect(sql).toContain('INSERT INTO discord_announcement_queue');
    expect(params).toContain('match-abc');
  });

  it('inserts with announcement_type = standard', async () => {
    await postEventAnnouncement(sampleEvent);

    const [sql] = mockDb.run.mock.calls[0];
    expect(sql).toContain("'standard'");
  });

  it('inserts with status = pending', async () => {
    await postEventAnnouncement(sampleEvent);

    const [sql] = mockDb.run.mock.calls[0];
    expect(sql).toContain("'pending'");
  });

  it('returns true without inserting when an announcement already exists', async () => {
    mockDb.get.mockResolvedValue({ id: 'existing-announce' });

    const result = await postEventAnnouncement(sampleEvent);

    expect(result).toBe(true);
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  it('uses the event id as match_id in the announcement queue', async () => {
    await postEventAnnouncement({ ...sampleEvent, id: 'event-xyz' });

    const [, params] = mockDb.run.mock.calls[0];
    expect(params).toContain('event-xyz');
  });

  it('returns false when the database operation throws an error', async () => {
    mockGetDbInstance.mockRejectedValue(new Error('DB unavailable'));

    const result = await postEventAnnouncement(sampleEvent);

    expect(result).toBe(false);
  });

  it('returns false when db.run throws an error', async () => {
    mockDb.run.mockRejectedValue(new Error('Insert failed'));

    const result = await postEventAnnouncement(sampleEvent);

    expect(result).toBe(false);
  });
});
