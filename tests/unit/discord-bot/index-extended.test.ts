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
  Client: vi.fn(function() {
    return {
      isReady: vi.fn().mockReturnValue(false),
      login: vi.fn().mockResolvedValue('token'),
      destroy: vi.fn(),
      user: null,
      ws: { ping: 0 },
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      channels: { fetch: vi.fn(), cache: new Map() },
      guilds: { cache: new Map() },
      users: { cache: new Map() },
    };
  }),
  GatewayIntentBits: {
    Guilds: 1, GuildMessages: 2, GuildVoiceStates: 4,
    DirectMessages: 8, DirectMessageReactions: 32, MessageContent: 16,
  },
  Partials: { Message: 0, Channel: 1, Reaction: 2 },
}));

vi.mock('../../../lib/database', () => ({
  waitForDatabaseReady: vi.fn().mockResolvedValue({
    connect: vi.fn(),
    run: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../processes/discord-bot/modules/voice-handler', () => ({
  VoiceHandler: vi.fn().mockImplementation(() => ({
    testVoiceLineForUser: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
    disconnectFromAllVoiceChannels: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn(),
  })),
}));

vi.mock('../../../processes/discord-bot/modules/event-handler', () => ({
  EventHandler: vi.fn().mockImplementation(() => ({ updateSettings: vi.fn() })),
}));

vi.mock('../../../processes/discord-bot/modules/announcement-handler', () => ({
  AnnouncementHandler: vi.fn().mockImplementation(() => ({
    postEventAnnouncement: vi.fn().mockResolvedValue({ success: true }),
    updateSettings: vi.fn(),
  })),
}));

vi.mock('../../../processes/discord-bot/modules/settings-manager', () => ({
  SettingsManager: vi.fn().mockImplementation(() => ({
    loadSettings: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('../../../processes/discord-bot/modules/queue-processor', () => ({
  QueueProcessor: vi.fn().mockImplementation(() => ({
    processAllQueues: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn(),
    updateVoiceHandler: vi.fn(),
    setScorecardHandler: vi.fn(),
  })),
}));

vi.mock('../../../processes/discord-bot/modules/reminder-handler', () => ({
  ReminderHandler: vi.fn().mockImplementation(() => ({
    sendSignupNotification: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn(),
  })),
}));

vi.mock('../../../processes/discord-bot/modules/interaction-handler', () => ({
  InteractionHandler: vi.fn().mockImplementation(() => ({
    registerSlashCommands: vi.fn().mockResolvedValue(undefined),
    handleSlashCommand: vi.fn().mockResolvedValue(undefined),
    handleButtonInteraction: vi.fn().mockResolvedValue(undefined),
    handleModalSubmit: vi.fn().mockResolvedValue(undefined),
    handleStringSelectMenu: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn(),
  })),
}));

vi.mock('../../../processes/discord-bot/modules/health-monitor', () => ({
  HealthMonitor: vi.fn().mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

vi.mock('../../../processes/discord-bot/modules/scorecard-handler', () => ({
  ScorecardHandler: vi.fn().mockImplementation(() => ({
    handleDMReply: vi.fn().mockResolvedValue(undefined),
    handleNonReplyDM: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn(),
  })),
}));

vi.mock('../../../processes/discord-bot/modules/winner-vote-handler', () => ({
  WinnerVoteHandler: vi.fn().mockImplementation(() => ({
    sendWinnerVotePrompts: vi.fn().mockResolvedValue(true),
    handleReaction: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../processes/discord-bot/modules/voice-channel-emptiness-monitor', () => ({
  VoiceChannelEmptinessMonitor: vi.fn().mockImplementation(() => ({
    runCheck: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../lib/signup-forms', () => ({
  SignupFormLoader: {
    loadSignupForm: vi.fn().mockResolvedValue({ fields: [], submitButton: { text: 'Sign Up' } }),
  },
}));

vi.mock('../../../lib/version-server', () => ({
  getVersionInfo: vi.fn().mockReturnValue({ version: '0.0.0', isDev: false }),
}));

vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

let testVoiceLineForUser: typeof import('../../../processes/discord-bot/index').testVoiceLineForUser;
let postEventAnnouncement: typeof import('../../../processes/discord-bot/index').postEventAnnouncement;
let botDefault: (typeof import('../../../processes/discord-bot/index'))['default'];

describe('discord-bot/index — extended', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const mod = await import('../../../processes/discord-bot/index');
    testVoiceLineForUser = mod.testVoiceLineForUser;
    postEventAnnouncement = mod.postEventAnnouncement;
    botDefault = mod.default;
  });

  describe('exports', () => {
    it('exports testVoiceLineForUser as an async function', () => {
      expect(typeof testVoiceLineForUser).toBe('function');
      expect(testVoiceLineForUser('u').constructor.name).toBe('Promise');
    });

    it('exports postEventAnnouncement as an async function', () => {
      expect(typeof postEventAnnouncement).toBe('function');
      const result = postEventAnnouncement({
        id: 'x', name: 'n', description: 'd', game_id: 'g',
        type: 'competitive', max_participants: 4, guild_id: 'guild',
      });
      expect(result.constructor.name).toBe('Promise');
      return result;
    });

    it('exports a default bot instance object', () => {
      expect(botDefault).toBeDefined();
      expect(typeof botDefault).toBe('object');
    });
  });

  describe('testVoiceLineForUser', () => {
    it('has a success property in the result', async () => {
      const result = await testVoiceLineForUser('user-abc');
      expect(result).toHaveProperty('success');
    });

    it('returns success: false when voiceHandler is not initialized', async () => {
      const result = await testVoiceLineForUser('user-abc');
      expect(result.success).toBe(false);
    });

    it('includes a message string in the result', async () => {
      const result = await testVoiceLineForUser('user-abc');
      expect(typeof (result as { message: string }).message).toBe('string');
    });

    it('accepts a voiceId parameter without throwing', async () => {
      await expect(testVoiceLineForUser('user-abc', 'voice-123')).resolves.toBeDefined();
    });

    it('returns the same shape regardless of whether voiceId is provided', async () => {
      const withoutVoice = await testVoiceLineForUser('u1');
      const withVoice = await testVoiceLineForUser('u1', 'v1');
      expect(withoutVoice).toHaveProperty('success');
      expect(withVoice).toHaveProperty('success');
    });
  });

  describe('postEventAnnouncement', () => {
    const BASE_EVENT = {
      id: 'match-1',
      name: 'Test Match',
      description: 'A test match',
      game_id: 'game-1',
      type: 'competitive' as const,
      max_participants: 10,
      guild_id: 'guild-123',
    };

    it('returns false when announcementHandler is not initialized', async () => {
      const result = await postEventAnnouncement(BASE_EVENT);
      expect(result).toBe(false);
    });

    it('accepts optional maps field', async () => {
      const result = await postEventAnnouncement({ ...BASE_EVENT, maps: ['map1', 'map2'] });
      expect(result).toBe(false);
    });

    it('accepts optional livestream_link field', async () => {
      const result = await postEventAnnouncement({
        ...BASE_EVENT,
        livestream_link: 'https://twitch.tv/test',
      });
      expect(result).toBe(false);
    });

    it('accepts optional event_image_url field', async () => {
      const result = await postEventAnnouncement({
        ...BASE_EVENT,
        event_image_url: 'https://example.com/image.png',
      });
      expect(result).toBe(false);
    });

    it('accepts optional start_date field', async () => {
      const result = await postEventAnnouncement({
        ...BASE_EVENT,
        start_date: new Date().toISOString(),
      });
      expect(result).toBe(false);
    });

    it('accepts casual type', async () => {
      const result = await postEventAnnouncement({ ...BASE_EVENT, type: 'casual' });
      expect(result).toBe(false);
    });

    it('accepts all optional fields simultaneously', async () => {
      const result = await postEventAnnouncement({
        ...BASE_EVENT,
        maps: ['map1'],
        livestream_link: 'https://twitch.tv/test',
        event_image_url: 'https://example.com/image.png',
        start_date: new Date().toISOString(),
      });
      expect(result).toBe(false);
    });
  });
});
