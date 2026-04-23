import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

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
  SlashCommandBuilder: vi.fn().mockImplementation(function (this: any) {
    this.setName = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    return this;
  }),
  REST: vi.fn().mockImplementation(function (this: any) {
    this.setToken = vi.fn().mockReturnThis();
    this.put = vi.fn().mockResolvedValue([]);
    return this;
  }),
  Routes: {
    applicationGuildCommands: vi.fn().mockReturnValue('/commands'),
  },
  MessageFlags: { Ephemeral: 64 },
  ModalBuilder: vi.fn().mockImplementation(function (this: any) {
    this.setCustomId = vi.fn().mockReturnThis();
    this.setTitle = vi.fn().mockReturnThis();
    this.addComponents = vi.fn().mockReturnThis();
    return this;
  }),
  ActionRowBuilder: vi.fn().mockImplementation(function (this: any) {
    this.addComponents = vi.fn().mockReturnThis();
    return this;
  }),
  TextInputBuilder: vi.fn().mockImplementation(function (this: any) {
    this.setCustomId = vi.fn().mockReturnThis();
    this.setLabel = vi.fn().mockReturnThis();
    this.setStyle = vi.fn().mockReturnThis();
    this.setRequired = vi.fn().mockReturnThis();
    this.setMaxLength = vi.fn().mockReturnThis();
    this.setPlaceholder = vi.fn().mockReturnThis();
    return this;
  }),
  TextInputStyle: { Short: 1, Paragraph: 2 },
  StringSelectMenuBuilder: vi.fn().mockImplementation(function (this: any) {
    this.setCustomId = vi.fn().mockReturnThis();
    this.setPlaceholder = vi.fn().mockReturnThis();
    this.addOptions = vi.fn().mockReturnThis();
    return this;
  }),
  EmbedBuilder: vi.fn().mockImplementation(function (this: any) {
    this.data = { fields: [] };
    this.setTitle = vi.fn().mockReturnThis();
    this.setDescription = vi.fn().mockReturnThis();
    this.setColor = vi.fn().mockReturnThis();
    this.setURL = vi.fn().mockReturnThis();
    this.setTimestamp = vi.fn().mockReturnThis();
    this.setFooter = vi.fn().mockReturnThis();
    this.addFields = vi.fn(function (this: any, ...fields: any[]) {
      this.data.fields.push(...fields);
      return this;
    });
    return this;
  }),
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
      submitButton: { text: 'Sign Up', loadingText: 'Joining...' },
    }),
  },
}));

let InteractionHandler: any;

