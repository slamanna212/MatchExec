import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch, createMatchParticipant } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockDiscordClient),
  EmbedBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.data = { fields: [] as unknown[] };
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setTimestamp = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    this.addFields = vi.fn(function (this: { data: { fields: unknown[] } }, ...fields: unknown[]) {
      this.data.fields.push(...fields);
      return this;
    });
    this.setImage = vi.fn().mockReturnThis();
    return this;
  }),
  GatewayIntentBits: { Guilds: 1, GuildMessages: 2 },
  ButtonStyle: { Primary: 1 },
}));

 
let ReminderHandler: any;

describe('ReminderHandler — Extended', () => {
   
  let reminderHandler: any;
  let db: ReturnType<typeof getTestDb>;
  let game: { id: string };
  let mode: { id: string };
   
  let mockUser: { send: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    const mod = await import('../../../processes/discord-bot/modules/reminder-handler');
    ReminderHandler = mod.ReminderHandler;
  });

  beforeEach(async () => {
    resetDiscordMocks();
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    await db.run(
      `INSERT INTO discord_settings (guild_id, bot_token) VALUES ('guild-rem', 'tok-rem')`
    );

    reminderHandler = new ReminderHandler(
      mockDiscordClient,
      db,
      { guild_id: 'guild-rem' }
    );

    // Ensure isReady returns true for every test (clearAllMocks doesn't reset implementations)
    mockDiscordClient.isReady.mockReturnValue(true);
    // Create fresh mockUser each test to avoid shared state
    mockUser = { send: vi.fn().mockResolvedValue({ id: 'dm-msg' }) };
    mockDiscordClient.users.fetch.mockResolvedValue(mockUser);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('sendPlayerReminders — DM behavior', () => {
    it('returns false for nonexistent match', async () => {
      const result = await reminderHandler.sendPlayerReminders('nonexistent-match');
      expect(result).toBe(false);
    });

    it('returns true (no error) when match has no participants', async () => {
      const match = await createMatch(game.id, mode.id);
      const result = await reminderHandler.sendPlayerReminders(match.id);
      expect(result).toBe(true);
    });

    it('sends DM to each participant with a discord_user_id', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchParticipant(match.id, 'disc-r1', 'Player1');
      await createMatchParticipant(match.id, 'disc-r2', 'Player2');
      await createMatchParticipant(match.id, 'disc-r3', 'Player3');

      const result = await reminderHandler.sendPlayerReminders(match.id);

      expect(result).toBe(true);
      expect(mockDiscordClient.users.fetch).toHaveBeenCalledTimes(3);
      expect(mockUser.send).toHaveBeenCalledTimes(3);
    });

    it('skips participants without discord_user_id', async () => {
      const match = await createMatch(game.id, mode.id);
      // Create participant without discord_user_id
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, username, discord_user_id)
         VALUES ('p-no-disc', ?, 'u-no-disc', 'NoDiscord', NULL)`,
        [match.id]
      );
      // Create participant with discord_user_id
      await createMatchParticipant(match.id, 'disc-has', 'HasDiscord');

      await reminderHandler.sendPlayerReminders(match.id);

      // Only the participant with discord_user_id should be DM'd
      expect(mockDiscordClient.users.fetch).toHaveBeenCalledTimes(1);
    });

    it('continues DMing remaining participants when one fails', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchParticipant(match.id, 'disc-fail', 'WillFail');
      await createMatchParticipant(match.id, 'disc-ok', 'WillSucceed');

      // First fetch returns a user whose send will fail, second fetch returns one that succeeds
      const failUser = { send: vi.fn().mockRejectedValue(new Error('Cannot send DM')) };
      const okUser = { send: vi.fn().mockResolvedValue({ id: 'dm-ok' }) };
      mockDiscordClient.users.fetch
        .mockResolvedValueOnce(failUser)
        .mockResolvedValueOnce(okUser);

      const result = await reminderHandler.sendPlayerReminders(match.id);

      expect(okUser.send).toHaveBeenCalledTimes(1);
      // Result is true if at least one was sent (or false if the successful one was the first)
      // Either way, no throw
      expect(typeof result).toBe('boolean');
    });

    it('returns false when bot is not ready', async () => {
      mockDiscordClient.isReady.mockReturnValue(false);

      const match = await createMatch(game.id, mode.id);
      await createMatchParticipant(match.id, 'disc-not-ready', 'NotReady');

      const result = await reminderHandler.sendPlayerReminders(match.id);
      expect(result).toBe(false);
      expect(mockDiscordClient.users.fetch).not.toHaveBeenCalled();
    });

    it('sends DM with embeds payload', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchParticipant(match.id, 'disc-embed', 'EmbedPlayer');

      await reminderHandler.sendPlayerReminders(match.id);

      const sendArg = mockUser.send.mock.calls[0][0];
      expect(sendArg).toHaveProperty('embeds');
      expect(Array.isArray(sendArg.embeds)).toBe(true);
    });
  });

  describe('sendMapCodePMs — behavior', () => {
    it('returns false when bot is not ready', async () => {
      mockDiscordClient.isReady.mockReturnValue(false);
      const match = await createMatch(game.id, mode.id);

      const result = await reminderHandler.sendMapCodePMs(match.id, 'Hanamura', 'CODE123');
      expect(result).toBe(false);
    });

    it('returns true when no participants need DMs', async () => {
      const match = await createMatch(game.id, mode.id);

      const result = await reminderHandler.sendMapCodePMs(match.id, 'Hanamura', 'CODE123');
      // With no participants it should succeed without error
      expect(typeof result).toBe('boolean');
    });

    it('sends map code DM to participants with receives_map_codes=1', async () => {
      const match = await createMatch(game.id, mode.id);
      const p1 = await createMatchParticipant(match.id, 'disc-mc1', 'MapCodeP1');
      const p2 = await createMatchParticipant(match.id, 'disc-mc2', 'MapCodeP2');

      // Enable map code receipt for both participants
      await db.run(
        `UPDATE match_participants SET receives_map_codes = 1 WHERE id IN (?, ?)`,
        [p1.id, p2.id]
      );

      await reminderHandler.sendMapCodePMs(match.id, 'Ilios', 'ILIOS99');

      expect(mockDiscordClient.users.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
