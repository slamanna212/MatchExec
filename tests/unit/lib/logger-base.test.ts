import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseLogger, type LogLevel } from '@/lib/logger/base';

// Concrete subclass for testing the abstract base
class TestLogger extends BaseLogger {
  public loadCallCount = 0;
  protected async loadLogLevel(): Promise<void> {
    this.loadCallCount++;
  }

  // Expose protected methods for testing
  public testShouldLog(level: LogLevel): boolean {
    return this.shouldLog(level);
  }

  public testFormatMessage(level: LogLevel, args: unknown[]): string {
    return this.formatMessage(level, args);
  }

  public testFormatJsonMessage(level: LogLevel, args: unknown[]): string {
    return this.formatJsonMessage(level, args);
  }

  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  public setFormat(format: 'text' | 'json'): void {
    this.logFormat = format;
  }
}

describe('BaseLogger', () => {
  let logger: TestLogger;
  let consoleSpy: { log: any; warn: any; error: any };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
    logger = new TestLogger();
    logger.destroy(); // Stop the interval immediately
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up any remaining intervals
    logger.destroy();
  });

  describe('shouldLog', () => {
    it('logs at or above current level', () => {
      logger.setLevel('warning');
      expect(logger.testShouldLog('warning')).toBe(true);
      expect(logger.testShouldLog('error')).toBe(true);
      expect(logger.testShouldLog('critical')).toBe(true);
    });

    it('does not log below current level', () => {
      logger.setLevel('warning');
      expect(logger.testShouldLog('debug')).toBe(false);
      expect(logger.testShouldLog('info')).toBe(false);
    });

    it('logs everything at debug level', () => {
      logger.setLevel('debug');
      expect(logger.testShouldLog('debug')).toBe(true);
      expect(logger.testShouldLog('info')).toBe(true);
      expect(logger.testShouldLog('warning')).toBe(true);
      expect(logger.testShouldLog('error')).toBe(true);
      expect(logger.testShouldLog('critical')).toBe(true);
    });

    it('only logs critical at critical level', () => {
      logger.setLevel('critical');
      expect(logger.testShouldLog('debug')).toBe(false);
      expect(logger.testShouldLog('info')).toBe(false);
      expect(logger.testShouldLog('warning')).toBe(false);
      expect(logger.testShouldLog('error')).toBe(false);
      expect(logger.testShouldLog('critical')).toBe(true);
    });
  });

  describe('formatMessage', () => {
    it('includes timestamp, level, and message', () => {
      const result = logger.testFormatMessage('info', ['hello world']);
      expect(result).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[INFO\] hello world$/);
    });

    it('joins multiple args with space', () => {
      const result = logger.testFormatMessage('debug', ['foo', 'bar', 'baz']);
      expect(result).toContain('foo bar baz');
    });

    it('serializes objects as JSON', () => {
      const result = logger.testFormatMessage('error', [{ key: 'value' }]);
      expect(result).toContain('{"key":"value"}');
    });

    it('serializes Error objects with message and stack', () => {
      const err = new Error('test error');
      const result = logger.testFormatMessage('error', [err]);
      expect(result).toContain('test error');
    });

    it('converts numbers to string', () => {
      const result = logger.testFormatMessage('info', [42]);
      expect(result).toContain('42');
    });
  });

  describe('formatJsonMessage', () => {
    it('produces valid JSON with required fields', () => {
      const result = logger.testFormatJsonMessage('info', ['test message']);
      const parsed = JSON.parse(result);
      expect(parsed.level).toBe('info');
      expect(parsed.severity).toBe(1);
      expect(parsed.message).toBe('test message');
      expect(parsed.timestamp).toBeDefined();
    });

    it('merges object args into top-level fields', () => {
      const result = logger.testFormatJsonMessage('debug', [{ requestId: '123' }]);
      const parsed = JSON.parse(result);
      expect(parsed.requestId).toBe('123');
    });

    it('includes error details for Error objects', () => {
      const err = new Error('boom');
      const result = logger.testFormatJsonMessage('error', [err]);
      const parsed = JSON.parse(result);
      expect(parsed.error.message).toBe('boom');
      expect(parsed.error.name).toBe('Error');
    });

    it('omits message field when no string args', () => {
      const result = logger.testFormatJsonMessage('warning', [{ ctx: 'data' }]);
      const parsed = JSON.parse(result);
      expect(parsed.message).toBeUndefined();
    });
  });

  describe('log methods', () => {
    beforeEach(() => {
      logger.setLevel('debug');
    });

    it('debug() calls console.log', () => {
      logger.debug('debug msg');
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('info() calls console.log', () => {
      logger.info('info msg');
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('warning() calls console.warn', () => {
      logger.warning('warn msg');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('error() calls console.error', () => {
      logger.error('error msg');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('critical() calls console.error', () => {
      logger.critical('critical msg');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('skips logging when below current level', () => {
      logger.setLevel('error');
      logger.debug('should not log');
      logger.info('should not log');
      logger.warning('should not log');
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });
  });

  describe('JSON format mode', () => {
    beforeEach(() => {
      logger.setLevel('debug');
      logger.setFormat('json');
    });

    it('error() uses console.error in JSON mode', () => {
      logger.error('json error');
      expect(consoleSpy.error).toHaveBeenCalled();
      const call = consoleSpy.error.mock.calls[0][0];
      expect(() => JSON.parse(call)).not.toThrow();
    });

    it('debug() uses console.log in JSON mode', () => {
      logger.debug('json debug');
      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      const parsed = JSON.parse(call);
      expect(parsed.level).toBe('debug');
    });
  });

  describe('getCurrentLevel and reload', () => {
    it('getCurrentLevel returns current level', () => {
      logger.setLevel('info');
      expect(logger.getCurrentLevel()).toBe('info');
    });

    it('reload clears cache and calls loadLogLevel', async () => {
      logger.loadCallCount = 0;
      await logger.reload();
      expect(logger.loadCallCount).toBe(1);
    });
  });

  describe('destroy', () => {
    it('clears the reload interval', () => {
      // Should not throw when called multiple times
      logger.destroy();
      logger.destroy();
    });
  });
});
