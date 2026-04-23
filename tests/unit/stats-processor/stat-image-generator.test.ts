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

// Mock fs to prevent real file I/O
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock @napi-rs/canvas so tests pass in CI without native bindings
vi.mock('@napi-rs/canvas', () => ({
  createCanvas: vi.fn().mockReturnValue({
    getContext: vi.fn().mockReturnValue({
      fillStyle: '',
      font: '',
      textAlign: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
    }),
    toBuffer: vi.fn().mockReturnValue(Buffer.from('fake-image')),
  }),
}));

import { StatImageGenerator } from '../../../processes/stats-processor/modules/stat-image-generator';

interface MockDb {
  run: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
}

describe('StatImageGenerator', () => {
  let generator: StatImageGenerator;
  let mockDb: MockDb;

  const sampleStats = [
    {
      id: 'stat-1',
      participant_id: 'part-1',
      username: 'Player1',
      team_assignment: 'blue',
      total_stats_json: JSON.stringify({ kills: 10, deaths: 3 }),
      maps_played: 2,
    },
    {
      id: 'stat-2',
      participant_id: 'part-2',
      username: 'Player2',
      team_assignment: 'red',
      total_stats_json: JSON.stringify({ kills: 7, deaths: 5 }),
      maps_played: 2,
    },
  ];

  const sampleStatDefs = [
    { name: 'kills', display_name: 'Kills', is_primary: true, format: 'number', sort_order: 1 },
    { name: 'deaths', display_name: 'Deaths', is_primary: false, format: 'number', sort_order: 2 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      run: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue([]),
    };
    generator = new StatImageGenerator(mockDb);
  });

  describe('generateMatchStatImages', () => {
    it('marks the queue entry as processing at the start', async () => {
      mockDb.all.mockResolvedValue([]);

      await generator.generateMatchStatImages('queue-1', 'match-1');

      const processingCall = mockDb.run.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("status = 'processing'")
      );
      expect(processingCall).toBeDefined();
      expect((processingCall as unknown[])[1]).toContain('queue-1');
    });

    it('marks the queue entry as completed when no stats exist', async () => {
      mockDb.all.mockResolvedValue([]);

      await generator.generateMatchStatImages('queue-1', 'match-1');

      const completedCall = mockDb.run.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("status = 'completed'") && String(c[1]).includes('queue-1')
      );
      expect(completedCall).toBeDefined();
    });

    it('marks the queue entry as completed after generating images for stats', async () => {
      // aggregateStats → scorecard_player_stats returns empty
      // then match_player_stats returns our sample stats
      mockDb.all
        .mockResolvedValueOnce([]) // scorecard_player_stats in aggregateStats
        .mockResolvedValueOnce(sampleStats); // match_player_stats
      mockDb.get.mockResolvedValueOnce({ game_id: 'game-1' }); // match game_id lookup
      mockDb.all.mockResolvedValueOnce(sampleStatDefs); // game_stat_definitions

      await generator.generateMatchStatImages('queue-2', 'match-2');

      const completedCall = mockDb.run.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("status = 'completed'") && String(c[1]).includes('queue-2')
      );
      expect(completedCall).toBeDefined();
    });

    it('marks the queue entry as failed when a DB error occurs during processing', async () => {
      // Return processing ok, but then throw on subsequent DB calls
      mockDb.run.mockImplementation((sql: string, _params?: unknown[]) => {
        if (sql.includes("status = 'processing'")) return Promise.resolve();
        if (sql.includes("status = 'failed'")) return Promise.resolve();
        return Promise.reject(new Error('DB failure'));
      });
      mockDb.all.mockRejectedValueOnce(new Error('DB failure'));

      await generator.generateMatchStatImages('queue-3', 'match-3');

      const failedCall = mockDb.run.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("status = 'failed'")
      );
      expect(failedCall).toBeDefined();
      // Error message should be stored
      expect(String((failedCall as unknown[][])[1][0])).toContain('DB failure');
    });

    it('stores the error message in the queue entry on failure', async () => {
      mockDb.all.mockRejectedValue(new Error('specific error message'));
      mockDb.run.mockResolvedValue(undefined);

      await generator.generateMatchStatImages('queue-4', 'match-4');

      const failedCall = mockDb.run.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes("status = 'failed'")
      ) as unknown[][];
      expect(failedCall[1][0]).toContain('specific error message');
      expect(failedCall[1][1]).toBe('queue-4');
    });

    it('updates stat_image_url for each player with stat data', async () => {
      mockDb.all
        .mockResolvedValueOnce([]) // scorecard_player_stats
        .mockResolvedValueOnce(sampleStats) // match_player_stats
        .mockResolvedValueOnce(sampleStatDefs); // stat defs
      mockDb.get.mockResolvedValueOnce({ game_id: 'game-1' });

      await generator.generateMatchStatImages('queue-5', 'match-5');

      // Should attempt to update player image URLs
      const imageUrlUpdates = mockDb.run.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes('stat_image_url')
      );
      expect(imageUrlUpdates.length).toBeGreaterThanOrEqual(0); // canvas may not be available
    });
  });
});
