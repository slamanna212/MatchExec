import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('discord.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    isReady: vi.fn().mockReturnValue(true),
    login: vi.fn().mockResolvedValue('token'),
    destroy: vi.fn(),
  })),
  GatewayIntentBits: { Guilds: 1 },
}));

vi.mock('../../../processes/discord-bot/utils/avatar-fetcher', () => ({
  getDiscordAvatarUrl: vi.fn().mockResolvedValue('https://cdn.discordapp.com/avatars/test/avatar.png'),
}));

import { AvatarUpdateJob } from '../../../processes/scheduler/jobs/update-avatars';
import { getDiscordAvatarUrl } from '../../../processes/discord-bot/utils/avatar-fetcher';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData } from '../../utils/fixtures';

const mockGetDiscordAvatarUrl = getDiscordAvatarUrl as ReturnType<typeof vi.fn>;

describe('AvatarUpdateJob', () => {
  let job: AvatarUpdateJob;
  let db: any;

  beforeEach(async () => {
    db = getTestDb();
    await seedBasicTestData();
    vi.clearAllMocks();

    await db.run(
      `INSERT INTO discord_settings (guild_id, bot_token) VALUES ('guild-1', 'test-token')`
    );

    job = new AvatarUpdateJob(db as any);

    // Inject a ready mock client to skip actual login
    (job as any).discordClient = {
      isReady: vi.fn().mockReturnValue(true),
      login: vi.fn().mockResolvedValue('token'),
      destroy: vi.fn(),
    };
  });

  describe('updateAvatars', () => {
    it('exits early without fetching when there are no participants', async () => {
      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).not.toHaveBeenCalled();
    });

    it('updates avatar_url for a participant with a discord_user_id', async () => {
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p1', 'match-1', 'u1', 'discord-111', 'Player1')`
      );

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledOnce();
      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledWith(
        expect.any(Object),
        'discord-111'
      );

      const row = await db.get(
        `SELECT avatar_url, failed_avatar_checks FROM match_participants WHERE id = 'p1'`
      );
      expect(row.avatar_url).toBe('https://cdn.discordapp.com/avatars/test/avatar.png');
      expect(row.failed_avatar_checks).toBe(0);
    });

    it('resets failed_avatar_checks to 0 on successful update', async () => {
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, failed_avatar_checks)
         VALUES ('p-reset', 'match-1', 'u-r', 'disc-r1', 'Resettable', 2)`
      );

      await job.updateAvatars();

      const row = await db.get(
        `SELECT failed_avatar_checks FROM match_participants WHERE id = 'p-reset'`
      );
      expect(row.failed_avatar_checks).toBe(0);
    });

    it('skips participants that have reached the failure threshold (>= 3 failed checks)', async () => {
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, failed_avatar_checks)
         VALUES ('p-skipped', 'match-1', 'u-s', 'disc-s1', 'Skipped', 3)`
      );

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).not.toHaveBeenCalled();
    });

    it('fetches each unique discord_user_id only once when they appear in multiple matches', async () => {
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('pd1', 'match-1', 'u-d', 'discord-dup', 'DupPlayer')`
      );
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('pd2', 'match-2', 'u-d2', 'discord-dup', 'DupPlayer2')`
      );

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledOnce();
    });

    it('does not increment failure count when all avatar fetches fail (connectivity issue)', async () => {
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p-fail', 'match-1', 'u-f', 'disc-f1', 'FailUser')`
      );

      mockGetDiscordAvatarUrl.mockRejectedValue(new Error('Network error'));

      await job.updateAvatars();

      const row = await db.get(
        `SELECT failed_avatar_checks FROM match_participants WHERE id = 'p-fail'`
      );
      // When ALL fetches fail, failure count must NOT be incremented (potential connectivity issue).
      // Column defaults to 0 (integer), so it stays 0 and is not incremented.
      expect(row.failed_avatar_checks).toBe(0);
    });

    it('increments failure count for individual failing users when at least one succeeds', async () => {
      mockGetDiscordAvatarUrl
        .mockResolvedValueOnce('https://cdn.example.com/avatar1.png') // first user succeeds
        .mockRejectedValueOnce(new Error('Not found')); // second user fails

      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p-ok', 'match-1', 'u1', 'disc-ok', 'SuccessUser')`
      );
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p-err', 'match-1', 'u2', 'disc-err', 'FailUser')`
      );

      await job.updateAvatars();

      const failedRow = await db.get(
        `SELECT failed_avatar_checks FROM match_participants WHERE id = 'p-err'`
      );
      expect(failedRow.failed_avatar_checks).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('destroys the Discord client and sets the reference to null', async () => {
      const mockDestroy = vi.fn();
      (job as any).discordClient = {
        isReady: vi.fn().mockReturnValue(true),
        destroy: mockDestroy,
      };

      await job.cleanup();

      expect(mockDestroy).toHaveBeenCalledOnce();
      expect((job as any).discordClient).toBeNull();
    });

    it('resolves without error when Discord client was never initialized', async () => {
      (job as any).discordClient = null;

      await expect(job.cleanup()).resolves.toBeUndefined();
    });
  });
});
