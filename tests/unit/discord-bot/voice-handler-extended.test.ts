import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@discordjs/voice', () => ({
  joinVoiceChannel: vi.fn().mockReturnValue({
    state: { status: 'ready' },
    subscribe: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
  }),
  createAudioPlayer: vi.fn().mockReturnValue({
    play: vi.fn(),
    stop: vi.fn(),
    once: vi.fn(),
  }),
  createAudioResource: vi.fn().mockReturnValue({}),
  AudioPlayerStatus: { Idle: 'idle', Playing: 'playing', Paused: 'paused' },
  VoiceConnectionStatus: { Ready: 'ready', Connecting: 'connecting', Disconnected: 'disconnected' },
  getVoiceConnection: vi.fn().mockReturnValue(null),
  entersState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockDiscordClient),
  ChannelType: { GuildVoice: 2, GuildText: 0 },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readdirSync: vi.fn().mockReturnValue(['nextround1.mp3', 'finish1.mp3', 'welcome1.mp3']),
    promises: { readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')) },
  },
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn().mockReturnValue(['nextround1.mp3', 'finish1.mp3', 'welcome1.mp3']),
  promises: { readFile: vi.fn().mockResolvedValue(Buffer.from('audio-data')) },
}));

 
let VoiceHandler: any;
 
let createAudioPlayer: any;

describe('VoiceHandler — Extended', () => {
   
  let voiceHandler: any;
   
  let db: any;
   
  let game: any;
   
  let mode: any;

  beforeAll(async () => {
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

    await db.run(
      `INSERT INTO voices (id, name, path, created_at) VALUES (?, ?, ?, datetime('now'))`,
      ['voice-ext-1', 'Ext Voice', 'public/voices/ext-voice']
    );

    voiceHandler = new VoiceHandler(
      mockDiscordClient,
      db,
      { guild_id: 'guild-ext', voice_announcements_enabled: true, announcer_voice: 'voice-ext-1' }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeMockVoiceChannel(id = 'vc-ext') {
    return {
      id,
      type: 2, // GuildVoice
      guild: { id: 'guild-ext', voiceAdapterCreator: vi.fn() },
      guildId: 'guild-ext',
      bitrate: 64000,
      members: new Map(),
    };
  }

  function makeIdlePlayer() {
    return {
      play: vi.fn(),
      stop: vi.fn(),
      once: vi.fn((event: string, callback: () => void) => {
        if (event === 'idle') queueMicrotask(callback);
      }),
    };
  }

  describe('playVoiceAnnouncement — extended audio types', () => {
    it('plays nextround announcement successfully', async () => {
      const mockVoiceChannel = makeMockVoiceChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockVoiceChannel);
      createAudioPlayer.mockReturnValue(makeIdlePlayer());

      const result = await voiceHandler.playVoiceAnnouncement('vc-ext', 'nextround');
      expect(result).toBe(true);
    });

    it('plays finish announcement successfully', async () => {
      const mockVoiceChannel = makeMockVoiceChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockVoiceChannel);
      createAudioPlayer.mockReturnValue(makeIdlePlayer());

      const result = await voiceHandler.playVoiceAnnouncement('vc-ext', 'finish');
      expect(result).toBe(true);
    });

    it('plays with explicit lineNumber=1', async () => {
      const mockVoiceChannel = makeMockVoiceChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockVoiceChannel);
      createAudioPlayer.mockReturnValue(makeIdlePlayer());

      const result = await voiceHandler.playVoiceAnnouncement('vc-ext', 'welcome', 1);
      expect(result).toBe(true);
    });

    it('returns false when voice announcements are disabled', async () => {
      voiceHandler.updateSettings({
        guild_id: 'guild-ext',
        voice_announcements_enabled: false,
        announcer_voice: 'voice-ext-1',
      });

      const result = await voiceHandler.playVoiceAnnouncement('vc-ext', 'welcome');
      expect(result).toBe(false);
    });
  });

  describe('getNextFirstTeam — extended', () => {
    it('returns blue for a brand-new match', async () => {
      const match = await createMatch(game.id, mode.id);
      const result = await voiceHandler.getNextFirstTeam(match.id);
      expect(result).toBe('blue');
    });

    it('returns red after blue was set as first team', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO match_voice_alternation (match_id, current_team, last_first_team, last_updated_at, updated_at)
         VALUES (?, 'blue', 'blue', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [match.id]
      );
      const result = await voiceHandler.getNextFirstTeam(match.id);
      expect(result).toBe('red');
    });

    it('returns blue after red was set as first team', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO match_voice_alternation (match_id, current_team, last_first_team, last_updated_at, updated_at)
         VALUES (?, 'red', 'red', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [match.id]
      );
      const result = await voiceHandler.getNextFirstTeam(match.id);
      expect(result).toBe('blue');
    });
  });

  describe('updateFirstTeam — extended', () => {
    it('stores blue as last_first_team', async () => {
      const match = await createMatch(game.id, mode.id);
      await voiceHandler.updateFirstTeam(match.id, 'blue');

      const row = await db.get(
        `SELECT last_first_team FROM match_voice_alternation WHERE match_id=?`,
        [match.id]
      );
      expect(row?.last_first_team).toBe('blue');
    });

    it('overwrites existing value when called twice', async () => {
      const match = await createMatch(game.id, mode.id);
      await voiceHandler.updateFirstTeam(match.id, 'red');
      await voiceHandler.updateFirstTeam(match.id, 'blue');

      const row = await db.get(
        `SELECT last_first_team FROM match_voice_alternation WHERE match_id=?`,
        [match.id]
      );
      expect(row?.last_first_team).toBe('blue');
    });
  });

  describe('updateSettings', () => {
    it('disabling voice announcements takes effect immediately', async () => {
      voiceHandler.updateSettings({
        guild_id: 'guild-ext',
        voice_announcements_enabled: false,
        announcer_voice: 'voice-ext-1',
      });

      const mockVoiceChannel = makeMockVoiceChannel();
      mockDiscordClient.channels.fetch.mockResolvedValue(mockVoiceChannel);

      const result = await voiceHandler.playVoiceAnnouncement('vc-ext', 'welcome');
      expect(result).toBe(false);
    });
  });
});
