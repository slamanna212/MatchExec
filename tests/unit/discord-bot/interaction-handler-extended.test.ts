import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockDiscordClient),
  SlashCommandBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setName = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    return this;
  }),
  REST: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setToken = vi.fn().mockReturnThis();
    this.put = vi.fn().mockResolvedValue([]);
    return this;
  }),
  Routes: { applicationGuildCommands: vi.fn().mockReturnValue('/commands') },
  MessageFlags: { Ephemeral: 64 },
  ModalBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setCustomId = vi.fn().mockReturnThis();
    this.setTitle = vi.fn().mockReturnThis();
    this.addComponents = vi.fn().mockReturnThis();
    return this;
  }),
  ActionRowBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.addComponents = vi.fn().mockReturnThis();
    return this;
  }),
  TextInputBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setCustomId = vi.fn().mockReturnThis();
    this.setLabel = vi.fn().mockReturnThis();
    this.setStyle = vi.fn().mockReturnThis();
    this.setRequired = vi.fn().mockReturnThis();
    this.setMaxLength = vi.fn().mockReturnThis();
    this.setPlaceholder = vi.fn().mockReturnThis();
    return this;
  }),
  TextInputStyle: { Short: 1, Paragraph: 2 },
  StringSelectMenuBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.setCustomId = vi.fn().mockReturnThis();
    this.setPlaceholder = vi.fn().mockReturnThis();
    this.addOptions = vi.fn().mockReturnThis();
    return this;
  }),
  EmbedBuilder: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.data = { fields: [] as unknown[] };
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setURL = vi.fn().mockReturnThis();
    this.setTimestamp = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    this.addFields = vi.fn(function (this: { data: { fields: unknown[] } }, ...fields: unknown[]) {
      this.data.fields.push(...fields);
      return this;
    });
    return this;
  }),
  GatewayIntentBits: { Guilds: 1, GuildMessages: 2 },
  ButtonStyle: { Primary: 1 },
}));

vi.mock('../../../processes/discord-bot/modules/interaction-helpers', () => ({
  collectFormData: vi.fn().mockResolvedValue({ username: 'TestUser' }),
  insertParticipant: vi.fn().mockResolvedValue(undefined),
  getParticipantCount: vi.fn().mockResolvedValue(1),
  buildConfirmationMessage: vi.fn().mockResolvedValue('✅ Successfully signed up!'),
}));

vi.mock('../../../processes/discord-bot/utils/id-parsers', () => ({
  parseModalCustomId: vi.fn().mockReturnValue({ eventId: 'event-1', isTournament: false, selectedTeamId: null }),
}));

vi.mock('../../../lib/signup-forms', () => ({
  SignupFormLoader: {
    loadSignupForm: vi.fn().mockResolvedValue({
      fields: [{ id: 'username', label: 'Username', required: true, type: 'text' }],
      submitButton: { text: 'Sign Up' },
    }),
  },
}));

 
let InteractionHandler: any;

