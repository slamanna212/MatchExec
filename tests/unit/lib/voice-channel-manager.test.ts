import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: async () => {
    const { getMockDbInstance } = await import('../../mocks/database');
    return getMockDbInstance();
  },
}));

import {
  createMatchVoiceChannels,
  deleteMatchVoiceChannels,
  trackVoiceChannels,
} from '@/lib/voice-channel-manager';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';

describe('voice-channel-manager', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
  });

  describe('createMatchVoiceChannels', () => {
    it('returns success when voice channel category is not configured', async () => {
      // No discord_settings row → no category configured
      const result = await createMatchVoiceChannels('match_nonexistent');
      expect(result.success).toBe(true);
      expect(result.message).toContain('not configured');
    });

    it('returns failure when match is not found', async () => {
      await db.run(`
        INSERT INTO discord_settings (guild_id, bot_token, voice_channel_category_id)
        VALUES ('guild1', 'token1', 'cat123')
      `);
      const result = await createMatchVoiceChannels('nonexistent_match');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('queues voice channel creation request', async () => {
      await db.run(`
        INSERT INTO discord_settings (guild_id, bot_token, voice_channel_category_id)
        VALUES ('guild1', 'token1', 'cat123')
      `);
      const match = await createMatch(game.id, mode.id);

      // Start the creation process (don't await — it polls for 30s)
      const promise = createMatchVoiceChannels(match.id);

      // Wait for the DB insert to appear (happens before the poll loop)
      await vi.waitFor(async () => {
        const requests = await db.all(`SELECT * FROM discord_bot_requests WHERE type = 'voice_channel_create'`);
        expect(requests.length).toBeGreaterThanOrEqual(1);
      }, { timeout: 2000 });

      // Don't await the full promise — it would timeout after 30s
      // The test verifies the request was queued correctly
      void promise;
    }, 10000);
  });

  describe('deleteMatchVoiceChannels', () => {
    it('returns true when no auto-created channels exist', async () => {
      const match = await createMatch(game.id, mode.id);
      const result = await deleteMatchVoiceChannels(match.id);
      expect(result).toBe(true);
    });

    it('queues deletion requests for existing channels and removes tracking rows', async () => {
      const match = await createMatch(game.id, mode.id);

      // Insert auto voice channels
      await db.run(`
        INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name)
        VALUES ('av1', ?, 'ch_blue', 'blue'), ('av2', ?, 'ch_red', 'red')
      `, [match.id, match.id]);

      const result = await deleteMatchVoiceChannels(match.id);
      expect(result).toBe(true);

      // Deletion requests queued
      const requests = await db.all(`SELECT * FROM discord_bot_requests WHERE type = 'voice_channel_delete'`);
      expect(requests).toHaveLength(2);

      // Tracking rows removed
      const remaining = await db.all(`SELECT * FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
      expect(remaining).toHaveLength(0);
    });
  });

  describe('trackVoiceChannels', () => {
    it('tracks both channels for dual-team match', async () => {
      const match = await createMatch(game.id, mode.id);
      await trackVoiceChannels(match.id, 'ch_blue', 'ch_red');

      const tracked = await db.all(`SELECT * FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
      expect(tracked).toHaveLength(2);
      expect(tracked.map((r: any) => r.team_name)).toContain('blue');
      expect(tracked.map((r: any) => r.team_name)).toContain('red');
    });

    it('tracks single channel for single-team match', async () => {
      const match = await createMatch(game.id, mode.id);
      await trackVoiceChannels(match.id, 'ch_all');

      const tracked = await db.all(`SELECT * FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
      expect(tracked).toHaveLength(1);
      expect(tracked[0].team_name).toBe('all');
    });
  });
});
