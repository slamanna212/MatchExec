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


vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

// The processor waits for the migrator through system_status (no SQLite connection any more)
vi.mock('../../../lib/db/system-status', () => ({ waitForSystemReady: vi.fn().mockResolvedValue(undefined) }));

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

describe('StatsProcessor — Extended', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    queueClaims.statsProcessing.length = 0;
    queueClaims.statsImage.length = 0;
    vi.resetModules();

    mockProcessSubmission = vi.fn().mockResolvedValue(undefined);
    mockGenerateImages = vi.fn().mockResolvedValue(undefined);


  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes AIExtractor.processSubmission with correct submission_id and queue item id', async () => {
    const queueItem = { id: 'q-item-1', submission_id: 'sub-abc' };
    queueClaims.statsProcessing.push(queueItem);

    await import('../../../processes/stats-processor/index');
    await vi.advanceTimersByTimeAsync(5001);
    // Flush microtasks
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockProcessSubmission).toHaveBeenCalledWith('sub-abc', 'q-item-1');
  });

  it('invokes StatImageGenerator.generateMatchStatImages with correct ids', async () => {
    const imageItem = { id: 'img-q-1', match_id: 'match-xyz' };
    queueClaims.statsImage.push(imageItem);

    await import('../../../processes/stats-processor/index');
    await vi.advanceTimersByTimeAsync(5001);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockGenerateImages).toHaveBeenCalledWith('img-q-1', 'match-xyz');
  });

  it('does not crash when AIExtractor.processSubmission throws', async () => {
    const queueItem = { id: 'q-err', submission_id: 'sub-err' };
    mockProcessSubmission = vi.fn().mockRejectedValue(new Error('extractor exploded'));
    queueClaims.statsProcessing.push(queueItem);

    await import('../../../processes/stats-processor/index');
    // Should not throw even when extractor fails
    await expect(vi.advanceTimersByTimeAsync(5001)).resolves.not.toThrow();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

  it('does not crash when StatImageGenerator.generateMatchStatImages throws', async () => {
    const imageItem = { id: 'img-err', match_id: 'match-err' };
    mockGenerateImages = vi.fn().mockRejectedValue(new Error('image gen failed'));
    queueClaims.statsImage.push(imageItem);

    await import('../../../processes/stats-processor/index');
    await expect(vi.advanceTimersByTimeAsync(5001)).resolves.not.toThrow();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });

  it('sends heartbeat after 5 minutes', async () => {
    await import('../../../processes/stats-processor/index');
    // Flush startup
    for (let i = 0; i < 10; i++) await Promise.resolve();
    vi.mocked(setAppSetting).mockClear();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(setAppSetting).toHaveBeenCalledWith('stats_processor_last_heartbeat', expect.any(String));
  });

  it('does not call processSubmission when extraction queue is empty', async () => {
    await import('../../../processes/stats-processor/index');
    await vi.advanceTimersByTimeAsync(5001);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockProcessSubmission).not.toHaveBeenCalled();
  });

  it('does not call generateMatchStatImages when image queue is empty', async () => {
    await import('../../../processes/stats-processor/index');
    await vi.advanceTimersByTimeAsync(5001);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockGenerateImages).not.toHaveBeenCalled();
  });
});
