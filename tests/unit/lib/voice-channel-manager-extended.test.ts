import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(async () => {
    const { getTestDb: db } = await import('../../utils/test-db');
    return db();
  }),
}));

import {
  createMatchVoiceChannels,
  deleteMatchVoiceChannels,
  trackVoiceChannels,
} from '@/lib/voice-channel-manager';

describe('Voice Channel Manager — Extended', () => {
  let game: { id: string };
  let mode: { id: string };
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
    db = getTestDb();
  });

  describe('createMatchVoiceChannels — edge cases', () => {
    it('returns success when no discord_settings row exists at all', async () => {
      const result = await createMatchVoiceChannels('any-match');
      expect(result.success).toBe(true);
    });

    it('returns success when voice_channel_category_id is NULL', async () => {
      await db.run(
        `INSERT INTO discord_settings (guild_id, bot_token, voice_channel_category_id) VALUES ('g1', 'tok1', NULL)`
      );
      const result = await createMatchVoiceChannels('any-match');
      expect(result.success).toBe(true);
      expect(result.message).toMatch(/not configured/i);
    });

    it('returns failure when category is set but match does not exist', async () => {
      await db.run(
        `INSERT INTO discord_settings (guild_id, bot_token, voice_channel_category_id) VALUES ('g2', 'tok2', 'cat-123')`
      );
      const result = await createMatchVoiceChannels('nonexistent-match-id');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not found/i);
    });

    it('queues a discord_bot_requests row of type voice_channel_create', async () => {
      await db.run(
        `INSERT INTO discord_settings (guild_id, bot_token, voice_channel_category_id) VALUES ('g3', 'tok3', 'cat-456')`
      );
      const match = await createMatch(game.id, mode.id);

      // Start without awaiting (it polls for 30s for bot response)
      const promise = createMatchVoiceChannels(match.id);

      await vi.waitFor(async () => {
        const rows = await db.all(
          `SELECT id, type FROM discord_bot_requests WHERE type = 'voice_channel_create' AND json_extract(data, '$.matchId') = ?`,
          [match.id]
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
      }, { timeout: 2000 });

      void promise;
    }, 10000);
  });

  describe('deleteMatchVoiceChannels — edge cases', () => {
    it('returns true for an unknown matchId (no channels to delete)', async () => {
      const result = await deleteMatchVoiceChannels('nonexistent-match-999');
      expect(result).toBe(true);
    });

    it('is idempotent — calling twice on same match returns true both times', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name) VALUES ('av-idem', ?, 'ch_idem', 'blue')`,
        [match.id]
      );

      const r1 = await deleteMatchVoiceChannels(match.id);
      expect(r1).toBe(true);

      // Second call — channels already removed
      const r2 = await deleteMatchVoiceChannels(match.id);
      expect(r2).toBe(true);
    });

    it('queues deletion for each channel individually', async () => {
      const match = await createMatch(game.id, mode.id);
      await db.run(
        `INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name)
         VALUES ('av-a', ?, 'ch_a', 'blue'), ('av-b', ?, 'ch_b', 'red'), ('av-c', ?, 'ch_c', 'spectator')`,
        [match.id, match.id, match.id]
      );

      await deleteMatchVoiceChannels(match.id);

      const queued = await db.all(
        `SELECT * FROM discord_bot_requests WHERE type = 'voice_channel_delete'`
      );
      expect(queued.length).toBe(3);
    });
  });

  describe('trackVoiceChannels', () => {
    it('inserts two rows for dual-team tracking', async () => {
      const match = await createMatch(game.id, mode.id);
      await trackVoiceChannels(match.id, 'ch_blue_id', 'ch_red_id');

      const rows = await db.all(
        `SELECT channel_id, team_name FROM auto_voice_channels WHERE match_id = ? ORDER BY team_name`,
        [match.id]
      );
      expect(rows).toHaveLength(2);
      const names = (rows as { team_name: string }[]).map(r => r.team_name);
      expect(names).toContain('blue');
      expect(names).toContain('red');
    });

    it('inserts one row for single-team tracking', async () => {
      const match = await createMatch(game.id, mode.id);
      await trackVoiceChannels(match.id, 'ch_all_id');

      const rows = await db.all(
        `SELECT channel_id, team_name FROM auto_voice_channels WHERE match_id = ?`,
        [match.id]
      );
      expect(rows).toHaveLength(1);
      expect((rows[0] as { team_name: string }).team_name).toBe('all');
    });

    it('stores the correct channel IDs', async () => {
      const match = await createMatch(game.id, mode.id);
      await trackVoiceChannels(match.id, 'blue_ch_999', 'red_ch_888');

      const blue = await db.get<{ channel_id: string }>(
        `SELECT channel_id FROM auto_voice_channels WHERE match_id = ? AND team_name = 'blue'`,
        [match.id]
      );
      const red = await db.get<{ channel_id: string }>(
        `SELECT channel_id FROM auto_voice_channels WHERE match_id = ? AND team_name = 'red'`,
        [match.id]
      );
      expect(blue?.channel_id).toBe('blue_ch_999');
      expect(red?.channel_id).toBe('red_ch_888');
    });
  });
});
