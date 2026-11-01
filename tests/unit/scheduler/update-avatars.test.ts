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
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { eq } from 'drizzle-orm';
import { matchParticipants } from '../../../lib/db/schema';
import { seedBasicTestData, createMatch, createDiscordSettings, createMatchParticipant } from '../../utils/pg-fixtures';

const mockGetDiscordAvatarUrl = getDiscordAvatarUrl as ReturnType<typeof vi.fn>;

setupPgTestFile();

describe('AvatarUpdateJob', () => {
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
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await createMatchParticipant(match.id, 'discord-111', 'Player1', { id: 'p1', user_id: 'u1' });

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledOnce();
      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledWith(
        expect.any(Object),
        'discord-111'
      );

      const row = (await getPgTestDb().select().from(matchParticipants).where(eq(matchParticipants.id, 'p1')))[0];
      expect(row.avatar_url).toBe('https://cdn.discordapp.com/avatars/test/avatar.png');
      expect(row.failed_avatar_checks).toBe(0);
    });

    it('resets failed_avatar_checks to 0 on successful update', async () => {
      const match = await createMatch(gameId, modeId, { status: 'gather' });
      await createMatchParticipant(match.id, 'disc-r1', 'Resettable', { id: 'p-reset', user_id: 'u-r', failed_avatar_checks: 2 });

      await job.updateAvatars();

      const row = (await getPgTestDb().select().from(matchParticipants).where(eq(matchParticipants.id, 'p-reset')))[0];
      expect(row.failed_avatar_checks).toBe(0);
    });

    it('skips participants that have reached the failure threshold (>= 3 failed checks)', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await createMatchParticipant(match.id, 'disc-s1', 'Skipped', { id: 'p-skipped', user_id: 'u-s', failed_avatar_checks: 3 });

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).not.toHaveBeenCalled();
    });

    it('fetches each unique discord_user_id only once when they appear in multiple active matches', async () => {
      const match1 = await createMatch(gameId, modeId, { status: 'gather' });
      const match2 = await createMatch(gameId, modeId, { status: 'battle' });
      await createMatchParticipant(match1.id, 'discord-dup', 'DupPlayer', { id: 'pd1', user_id: 'u-d' });
      await createMatchParticipant(match2.id, 'discord-dup', 'DupPlayer2', { id: 'pd2', user_id: 'u-d2' });

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledOnce();
    });

    it('skips participants in completed matches', async () => {
      const activeMatch = await createMatch(gameId, modeId, { status: 'battle' });
      const completeMatch = await createMatch(gameId, modeId, { status: 'complete' });
      await createMatchParticipant(activeMatch.id, 'discord-active', 'ActivePlayer', { id: 'p-active', user_id: 'u-a' });
      await createMatchParticipant(completeMatch.id, 'discord-done', 'DonePlayer', { id: 'p-done', user_id: 'u-d' });

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledOnce();
      expect(mockGetDiscordAvatarUrl).toHaveBeenCalledWith(expect.any(Object), 'discord-active');
    });

    it('skips participants in cancelled matches', async () => {
      const cancelledMatch = await createMatch(gameId, modeId, { status: 'cancelled' });
      await createMatchParticipant(cancelledMatch.id, 'discord-cancelled', 'CancelledPlayer', { id: 'p-cancelled', user_id: 'u-c' });

      await job.updateAvatars();

      expect(mockGetDiscordAvatarUrl).not.toHaveBeenCalled();
    });

    it('does not increment failure count when all avatar fetches fail (connectivity issue)', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      await createMatchParticipant(match.id, 'disc-f1', 'FailUser', { id: 'p-fail', user_id: 'u-f' });

      mockGetDiscordAvatarUrl.mockRejectedValue(new Error('Network error'));

      await job.updateAvatars();

      const row = (await getPgTestDb().select().from(matchParticipants).where(eq(matchParticipants.id, 'p-fail')))[0];
      // When ALL fetches fail, failure count must NOT be incremented (potential connectivity issue).
      expect(row.failed_avatar_checks).toBe(0);
    });

    it('increments failure count for individual failing users when at least one succeeds', async () => {
      const match = await createMatch(gameId, modeId, { status: 'battle' });
      // keyed by user: the order users are visited in is not part of the contract
      mockGetDiscordAvatarUrl.mockImplementation(async (_client: unknown, discordUserId: string) => {
        if (discordUserId === 'disc-err') throw new Error('Unknown User');
        return 'https://cdn.example.com/avatar1.png';
      });

      await createMatchParticipant(match.id, 'disc-ok', 'SuccessUser', { id: 'p-ok', user_id: 'u1' });
      await createMatchParticipant(match.id, 'disc-err', 'FailUser', { id: 'p-err', user_id: 'u2' });

      await job.updateAvatars();

      const failedRow = (await getPgTestDb().select().from(matchParticipants).where(eq(matchParticipants.id, 'p-err')))[0];
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