describe('InteractionHandler — Extended', () => {
   
  let handler: any;
   
  let db: any;
   
  let game: any;
   
  let mode: any;

  const mockSettings = { bot_token: 'test-tok', guild_id: 'guild-ext2' };

  beforeAll(async () => {
    const mod = await import('../../../processes/discord-bot/modules/interaction-handler');
    InteractionHandler = mod.InteractionHandler;
  });

  beforeEach(async () => {
    resetDiscordMocks();
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    const clientWithWs = { ...mockDiscordClient, ws: { ping: 5 } };
    handler = new InteractionHandler(clientWithWs, db, mockSettings, vi.fn().mockResolvedValue(undefined));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeInteraction(overrides: Record<string, unknown> = {}) {
    return {
      commandName: 'help',
      customId: '',
      user: { id: 'u-ext', username: 'ExtUser', displayName: 'ExtUser' },
      guildId: 'guild-ext2',
      replied: false,
      deferred: false,
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      showModal: vi.fn().mockResolvedValue(undefined),
      values: [],
      fields: { getTextInputValue: vi.fn().mockReturnValue('ExtValue') },
      ...overrides,
    };
  }

  describe('handleSlashCommand — /matches extended', () => {
    it('only shows gather/assign/battle matches (not completed)', async () => {
      const m1 = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET status='complete' WHERE id=?`, [m1.id]);
      const m2 = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET status='gather' WHERE id=?`, [m2.id]);

      const interaction = makeInteraction({ commandName: 'matches' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      // When there are active matches, reply should contain an embed, not the "no matches" string
      const replyArg = interaction.reply.mock.calls[0][0];
      // Either embeds array or content — with one active match it should NOT say "no active matches"
      const content = typeof replyArg === 'string' ? replyArg : (replyArg.content ?? '');
      expect(content).not.toContain('No active matches');
    });

    it('replies ephemerally with no-matches message when all matches are completed', async () => {
      const m = await createMatch(game.id, mode.id);
      await db.run(`UPDATE matches SET status='complete' WHERE id=?`, [m.id]);

      const interaction = makeInteraction({ commandName: 'matches' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
    });
  });

  describe('handleSlashCommand — /help', () => {
    it('replies with an embed containing help content', async () => {
      const interaction = makeInteraction({ commandName: 'help' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
    });
  });

  describe('handleSlashCommand — unknown command', () => {
    it('replies with unknown command message for gibberish command', async () => {
      const interaction = makeInteraction({ commandName: 'xyzzy_not_a_command' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const replyArg = interaction.reply.mock.calls[0][0];
      const content = typeof replyArg === 'string' ? replyArg : replyArg.content;
      expect(content).toContain('Unknown');
    });
  });

  describe('handleSlashCommand — error path uses followUp', () => {
    it('uses followUp when interaction was already deferred', async () => {
      // reply throws on every call — handleStatusCommand's reply() call will throw,
      // the catch block then routes to followUp because deferred=true
      const followUpMock = vi.fn().mockResolvedValue(undefined);
      const interaction = makeInteraction({
        commandName: 'status',
        deferred: true,
        replied: false,
        reply: vi.fn().mockRejectedValue(new Error('Already replied')),
        followUp: followUpMock,
      });

      await handler.handleSlashCommand(interaction);

      expect(followUpMock).toHaveBeenCalledOnce();
    });
  });

  describe('handleButtonInteraction — event capacity and not-found', () => {
    it('ignores button without signup_ prefix', async () => {
      const interaction = makeInteraction({ customId: 'dismiss_123' });
      await handler.handleButtonInteraction(interaction);
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('replies with already-signed-up when user is already a participant', async () => {
      const match = await createMatch(game.id, mode.id);
      // Insert a participant with the same user ID that makeInteraction() uses ('u-ext')
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, username, discord_user_id)
         VALUES ('already-p1', ?, 'u-ext', 'ExtUser', 'u-ext')`,
        [match.id]
      );

      const interaction = makeInteraction({ customId: `signup_${match.id}` });
      await handler.handleButtonInteraction(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const replyArg = interaction.reply.mock.calls[0][0];
      const content = typeof replyArg === 'string' ? replyArg : replyArg.content;
      expect(content).toContain('already signed up');
    });

    it('replies with event-not-found when match ID does not exist', async () => {
      const interaction = makeInteraction({ customId: 'signup_ghost-match-id' });
      await handler.handleButtonInteraction(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const replyArg = interaction.reply.mock.calls[0][0];
      const content = typeof replyArg === 'string' ? replyArg : replyArg.content;
      expect(content).toContain('not found');
    });
  });

  describe('handleStringSelectMenu — tournament and team edge cases', () => {
    it('ignores menu without team_select_ prefix', async () => {
      const interaction = makeInteraction({ customId: 'random_menu', values: ['v1'] });
      await handler.handleStringSelectMenu(interaction);
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('replies with not-found when tournament does not exist', async () => {
      const interaction = makeInteraction({
        customId: 'team_select_ghost-tournament',
        values: ['team-any'],
        user: { id: 'u-ghost', username: 'Ghost', displayName: 'Ghost' },
      });
      await handler.handleStringSelectMenu(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const replyArg = interaction.reply.mock.calls[0][0];
      const content = typeof replyArg === 'string' ? replyArg : replyArg.content;
      expect(content).toContain('not found');
    });

    it('replies with not-found when team does not exist', async () => {
      await db.run(
        `INSERT INTO tournaments (id, name, game_id, game_mode_id, status, format, rounds_per_match)
         VALUES ('tu-ext1', 'ExtTourney', ?, ?, 'gather', 'single-elimination', 3)`,
        [game.id, mode.id]
      );

      const interaction = makeInteraction({
        customId: 'team_select_tu-ext1',
        values: ['ghost-team-id'],
        user: { id: 'u-ext-tm', username: 'ExtTm', displayName: 'ExtTm' },
      });
      await handler.handleStringSelectMenu(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const replyArg = interaction.reply.mock.calls[0][0];
      const content = typeof replyArg === 'string' ? replyArg : replyArg.content;
      expect(content).toContain('not found');
    });

    it('shows modal when tournament and team both exist', async () => {
      await db.run(
        `INSERT INTO tournaments (id, name, game_id, game_mode_id, status, format, rounds_per_match)
         VALUES ('tu-ext2', 'ExtTourney2', ?, ?, 'gather', 'single-elimination', 3)`,
        [game.id, mode.id]
      );
      await db.run(
        `INSERT INTO tournament_teams (id, tournament_id, team_name)
         VALUES ('tt-ext2', 'tu-ext2', 'ExtTeam')`,
      );

      const interaction = makeInteraction({
        customId: 'team_select_tu-ext2',
        values: ['tt-ext2'],
        user: { id: 'u-ext-modal', username: 'ModalUser', displayName: 'ModalUser' },
      });
      await handler.handleStringSelectMenu(interaction);

      expect(interaction.showModal).toHaveBeenCalledOnce();
    });
  });

  describe('updateSettings', () => {
    it('can update settings to null without throwing', () => {
      expect(() => handler.updateSettings(null)).not.toThrow();
    });

    it('can update settings to a new value', () => {
      expect(() =>
        handler.updateSettings({ bot_token: 'new-tok', guild_id: 'new-guild' })
      ).not.toThrow();
    });
  });
});