describe('InteractionHandler', () => {
  let handler: any;
  let db: any;
  let game: any;
  let mode: any;

  const mockSettings = {
    bot_token: 'test-bot-token',
    guild_id: 'guild-123',
  };

  beforeEach(async () => {
    resetDiscordMocks();
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    if (!InteractionHandler) {
      const mod = await import('../../../processes/discord-bot/modules/interaction-handler');
      InteractionHandler = mod.InteractionHandler;
    }

    // Extend mockDiscordClient with ws.ping which is used by handleStatusCommand
    const clientWithWs = { ...mockDiscordClient, ws: { ping: 5 } };

    handler = new InteractionHandler(
      clientWithWs as any,
      db,
      mockSettings,
      vi.fn().mockResolvedValue(undefined)
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createMockInteraction(overrides: Record<string, unknown> = {}) {
    return {
      commandName: 'status',
      customId: '',
      user: { id: 'user-123', username: 'TestUser', displayName: 'TestUser' },
      guildId: 'guild-123',
      replied: false,
      deferred: false,
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      showModal: vi.fn().mockResolvedValue(undefined),
      values: [],
      fields: { getTextInputValue: vi.fn().mockReturnValue('test-value') },
      ...overrides,
    };
  }

  // ─── registerSlashCommands ────────────────────────────────────────────────

  describe('registerSlashCommands', () => {
    it('skips registration when bot_token is missing', async () => {
      const noTokenHandler = new InteractionHandler(
        mockDiscordClient as any,
        db,
        { guild_id: 'guild-123' },
        vi.fn()
      );
      await expect(noTokenHandler.registerSlashCommands()).resolves.toBeUndefined();
    });

    it('skips registration when guild_id is missing', async () => {
      const noGuildHandler = new InteractionHandler(
        mockDiscordClient as any,
        db,
        { bot_token: 'some-token' },
        vi.fn()
      );
      await expect(noGuildHandler.registerSlashCommands()).resolves.toBeUndefined();
    });

    it('skips registration when settings is null', async () => {
      const nullSettingsHandler = new InteractionHandler(
        mockDiscordClient as any,
        db,
        null,
        vi.fn()
      );
      await expect(nullSettingsHandler.registerSlashCommands()).resolves.toBeUndefined();
    });

    it('calls the REST API to register commands when settings are complete', async () => {
      const { REST } = await import('discord.js');
      const mockPut = vi.fn().mockResolvedValue([]);
      (REST as any).mockImplementation(function (this: any) {
        this.setToken = vi.fn().mockReturnThis();
        this.put = mockPut;
        return this;
      });

      await handler.registerSlashCommands();

      expect(mockPut).toHaveBeenCalledOnce();
    });
  });

  // ─── /status command ──────────────────────────────────────────────────────

  describe('handleSlashCommand — /status', () => {
    it('replies with bot status information', async () => {
      const interaction = createMockInteraction({ commandName: 'status' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      expect(interaction.reply.mock.calls[0][0].content).toContain('MatchExec Bot Status');
    });

    it('includes uptime and database connectivity in status reply', async () => {
      const interaction = createMockInteraction({ commandName: 'status' });
      await handler.handleSlashCommand(interaction);

      const content = interaction.reply.mock.calls[0][0].content;
      expect(content).toContain('Uptime:');
      expect(content).toContain('Database:');
    });
  });

  // ─── /matches command ─────────────────────────────────────────────────────

  describe('handleSlashCommand — /matches', () => {
    it('replies with "no matches" message when DB has no active matches', async () => {
      const interaction = createMockInteraction({ commandName: 'matches' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      expect(interaction.reply.mock.calls[0][0].content).toContain('No active matches found');
    });

    it('replies with an embed when active matches exist', async () => {
      await createMatch(game.id, mode.id, { status: 'gather' });
      const interaction = createMockInteraction({ commandName: 'matches' });
      await handler.handleSlashCommand(interaction);

      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
      expect(replyArg.embeds).toHaveLength(1);
    });

    it('does not include completed matches in the list', async () => {
      await createMatch(game.id, mode.id, { status: 'complete' });
      const interaction = createMockInteraction({ commandName: 'matches' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply.mock.calls[0][0].content).toContain('No active matches found');
    });

    it('shows matches in battle and assign status', async () => {
      await createMatch(game.id, mode.id, { status: 'battle' });
      await createMatch(game.id, mode.id, { status: 'assign' });
      const interaction = createMockInteraction({ commandName: 'matches' });
      await handler.handleSlashCommand(interaction);

      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
    });
  });

  // ─── /tournaments command ─────────────────────────────────────────────────

  describe('handleSlashCommand — /tournaments', () => {
    it('replies with "no tournaments" message when no active tournaments in DB', async () => {
      const interaction = createMockInteraction({ commandName: 'tournaments' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      expect(interaction.reply.mock.calls[0][0].content).toContain('No active tournaments found');
    });

    it('replies with an embed when active tournaments exist', async () => {
      await db.run(
        `INSERT INTO tournaments (id, name, game_id, game_mode_id, status, format, rounds_per_match)
         VALUES ('t1', 'Test Tournament', ?, ?, 'gather', 'single-elimination', 3)`,
        [game.id, mode.id]
      );
      const interaction = createMockInteraction({ commandName: 'tournaments' });
      await handler.handleSlashCommand(interaction);

      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
    });

    it('shows double-elimination tournaments without error', async () => {
      await db.run(
        `INSERT INTO tournaments (id, name, game_id, game_mode_id, status, format, rounds_per_match)
         VALUES ('t2', 'DE Tournament', ?, ?, 'gather', 'double-elimination', 3)`,
        [game.id, mode.id]
      );
      const interaction = createMockInteraction({ commandName: 'tournaments' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
    });
  });

  // ─── /help command ────────────────────────────────────────────────────────

  describe('handleSlashCommand — /help', () => {
    it('replies with a documentation embed', async () => {
      const interaction = createMockInteraction({ commandName: 'help' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      const replyArg = interaction.reply.mock.calls[0][0];
      expect(replyArg.embeds).toBeDefined();
    });
  });

  // ─── unknown command ──────────────────────────────────────────────────────

  describe('handleSlashCommand — unknown command', () => {
    it('replies with "Unknown command" error for unrecognized commands', async () => {
      const interaction = createMockInteraction({ commandName: 'nonexistent-cmd' });
      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      expect(interaction.reply.mock.calls[0][0].content).toContain('Unknown command');
    });
  });

  // ─── error handling ───────────────────────────────────────────────────────

  describe('handleSlashCommand — error handling', () => {
    it('uses followUp when interaction is already replied and an error occurs', async () => {
      const interaction = createMockInteraction({ commandName: 'matches', replied: true });
      vi.spyOn(db, 'all').mockRejectedValueOnce(new Error('DB failure'));

      await handler.handleSlashCommand(interaction);

      expect(interaction.followUp).toHaveBeenCalledOnce();
      expect(interaction.followUp.mock.calls[0][0].content).toContain('error occurred');
    });

    it('replies directly when interaction is not yet replied and an error occurs', async () => {
      const interaction = createMockInteraction({ commandName: 'matches', replied: false, deferred: false });
      vi.spyOn(db, 'all').mockRejectedValueOnce(new Error('DB failure'));

      await handler.handleSlashCommand(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
    });
  });

  // ─── button interactions ──────────────────────────────────────────────────

  describe('handleButtonInteraction', () => {
    it('ignores interactions not prefixed with signup_', async () => {
      const interaction = createMockInteraction({ customId: 'some_other_button' });
      await handler.handleButtonInteraction(interaction);

      expect(interaction.reply).not.toHaveBeenCalled();
    });
  });

  // ─── string select menu ───────────────────────────────────────────────────

  describe('handleStringSelectMenu', () => {
    it('ignores interactions not prefixed with team_select_', async () => {
      const interaction = createMockInteraction({ customId: 'other_menu', values: ['val'] });
      await handler.handleStringSelectMenu(interaction);

      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('replies with "already signed up" message when user is already a tournament participant', async () => {
      await db.run(
        `INSERT INTO tournaments (id, name, game_id, game_mode_id, status, format, rounds_per_match)
         VALUES ('tu1', 'Team Tourney', ?, ?, 'gather', 'single-elimination', 3)`,
        [game.id, mode.id]
      );
      await db.run(
        `INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username)
         VALUES ('tp1', 'tu1', 'user-123', 'user-123', 'TestUser')`
      );

      const interaction = createMockInteraction({
        customId: 'team_select_tu1',
        values: ['team-abc'],
        user: { id: 'user-123', username: 'TestUser', displayName: 'TestUser' },
      });

      await handler.handleStringSelectMenu(interaction);

      expect(interaction.reply).toHaveBeenCalledOnce();
      expect(interaction.reply.mock.calls[0][0].content).toContain('already signed up');
    });
  });
});
