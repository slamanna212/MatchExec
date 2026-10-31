import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Client logger module exports a singleton — we test through it.
import { logger } from '@/lib/logger/client';

describe('ClientLogger (singleton)', () => {
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
    // Reset to default level
    logger['currentLevel'] = 'warning';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has colors disabled (browser environment)', () => {
    expect(logger['supportsColor']).toBe(false);
  });

  it('default level is warning', () => {
    expect(logger.getCurrentLevel()).toBe('warning');
  });

  it('debug is suppressed at warning level', () => {
    logger.debug('hidden');
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it('info is suppressed at warning level', () => {
    logger.info('hidden');
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it('warning is emitted at warning level via console.warn', () => {
    logger.warning('visible');
    expect(consoleSpy.warn).toHaveBeenCalledOnce();
  });

  it('error is emitted via console.error', () => {
    logger.error('error msg');
    expect(consoleSpy.error).toHaveBeenCalledOnce();
  });

  it('critical is emitted via console.error', () => {
    logger.critical('critical msg');
    expect(consoleSpy.error).toHaveBeenCalledOnce();
  });

  it('all levels emit when set to debug', () => {
    logger['currentLevel'] = 'debug';
    logger.debug('d');
    logger.info('i');
    expect(consoleSpy.log).toHaveBeenCalledTimes(2);
    logger.warning('w');
    expect(consoleSpy.warn).toHaveBeenCalledOnce();
    logger.error('e');
    logger.critical('c');
    expect(consoleSpy.error).toHaveBeenCalledTimes(2);
  });

  it('reload keeps level at warning (client always uses warning)', async () => {
    await logger.reload();
    expect(logger.getCurrentLevel()).toBe('warning');
  });
});

describe('logger/index re-exports', () => {
  it('exports a logger with expected methods', async () => {
    const { logger: indexLogger } = await import('@/lib/logger/index');
    expect(typeof indexLogger.debug).toBe('function');
    expect(typeof indexLogger.info).toBe('function');
    expect(typeof indexLogger.warning).toBe('function');
    expect(typeof indexLogger.error).toBe('function');
    expect(typeof indexLogger.critical).toBe('function');
    expect(typeof indexLogger.getCurrentLevel).toBe('function');
  });
});
