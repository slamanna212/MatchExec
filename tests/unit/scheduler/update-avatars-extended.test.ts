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
    isReady: vi.fn().mockReturnValue(false),
    login: vi.fn().mockResolvedValue('token'),
    destroy: vi.fn(),
  })),
  GatewayIntentBits: { Guilds: 1 },
}));

vi.mock('../../../processes/discord-bot/utils/avatar-fetcher', () => ({
  getDiscordAvatarUrl: vi.fn().mockResolvedValue('https://cdn.discordapp.com/avatars/u/hash.png'),
}));

import { AvatarUpdateJob } from '../../../processes/scheduler/jobs/update-avatars';
import { getDiscordAvatarUrl } from '../../../processes/discord-bot/utils/avatar-fetcher';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

const mockGetDiscordAvatarUrl = getDiscordAvatarUrl as ReturnType<typeof vi.fn>;

describe('AvatarUpdateJob — extended', () => {
  let job: AvatarUpdateJob;
  let db: any;
  let gameId: string;
  let modeId: string;

  beforeEach(async () => {
    db = getTestDb();
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
    vi.clearAllMocks();

    await db.run(
      `INSERT INTO discord_settings (guild_id, bot_token) VALUES ('guild-1', 'test-token')`
    );

    job = new AvatarUpdateJob(db as any);
    (job as any).discordClient = {
      isReady: vi.fn().mockReturnValue(true),
      login: vi.fn().mockResolvedValue('token'),
      destroy: vi.fn(),
    };
  });

  describe('updateAvatars — last_avatar_check timestamp', () => {
    it('sets last_avatar_check on successful avatar update', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p-ts', ?, 'u-ts', 'disc-ts1', 'TimestampUser')`,
        [match.id]
      );

      const before = new Date();
      await job.updateAvatars();

      const row = await db.get(
        `SELECT last_avatar_check FROM match_participants WHERE id = 'p-ts'`
      );
      expect(row.last_avatar_check).not.toBeNull();
      const checked = new Date(row.last_avatar_check);
      expect(checked.getTime()).toBeGreaterThanOrEqual(before.getTime() - 2000);
    });

    it('sets last_avatar_check even on failed avatar fetch', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p-fail-ts', ?, 'u-ft', 'disc-ft1', 'FailTsUser')`,
        [match.id]
      );

      // Two participants so the second one can succeed (triggers failure increment logic)
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p-ok-ts', ?, 'u-ok', 'disc-ok1', 'OkUser')`,
        [match.id]
      );

      mockGetDiscordAvatarUrl
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce('https://cdn.discordapp.com/avatars/ok/hash.png');

      await job.updateAvatars();

      const failRow = await db.get(
        `SELECT last_avatar_check FROM match_participants WHERE id = 'p-fail-ts'`
      );
      expect(failRow.last_avatar_check).not.toBeNull();
    });
  });

  describe('updateAvatars — updates all records for same discord_user_id', () => {
    it('updates avatar_url on all participant rows sharing the same discord_user_id', async () => {
      const match1 = await createMatch(gameId, modeId, { status: 'gather' });
      const match2 = await createMatch(gameId, modeId, { status: 'battle' });
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('pa1', ?, 'u-shared', 'disc-shared', 'SharedUser')`,
        [match1.id]
      );
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('pa2', ?, 'u-shared', 'disc-shared', 'SharedUser')`,
        [match2.id]
      );

      await job.updateAvatars();

      // DISTINCT means only one fetch call
      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledOnce();

      // But both rows should be updated
      const rows = await db.all(
        `SELECT avatar_url FROM match_participants WHERE discord_user_id = 'disc-shared'`
      );
      expect(rows).toHaveLength(2);
      rows.forEach((r: { avatar_url: string }) => {
        expect(r.avatar_url).toBe('https://cdn.discordapp.com/avatars/u/hash.png');
      });
    });
  });

  describe('updateAvatars — failure threshold edge cases', () => {
    it('includes participants with failed_avatar_checks = 2 (below threshold)', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, failed_avatar_checks)
         VALUES ('p-2fails', ?, 'u-2f', 'disc-2f', 'AlmostSkipped', 2)`,
        [match.id]
      );

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledOnce();
      const row = await db.get(
        `SELECT failed_avatar_checks FROM match_participants WHERE id = 'p-2fails'`
      );
      expect(row.failed_avatar_checks).toBe(0);
    });

    it('excludes participants with failed_avatar_checks = 4 (above threshold)', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, failed_avatar_checks)
         VALUES ('p-4fails', ?, 'u-4f', 'disc-4f', 'TooManyFails', 4)`,
        [match.id]
      );

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).not.toHaveBeenCalled();
    });

    it('excludes participants with NULL discord_user_id', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username)
         VALUES ('p-no-discord', ?, 'u-nd', NULL, 'NoDiscord')`,
        [match.id]
      );

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).not.toHaveBeenCalled();
    });
  });

  describe('updateAvatars — Discord client initialization failure', () => {
    it('handles Discord client init failure gracefully without throwing', async () => {
      (job as any).discordClient = null;
      // No discord_settings row — token will be missing
      await db.run(`DELETE FROM discord_settings`);

      await expect(job.updateAvatars()).resolves.toBeUndefined();
      expect(mockGetDiscordAvatarUrl).not.toHaveBeenCalled();
    });
  });

  describe('updateAvatars — Discord client reuse', () => {
    it('does not reinitialize if client is already ready', async () => {
      const { Client } = await import('discord.js');
      const mockLogin = vi.fn().mockResolvedValue('token');
      (job as any).discordClient = {
        isReady: vi.fn().mockReturnValue(true),
        login: mockLogin,
        destroy: vi.fn(),
      };

      // Call twice
      await job.updateAvatars();
      await job.updateAvatars();

      // login should never be called because client is already ready
      expect(mockLogin).not.toHaveBeenCalled();
      expect(Client).not.toHaveBeenCalled();
    });
  });

  describe('cleanup — extended', () => {
    it('sets discordClient to null after destroy', async () => {
      const mockDestroy = vi.fn();
      (job as any).discordClient = {
        isReady: vi.fn().mockReturnValue(true),
        destroy: mockDestroy,
      };

      await job.cleanup();

      expect((job as any).discordClient).toBeNull();
    });

    it('is idempotent — second cleanup after null client does nothing', async () => {
      (job as any).discordClient = null;
      await expect(job.cleanup()).resolves.toBeUndefined();
      await expect(job.cleanup()).resolves.toBeUndefined();
    });
  });
});
