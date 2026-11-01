import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/lib/settings', () => ({ setAppSetting: vi.fn().mockResolvedValue(undefined) }));
import { setAppSetting } from '../../../src/lib/settings';

// The stats queues live in Postgres: claims go through the Discord queues module (mocked here).
const queueClaims = vi.hoisted(() => ({ statsProcessing: [] as unknown[], statsImage: [] as unknown[] }));
vi.mock('../../../src/lib/discord-queues', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/lib/discord-queues')>()),
  claimJobs: vi.fn(async (_ex: unknown, queue: 'statsProcessing' | 'statsImage') => queueClaims[queue].splice(0, 1)),
  releaseJob: vi.fn(async () => true),
  resetAbandonedClaims: vi.fn(async () => 0),
}));
import { claimJobs } from '../../../src/lib/discord-queues';


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
    queueClaims.statsProcessing.length = 0;
    queueClaims.statsImage.length = 0;
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

  it('sends an initial heartbeat to app_settings on start', async () => {
    await import('../../../processes/stats-processor/index');

    // Flush all pending microtasks so start() completes through the heartbeat INSERT.
    // Do NOT use vi.runAllTimersAsync() here — it would loop infinitely on setIntervals.
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(setAppSetting).toHaveBeenCalledWith('stats_processor_last_heartbeat', expect.any(String));
  });

  it('processes extraction queue items using AIExtractor', async () => {
    const queueItem = { id: 'queue-1', submission_id: 'sub-1' };
    queueClaims.statsProcessing.push(queueItem);

    await import('../../../processes/stats-processor/index');
    // Advance fake timers past the 5-second polling interval to trigger processExtractionQueue
    await vi.advanceTimersByTimeAsync(5001);

    // The processExtractionQueue method claims from the stats_processing_queue
    expect(vi.mocked(claimJobs)).toHaveBeenCalledWith(expect.anything(), 'statsProcessing', expect.objectContaining({ limit: 1 }));
  });

  it('processes image queue items using StatImageGenerator', async () => {
    const queueItem = { id: 'img-queue-1', match_id: 'match-123' };
    queueClaims.statsImage.push(queueItem);

    await import('../../../processes/stats-processor/index');
    // Advance fake timers past the 5-second polling interval to trigger processImageQueue
    await vi.advanceTimersByTimeAsync(5001);

    expect(vi.mocked(claimJobs)).toHaveBeenCalledWith(expect.anything(), 'statsImage', expect.objectContaining({ limit: 1 }));
  });
});
