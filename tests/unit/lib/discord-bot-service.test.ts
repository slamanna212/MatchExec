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

import { DiscordBotService } from '../../../lib/discord-bot-service';
import { getTestDb } from '../../utils/test-db';

describe('DiscordBotService', () => {
  let db: any;
  let service: DiscordBotService;

  beforeEach(async () => {
    db = getTestDb();
    service = new DiscordBotService(db as any);
    vi.clearAllMocks();
  });

  describe('requestVoiceTest', () => {
    it('creates a new voice test request and returns its ID', async () => {
      const requestId = await service.requestVoiceTest('user-123', 'voice-abc');

      expect(requestId).toBeDefined();
      expect(requestId).toContain('voice_test_');

      const row = await db.get(
        'SELECT * FROM discord_bot_requests WHERE id = ?',
        [requestId]
      );
      expect(row).toBeDefined();
      expect(row.type).toBe('voice_test');
      expect(row.status).toBe('pending');
    });

    it('works without a voiceId', async () => {
      const requestId = await service.requestVoiceTest('user-123');
      expect(requestId).toBeDefined();
    });

    it('returns existing pending request for same user', async () => {
      const first = await service.requestVoiceTest('user-999');
      const second = await service.requestVoiceTest('user-999');

      // Both should reference the same pending request
      expect(second).toBe(first);
    });
  });

  describe('getRequestStatus', () => {
    it('returns null for non-existent request', async () => {
      const result = await service.getRequestStatus('nonexistent-id');
      expect(result).toBeNull();
    });

    it('returns request details for existing request', async () => {
      const requestId = await service.requestVoiceTest('user-555', 'voice-xyz');
      const status = await service.getRequestStatus(requestId);

      expect(status).not.toBeNull();
      expect(status!.id).toBe(requestId);
      expect(status!.status).toBe('pending');
      expect(status!.userId).toBe('user-555');
      expect(status!.voiceId).toBe('voice-xyz');
    });

    it('returns correct status after manual update', async () => {
      const requestId = await service.requestVoiceTest('user-777');
      await db.run(
        `UPDATE discord_bot_requests SET status = 'completed', result = ? WHERE id = ?`,
        [JSON.stringify({ success: true }), requestId]
      );

      const status = await service.getRequestStatus(requestId);
      expect(status!.status).toBe('completed');
    });
  });
});
