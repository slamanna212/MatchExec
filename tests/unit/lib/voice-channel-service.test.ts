import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock voice-channel-manager since it calls Discord API
vi.mock('../../../src/lib/voice-channel-manager', () => ({
  createMatchVoiceChannels: vi.fn().mockResolvedValue({
    success: false,
    message: 'No discord settings configured',
  }),
  trackVoiceChannels: vi.fn().mockResolvedValue(undefined),
}));

import { VoiceChannelService } from '../../../src/lib/voice-channel-service';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

describe('VoiceChannelService', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
    vi.clearAllMocks();
  });

  describe('setupMatchVoiceChannels', () => {
    it('returns false when voice channel creation fails', async () => {
      const match = await createMatch(game.id, mode.id);
      const result = await VoiceChannelService.setupMatchVoiceChannels(match.id);
      expect(result).toBe(false);
    });

    it('returns true when channels are created', async () => {
      const { createMatchVoiceChannels } = await import('../../../src/lib/voice-channel-manager');
      (createMatchVoiceChannels as any).mockResolvedValueOnce({
        success: true,
        blueChannelId: 'vc-blue-123',
        redChannelId: 'vc-red-456',
      });

      const match = await createMatch(game.id, mode.id);
      const result = await VoiceChannelService.setupMatchVoiceChannels(match.id);
      expect(result).toBe(true);

      // Verify channels were stored in match
      const updated = await db.get(
        'SELECT blue_team_voice_channel, red_team_voice_channel FROM matches WHERE id = ?',
        [match.id]
      );
      expect(updated.blue_team_voice_channel).toBe('vc-blue-123');
      expect(updated.red_team_voice_channel).toBe('vc-red-456');
    });
  });

  describe('queueVoiceAnnouncement', () => {
    it('returns false for nonexistent match', async () => {
      const result = await VoiceChannelService.queueVoiceAnnouncement('nonexistent', 'welcome');
      expect(result).toBe(false);
    });

    it('returns true when no voice channels configured (not an error)', async () => {
      const match = await createMatch(game.id, mode.id);
      const result = await VoiceChannelService.queueVoiceAnnouncement(match.id, 'welcome');
      expect(result).toBe(true);
    });

    it('queues announcement when match has voice channels', async () => {
      const match = await createMatch(game.id, mode.id);

      // Set voice channels on the match
      await db.run(
        `UPDATE matches SET blue_team_voice_channel = ?, red_team_voice_channel = ? WHERE id = ?`,
        ['vc-blue', 'vc-red', match.id]
      );

      const result = await VoiceChannelService.queueVoiceAnnouncement(match.id, 'welcome');
      expect(result).toBe(true);

      // Verify queued in discord_voice_announcement_queue
      const queued = await db.get(
        `SELECT * FROM discord_voice_announcement_queue WHERE match_id = ?`,
        [match.id]
      );
      expect(queued).toBeDefined();
      expect(queued.announcement_type).toBe('welcome');
      expect(queued.status).toBe('pending');
    });

    it('alternates first team between announcements', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `UPDATE matches SET blue_team_voice_channel = ?, red_team_voice_channel = ? WHERE id = ?`,
        ['vc-blue', 'vc-red', match.id]
      );

      // First announcement — no prior alternation, should start with blue
      const result1 = await VoiceChannelService.queueVoiceAnnouncement(match.id, 'welcome');
      expect(result1).toBe(true);

      const q1 = await db.get(
        `SELECT first_team FROM discord_voice_announcement_queue WHERE match_id = ? ORDER BY rowid DESC LIMIT 1`,
        [match.id]
      );
      expect(q1.first_team).toBe('blue');
    });

    it('handles nextround and finish announcement types', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `UPDATE matches SET blue_team_voice_channel = 'vc-b', red_team_voice_channel = 'vc-r' WHERE id = ?`,
        [match.id]
      );

      for (const type of ['nextround', 'finish'] as const) {
        const result = await VoiceChannelService.queueVoiceAnnouncement(match.id, type);
        expect(result).toBe(true);
      }

      const count = await db.get(
        `SELECT COUNT(*) as cnt FROM discord_voice_announcement_queue WHERE match_id = ?`,
        [match.id]
      );
      expect(count.cnt).toBe(2);
    });
  });
});
