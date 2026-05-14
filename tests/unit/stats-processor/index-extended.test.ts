import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
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

let mockProcessSubmission = vi.fn().mockResolvedValue(undefined);
let mockGenerateImages = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../processes/stats-processor/modules/ai-extractor', () => ({
  AIExtractor: vi.fn().mockImplementation(function () {
    return { processSubmission: mockProcessSubmission };
  }),
}));

vi.mock('../../../processes/stats-processor/modules/stat-image-generator', () => ({
  StatImageGenerator: vi.fn().mockImplementation(function () {
    return { generateMatchStatImages: mockGenerateImages };
  }),
}));

vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);

interface MockDb {
  run: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

describe('StatsProcessor — Extended', () => {
  let mockDb: MockDb;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();

    mockProcessSubmission = vi.fn().mockResolvedValue(undefined);
    mockGenerateImages = vi.fn().mockResolvedValue(undefined);

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

  it('invokes AIExtractor.processSubmission with correct submission_id and queue item id', async () => {
    const queueItem = { id: 'q-item-1', submission_id: 'sub-abc' };
    mockDb.get
      .mockResolvedValueOnce(queueItem) // extraction queue item
      .mockResolvedValue(null);

    await import('../../../processes/stats-processor/index');
    await vi.advanceTimersByTimeAsync(5001);
    // Flush microtasks
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockProcessSubmission).toHaveBeenCalledWith('sub-abc', 'q-item-1');
  });

  it('invokes StatImageGenerator.generateMatchStatImages with correct ids', async () => {
    const imageItem = { id: 'img-q-1', match_id: 'match-xyz' };
    mockDb.get
      .mockResolvedValueOnce(null) // extraction queue: nothing pending
      .mockResolvedValueOnce(imageItem) // image queue item
      .mockResolvedValue(null);

    await import('../../../processes/stats-processor/index');
    await vi.advanceTimersByTimeAsync(5001);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockGenerateImages).toHaveBeenCalledWith('img-q-1', 'match-xyz');
  });

  it('does not crash when AIExtractor.processSubmission throws', async () => {
    const queueItem = { id: 'q-err', submission_id: 'sub-err' };
    mockProcessSubmission = vi.fn().mockRejectedValue(new Error('extractor exploded'));
    mockDb.get
      .mockResolvedValueOnce(queueItem)
      .mockResolvedValue(null);

    await import('../../../processes/stats-processor/index');
    // Should not throw even when extractor fails
    await expect(vi.advanceTimersByTimeAsync(5001)).resolves.not.toThrow();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

  it('does not crash when StatImageGenerator.generateMatchStatImages throws', async () => {
    const imageItem = { id: 'img-err', match_id: 'match-err' };
    mockGenerateImages = vi.fn().mockRejectedValue(new Error('image gen failed'));
    mockDb.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(imageItem)
      .mockResolvedValue(null);

    await import('../../../processes/stats-processor/index');
    await expect(vi.advanceTimersByTimeAsync(5001)).resolves.not.toThrow();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

  it('sends heartbeat after 5 minutes', async () => {
    await import('../../../processes/stats-processor/index');
    // Flush startup
    for (let i = 0; i < 10; i++) await Promise.resolve();
    mockDb.run.mockClear();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    const heartbeatCall = mockDb.run.mock.calls.some((c: unknown[]) =>
      Array.isArray(c[1]) && (c[1] as unknown[])[0] === 'stats_processor_last_heartbeat'
    );
    expect(heartbeatCall).toBe(true);
  });

  it('does not call processSubmission when extraction queue is empty', async () => {
    mockDb.get.mockResolvedValue(null); // all queues empty

    await import('../../../processes/stats-processor/index');
    await vi.advanceTimersByTimeAsync(5001);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockProcessSubmission).not.toHaveBeenCalled();
  });

  it('does not call generateMatchStatImages when image queue is empty', async () => {
    mockDb.get.mockResolvedValue(null);

    await import('../../../processes/stats-processor/index');
    await vi.advanceTimersByTimeAsync(5001);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockGenerateImages).not.toHaveBeenCalled();
  });
});
