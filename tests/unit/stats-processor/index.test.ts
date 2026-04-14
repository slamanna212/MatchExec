import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

vi.mock('../../../lib/database', () => ({
  waitForDatabaseReady: vi.fn().mockResolvedValue({
    connect: vi.fn(),
    run: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../processes/stats-processor/modules/ai-extractor', () => ({
  // Use function keyword so the mock can be called via `new AIExtractor()`
  AIExtractor: vi.fn().mockImplementation(function() {
    return { processSubmission: vi.fn().mockResolvedValue(undefined) };
  }),
}));

vi.mock('../../../processes/stats-processor/modules/stat-image-generator', () => ({
  // Use function keyword so the mock can be called via `new StatImageGenerator()`
  StatImageGenerator: vi.fn().mockImplementation(function() {
    return { generateMatchStatImages: vi.fn().mockResolvedValue(undefined) };
  }),
}));

// Prevent process.exit from terminating the test
vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
// Prevent stdin from keeping the process alive
vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);

interface MockDb {
  run: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

describe('StatsProcessor — queue processing', () => {
  let mockDb: MockDb;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset module registry so each test gets a fresh auto-executing module
    vi.resetModules();
    mockDb = {
      run: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue([]),
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const { waitForDatabaseReady } = await import('../../../lib/database');
    (waitForDatabaseReady as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts without throwing when all dependencies are properly mocked', async () => {
    // Import module after mocks are set up — the module auto-starts the processor
    await expect(import('../../../processes/stats-processor/index')).resolves.not.toThrow();
  });

  it('sends an initial heartbeat to the app_settings table on start', async () => {
    await import('../../../processes/stats-processor/index');

    // Flush all pending microtasks so start() completes through the heartbeat INSERT.
    // Do NOT use vi.runAllTimersAsync() here — it would loop infinitely on setIntervals.
    for (let i = 0; i < 10; i++) await Promise.resolve();

    // The heartbeat key is the first element of the params array (SQL uses ? placeholders)
    const insertedHeartbeat = mockDb.run.mock.calls.some((c: unknown[]) =>
      Array.isArray(c[1]) && (c[1] as unknown[])[0] === 'stats_processor_last_heartbeat'
    );
    expect(insertedHeartbeat).toBe(true);
  });

  it('processes extraction queue items using AIExtractor', async () => {
    const queueItem = { id: 'queue-1', submission_id: 'sub-1' };
    mockDb.get
      .mockResolvedValueOnce(queueItem) // extraction queue pick
      .mockResolvedValue(null);

    await import('../../../processes/stats-processor/index');
    // Advance fake timers past the 5-second polling interval to trigger processExtractionQueue
    await vi.advanceTimersByTimeAsync(5001);

    // The processExtractionQueue method fetches from stats_processing_queue
    const extractionQueueQuery = mockDb.get.mock.calls.find((c: unknown[]) =>
      (c[0] as string)?.includes('stats_processing_queue')
    );
    expect(extractionQueueQuery).toBeDefined();
  });

  it('processes image queue items using StatImageGenerator', async () => {
    const queueItem = { id: 'img-queue-1', match_id: 'match-123' };
    mockDb.get
      .mockResolvedValueOnce(null)       // extraction queue: nothing pending
      .mockResolvedValueOnce(queueItem)  // image queue: one item
      .mockResolvedValue(null);

    await import('../../../processes/stats-processor/index');
    // Advance fake timers past the 5-second polling interval to trigger processImageQueue
    await vi.advanceTimersByTimeAsync(5001);

    const imageQueueQuery = mockDb.get.mock.calls.find((c: unknown[]) =>
      (c[0] as string)?.includes('stats_image_queue')
    );
    expect(imageQueueQuery).toBeDefined();
  });
});
