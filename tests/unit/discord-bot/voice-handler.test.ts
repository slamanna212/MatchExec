import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

// Mock the logger to prevent database access during import
vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

// Mock @discordjs/voice
vi.mock('@discordjs/voice', () => ({
  joinVoiceChannel: vi.fn().mockReturnValue({
    state: { status: 'ready' },
    subscribe: vi.fn(),
    destroy: vi.fn()
  }),
  createAudioPlayer: vi.fn().mockReturnValue({
    play: vi.fn(),
    stop: vi.fn(),
    once: vi.fn()
  }),
  createAudioResource: vi.fn().mockReturnValue({}),
  AudioPlayerStatus: {
    Idle: 'idle',
    Playing: 'playing',
    Paused: 'paused'
  },
  VoiceConnectionStatus: {
    Ready: 'ready',
    Connecting: 'connecting',
    Disconnected: 'disconnected'
  },
  getVoiceConnection: vi.fn().mockReturnValue(null),
  entersState: vi.fn().mockResolvedValue(undefined)
}));

// Mock discord.js
vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockDiscordClient),
  ChannelType: {
    GuildVoice: 2,
    GuildText: 0
  }
}));

// Mock fs
vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn().mockReturnValue(true),
      readdirSync: vi.fn().mockReturnValue(['welcome1.mp3', 'welcome2.mp3', 'nextround1.mp3', 'finish1.mp3']),
      promises: {
        readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data'))
      }
    },
    existsSync: vi.fn().mockReturnValue(true),
    readdirSync: vi.fn().mockReturnValue(['welcome1.mp3', 'welcome2.mp3', 'nextround1.mp3', 'finish1.mp3']),
    promises: {
      readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data'))
    }
  };
});

// Import the module after mocks are set up
let VoiceHandler: any;
let createAudioPlayer: any;

