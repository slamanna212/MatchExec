import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(),
}));

import { getDbInstance } from '@/lib/database-init';

// server.ts only exports a singleton. We test the singleton's behavior directly.

const mockGetDbInstance = getDbInstance as ReturnType<typeof vi.fn>;

// We can't easily instantiate ServerLogger directly since server.ts doesn't
// export the class. Test through the exported `logger` singleton instead.
import { logger } from '@/lib/logger/server';

describe('ServerLogger (singleton)', () => {
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
    vi.clearAllMocks();
    // Force level to 'warning' as baseline
    logger['currentLevel'] = 'warning';
    logger['levelCache'] = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('level filtering', () => {
    it('debug and info are suppressed at warning level', () => {
      logger['currentLevel'] = 'warning';
      logger.debug('should be hidden');
      logger.info('should be hidden');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('warning is emitted at warning level', () => {
      logger['currentLevel'] = 'warning';
      logger.warning('visible warning');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('error and critical are emitted at warning level', () => {
      logger['currentLevel'] = 'warning';
      logger.error('error msg');
      logger.critical('critical msg');
      expect(consoleSpy.error).toHaveBeenCalledTimes(2);
    });

    it('all levels are suppressed at critical level except critical', () => {
      logger['currentLevel'] = 'critical';
      logger.debug('x');
      logger.info('x');
      logger.warning('x');
      logger.error('x');
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
      logger.critical('should appear');
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadLogLevel — DB integration', () => {
    it('loads level from DB when cache is expired', async () => {
      logger['levelCache'] = null;
      mockGetDbInstance.mockResolvedValue({
        get: vi.fn().mockResolvedValue({ setting_value: 'debug' }),
      });
      await logger.reload();
      expect(logger.getCurrentLevel()).toBe('debug');
    });

    it('ignores invalid DB level value and keeps existing', async () => {
      logger['currentLevel'] = 'warning';
      logger['levelCache'] = null;
      mockGetDbInstance.mockResolvedValue({
        get: vi.fn().mockResolvedValue({ setting_value: 'nonsense' }),
      });
      await logger.reload();
      expect(logger.getCurrentLevel()).toBe('warning');
    });

    it('falls back to warning when DB throws', async () => {
      logger['levelCache'] = null;
      mockGetDbInstance.mockRejectedValue(new Error('DB down'));
      await logger.reload();
      expect(logger.getCurrentLevel()).toBe('warning');
    });

    it('uses cached level within cache window', async () => {
      const fakeGet = vi.fn().mockResolvedValue({ setting_value: 'info' });
      mockGetDbInstance.mockResolvedValue({ get: fakeGet });
      // Warm cache
      logger['levelCache'] = { level: 'error', timestamp: Date.now() };
      await logger.reload(); // reload clears cache and re-reads
      // Now set a fresh cache to verify it's used on next call
      logger['levelCache'] = { level: 'error', timestamp: Date.now() };
      await logger['loadLogLevel']();
      // DB should NOT have been called again (cache hit)
      expect(fakeGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentLevel', () => {
    it('returns the current log level', () => {
      logger['currentLevel'] = 'info';
      expect(logger.getCurrentLevel()).toBe('info');
    });
  });
});
