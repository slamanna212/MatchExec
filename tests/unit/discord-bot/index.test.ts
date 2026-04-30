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

// Prevent real Discord connections
vi.mock('discord.js', () => ({
  // Use function keyword (not arrow) so it can be used as a constructor via `new Client()`
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
    Guilds: 1,
    GuildMessages: 2,
    GuildVoiceStates: 4,
    DirectMessages: 8,
    DirectMessageReactions: 32,
    MessageContent: 16,
  },
  Partials: {
    Message: 0,
    Channel: 1,
    Reaction: 2,
  },
}));

// Mock database — resolve immediately so the IIFE bot.start() doesn't hang
vi.mock('../../../lib/database', () => ({
  waitForDatabaseReady: vi.fn().mockResolvedValue({
    connect: vi.fn(),
    run: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock all bot modules so they don't try to connect to Discord or DB
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
    loadSettings: vi.fn().mockResolvedValue(null), // no settings → bot won't fully init
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
  HealthMonitor: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
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

// Prevent process.exit from terminating the test process
const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

let testVoiceLineForUser: typeof import('../../../processes/discord-bot/index').testVoiceLineForUser;
let postEventAnnouncement: typeof import('../../../processes/discord-bot/index').postEventAnnouncement;

describe('discord-bot/index — exported functions', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    processExitSpy.mockImplementation(() => undefined as never);

    const mod = await import('../../../processes/discord-bot/index');
    testVoiceLineForUser = mod.testVoiceLineForUser;
    postEventAnnouncement = mod.postEventAnnouncement;
  });

  describe('testVoiceLineForUser', () => {
    it('returns { success: false } when the voice handler has not been initialized', async () => {
      // Bot settings are null (SettingsManager returns null), so voiceHandler is never created
      const result = await testVoiceLineForUser('user-123');

      expect(result).toEqual(
        expect.objectContaining({ success: false })
      );
    });

    it('accepts an optional voiceId parameter without throwing', async () => {
      await expect(testVoiceLineForUser('user-123', 'voice-abc')).resolves.not.toThrow();
    });
  });

  describe('postEventAnnouncement', () => {
    it('returns false when the announcement handler has not been initialized', async () => {
      const eventData = {
        id: 'match-1',
        name: 'Test Match',
        description: 'desc',
        game_id: 'game-1',
        type: 'competitive' as const,
        maps: [],
        max_participants: 10,
        guild_id: 'guild-123',
      };

      const result = await postEventAnnouncement(eventData);

      expect(result).toBe(false);
    });
  });
});