describe('VoiceHandler', () => {
  let voiceHandler: any;
  let db: any;
  let game: any;
  let mode: any;

  beforeAll(async () => {
    // Dynamically import after mocks
    const voiceModule = await import('../../../processes/discord-bot/modules/voice-handler');
    VoiceHandler = voiceModule.VoiceHandler;

    const discordVoice = await import('@discordjs/voice');
    createAudioPlayer = discordVoice.createAudioPlayer;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    resetDiscordMocks();
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;

    // Create a voice in the database
    await db.run(`
      INSERT INTO voices (id, name, path, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `, ['voice-1', 'Test Voice', 'public/voices/test-voice']);

    const settings = {
      guild_id: 'guild-123',
      voice_announcements_enabled: true,
      announcer_voice: 'voice-1'
    };

    voiceHandler = new VoiceHandler(
      mockDiscordClient as any,
      db,
      settings as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('playVoiceAnnouncement', () => {
    it('should play welcome announcement in voice channel', async () => {
      const mockVoiceChannel = {
        id: 'voice-channel-123',
        type: 2, // GuildVoice
        guild: {
          id: 'guild-123',
          voiceAdapterCreator: vi.fn()
        }
      };

      mockDiscordClient.channels.fetch.mockResolvedValue(mockVoiceChannel);

      // Setup the audio player mock to trigger idle event immediately
      const mockPlayer = {
        play: vi.fn(),
        stop: vi.fn(),
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'idle') {
            // Use queueMicrotask to run callback immediately after current execution
            queueMicrotask(callback);
          }
        })
      };
      (createAudioPlayer as any).mockReturnValue(mockPlayer);

      const result = await voiceHandler.playVoiceAnnouncement('voice-channel-123', 'welcome');
      expect(result).toBe(true);
    });

    it('should not play when voice announcements are disabled', async () => {
      const settings = {
        guild_id: 'guild-123',
        voice_announcements_enabled: false,
        announcer_voice: 'voice-1'
      };

      voiceHandler.updateSettings(settings as any);

      const result = await voiceHandler.playVoiceAnnouncement('voice-channel-123', 'welcome');

      expect(result).toBe(false);
    });

    it('should handle missing voice channel gracefully', async () => {
      mockDiscordClient.channels.fetch.mockResolvedValue(null);

      const result = await voiceHandler.playVoiceAnnouncement('invalid-channel', 'welcome');

      expect(result).toBe(false);
    });

    it('should handle non-voice channel', async () => {
      const mockTextChannel = {
        id: 'text-channel-123',
        type: 0, // GuildText
        guild: {
          id: 'guild-123'
        }
      };

      mockDiscordClient.channels.fetch.mockResolvedValue(mockTextChannel);

      const result = await voiceHandler.playVoiceAnnouncement('text-channel-123', 'welcome');

      expect(result).toBe(false);
    });

    it('should use fallback voice when none configured', async () => {
      const settings = {
        guild_id: 'guild-123',
        voice_announcements_enabled: true,
        announcer_voice: null
      };

      voiceHandler.updateSettings(settings as any);

      const mockVoiceChannel = {
        id: 'voice-channel-fallback',
        type: 2,
        guild: {
          id: 'guild-123',
          voiceAdapterCreator: vi.fn()
        }
      };

      mockDiscordClient.channels.fetch.mockResolvedValue(mockVoiceChannel);

      const mockPlayer = {
        play: vi.fn(),
        stop: vi.fn(),
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'idle') {
            queueMicrotask(callback);
          }
        })
      };
      (createAudioPlayer as any).mockReturnValue(mockPlayer);

      const result = await voiceHandler.playVoiceAnnouncement('voice-channel-fallback', 'welcome');
      expect(result).toBe(true);
    });

  });

  describe('testVoiceLineForUser', () => {
    it('should test voice line for user in voice channel', async () => {
      const mockVoiceChannel = {
        id: 'voice-channel-user',
        type: 2,
        guild: {
          id: 'guild-123',
          voiceAdapterCreator: vi.fn()
        }
      };

      const mockMember = {
        voice: {
          channel: mockVoiceChannel
        }
      };

      const mockGuild = {
        members: {
          fetch: vi.fn().mockResolvedValue(mockMember)
        }
      };

      mockDiscordClient.guilds.fetch.mockResolvedValue(mockGuild);
      mockDiscordClient.channels.fetch.mockResolvedValue(mockVoiceChannel);

      const mockPlayer = {
        play: vi.fn(),
        stop: vi.fn(),
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'idle') {
            queueMicrotask(callback);
          }
        })
      };
      (createAudioPlayer as any).mockReturnValue(mockPlayer);

      const result = await voiceHandler.testVoiceLineForUser('user-123');
      expect(result.success).toBe(true);
      expect(result.channelId).toBe('voice-channel-user');
    });

    it('should fail when user is not in voice channel', async () => {
      const mockMember = {
        voice: {
          channel: null
        }
      };

      const mockGuild = {
        members: {
          fetch: vi.fn().mockResolvedValue(mockMember)
        }
      };

      mockDiscordClient.guilds.fetch.mockResolvedValue(mockGuild);

      const result = await voiceHandler.testVoiceLineForUser('user-456');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not in any voice channel');
    });

    it('should handle errors gracefully', async () => {
      mockDiscordClient.guilds.fetch.mockRejectedValue(new Error('Guild not found'));

      const result = await voiceHandler.testVoiceLineForUser('user-789');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error');
    });
  });

  describe('playTeamAnnouncements', () => {
    it('should play announcements to both team channels sequentially', async () => {
      const mockBlueChannel = {
        id: 'blue-voice-channel',
        type: 2,
        guild: {
          id: 'guild-123',
          voiceAdapterCreator: vi.fn()
        }
      };

      const mockRedChannel = {
        id: 'red-voice-channel',
        type: 2,
        guild: {
          id: 'guild-123',
          voiceAdapterCreator: vi.fn()
        }
      };

      mockDiscordClient.channels.fetch
        .mockResolvedValueOnce(mockBlueChannel)
        .mockResolvedValueOnce(mockRedChannel);

      const mockPlayer = {
        play: vi.fn(),
        stop: vi.fn(),
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'idle') {
            queueMicrotask(callback);
          }
        })
      };
      (createAudioPlayer as any).mockReturnValue(mockPlayer);

      const result = await voiceHandler.playTeamAnnouncements(
        'blue-voice-channel',
        'red-voice-channel',
        'welcome',
        'blue'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('2 channels');
    });

    it('should handle single team announcement', async () => {
      const mockBlueChannel = {
        id: 'blue-voice-only',
        type: 2,
        guild: {
          id: 'guild-123',
          voiceAdapterCreator: vi.fn()
        }
      };

      mockDiscordClient.channels.fetch.mockResolvedValue(mockBlueChannel);

      const mockPlayer = {
        play: vi.fn(),
        stop: vi.fn(),
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'idle') {
            queueMicrotask(callback);
          }
        })
      };
      (createAudioPlayer as any).mockReturnValue(mockPlayer);

      const result = await voiceHandler.playTeamAnnouncements(
        'blue-voice-only',
        null,
        'welcome',
        'blue'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 channels');
    });

    it('should fail when no channels provided', async () => {
      const result = await voiceHandler.playTeamAnnouncements(
        null,
        null,
        'welcome',
        'blue'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('No voice channels');
    });

    it('should not play when voice announcements disabled', async () => {
      const settings = {
        guild_id: 'guild-123',
        voice_announcements_enabled: false,
        announcer_voice: 'voice-1'
      };

      voiceHandler.updateSettings(settings as any);

      const result = await voiceHandler.playTeamAnnouncements(
        'blue-channel',
        'red-channel',
        'welcome',
        'blue'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('disabled');
    });
  });

  describe('getNextFirstTeam', () => {
    it('should return blue when no record exists', async () => {
      const match = await createMatch(game.id, mode.id);

      const nextTeam = await voiceHandler.getNextFirstTeam(match.id);

      expect(nextTeam).toBe('blue');
    });

    it('should alternate between blue and red', async () => {
      const match = await createMatch(game.id, mode.id);

      // Set last first team as blue
      await db.run(`
        INSERT INTO match_voice_alternation (match_id, current_team, last_first_team, last_updated_at, updated_at)
        VALUES (?, 'blue', 'blue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [match.id]);

      const nextTeam = await voiceHandler.getNextFirstTeam(match.id);

      // Should alternate to red
      expect(nextTeam).toBe('red');
    });

    it('should return blue after red', async () => {
      const match = await createMatch(game.id, mode.id);

      // Set last first team as red
      await db.run(`
        INSERT INTO match_voice_alternation (match_id, current_team, last_first_team, last_updated_at, updated_at)
        VALUES (?, 'red', 'red', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [match.id]);

      const nextTeam = await voiceHandler.getNextFirstTeam(match.id);

      expect(nextTeam).toBe('blue');
    });
  });

  describe('updateFirstTeam', () => {
    it('should update first team for match', async () => {
      const match = await createMatch(game.id, mode.id);

      await voiceHandler.updateFirstTeam(match.id, 'red');

      const record = await db.get(`
        SELECT last_first_team FROM match_voice_alternation WHERE match_id = ?
      `, [match.id]);

      expect(record.last_first_team).toBe('red');
    });

    it('should replace existing record', async () => {
      const match = await createMatch(game.id, mode.id);

      // Create initial record
      await voiceHandler.updateFirstTeam(match.id, 'blue');

      // Update to red
      await voiceHandler.updateFirstTeam(match.id, 'red');

      const record = await db.get(`
        SELECT last_first_team FROM match_voice_alternation WHERE match_id = ?
      `, [match.id]);

      expect(record.last_first_team).toBe('red');
    });
  });

  describe('disconnectFromVoiceChannel', () => {
    it('should disconnect from voice channel', async () => {
      // Just ensure it doesn't throw
      const result = await voiceHandler.disconnectFromVoiceChannel('voice-channel-123');

      // Should return false since no connection exists
      expect(result).toBe(false);
    });
  });

  describe('disconnectFromAllVoiceChannels', () => {
    it('should disconnect from all voice channels', async () => {
      // Just ensure it doesn't throw
      await expect(voiceHandler.disconnectFromAllVoiceChannels()).resolves.not.toThrow();
    });
  });
});
