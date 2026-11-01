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
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { eq } from 'drizzle-orm';
import { discordSettings, matchParticipants } from '../../../lib/db/schema';
import { seedBasicTestData, createMatch, createDiscordSettings, createMatchParticipant } from '../../utils/pg-fixtures';

const mockGetDiscordAvatarUrl = getDiscordAvatarUrl as ReturnType<typeof vi.fn>;

setupPgTestFile();

describe('AvatarUpdateJob — extended', () => {
  let job: AvatarUpdateJob;
  let gameId: string;
  let modeId: string;

  beforeEach(async () => {
    const seed = await seedBasicTestData();
    gameId = seed.game.id;
    modeId = seed.mode.id;
    vi.clearAllMocks();

    await createDiscordSettings({ guild_id: 'guild-1', bot_token: 'test-token' });

    job = new AvatarUpdateJob();
    (job as any).discordClient = {
      isReady: vi.fn().mockReturnValue(true),
      login: vi.fn().mockResolvedValue('token'),
      destroy: vi.fn(),
    };
  });

  describe('updateAvatars — last_avatar_check timestamp', () => {
    it('sets last_avatar_check on successful avatar update', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await createMatchParticipant(match.id, 'disc-ts1', 'TimestampUser', { id: 'p-ts', user_id: 'u-ts' });

      const before = new Date();
      await job.updateAvatars();

      const row = (await getPgTestDb().select().from(matchParticipants).where(eq(matchParticipants.id, 'p-ts')))[0];
      expect(row.last_avatar_check).not.toBeNull();
      const checked = new Date(row.last_avatar_check!);
      expect(checked.getTime()).toBeGreaterThanOrEqual(before.getTime() - 2000);
    });

    it('sets last_avatar_check even on failed avatar fetch', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await createMatchParticipant(match.id, 'disc-ft1', 'FailTsUser', { id: 'p-fail-ts', user_id: 'u-ft' });

      // Two participants so the second one can succeed (triggers failure increment logic)
      await createMatchParticipant(match.id, 'disc-ok1', 'OkUser', { id: 'p-ok-ts', user_id: 'u-ok' });

      mockGetDiscordAvatarUrl
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce('https://cdn.discordapp.com/avatars/ok/hash.png');

      await job.updateAvatars();

      const failRow = (await getPgTestDb().select().from(matchParticipants).where(eq(matchParticipants.id, 'p-fail-ts')))[0];
      expect(failRow.last_avatar_check).not.toBeNull();
    });
  });

  describe('updateAvatars — updates all records for same discord_user_id', () => {
    it('updates avatar_url on all participant rows sharing the same discord_user_id', async () => {
      const match1 = await createMatch(gameId, modeId, { status: 'gather' });
      const match2 = await createMatch(gameId, modeId, { status: 'battle' });
      await createMatchParticipant(match1.id, 'disc-shared', 'SharedUser', { id: 'pa1', user_id: 'u-shared' });
      await createMatchParticipant(match2.id, 'disc-shared', 'SharedUser', { id: 'pa2', user_id: 'u-shared' });

      await job.updateAvatars();

      // DISTINCT means only one fetch call
      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledOnce();

      // But both rows should be updated
      const rows = await getPgTestDb().select().from(matchParticipants).where(eq(matchParticipants.discord_user_id, 'disc-shared'));
      expect(rows).toHaveLength(2);
      rows.forEach((r) => {
        expect(r.avatar_url).toBe('https://cdn.discordapp.com/avatars/u/hash.png');
      });
    });
  });

  describe('updateAvatars — failure threshold edge cases', () => {
    it('includes participants with failed_avatar_checks = 2 (below threshold)', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await createMatchParticipant(match.id, 'disc-2f', 'AlmostSkipped', { id: 'p-2fails', user_id: 'u-2f', failed_avatar_checks: 2 });

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledOnce();
      const row = (await getPgTestDb().select().from(matchParticipants).where(eq(matchParticipants.id, 'p-2fails')))[0];
      expect(row.failed_avatar_checks).toBe(0);
    });

    it('excludes participants with failed_avatar_checks = 4 (above threshold)', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await createMatchParticipant(match.id, 'disc-4f', 'TooManyFails', { id: 'p-4fails', user_id: 'u-4f', failed_avatar_checks: 4 });

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).not.toHaveBeenCalled();
    });

    it('excludes participants with NULL discord_user_id', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await getPgTestDb().insert(matchParticipants).values({ id: 'p-no-discord', match_id: match.id, user_id: 'u-nd', discord_user_id: null, username: 'NoDiscord' });

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).not.toHaveBeenCalled();
    });
  });

  describe('updateAvatars — Discord client initialization failure', () => {
    it('handles Discord client init failure gracefully without throwing', async () => {
      (job as any).discordClient = null;
      // No discord_settings row — token will be missing
      await getPgTestDb().delete(discordSettings);

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
