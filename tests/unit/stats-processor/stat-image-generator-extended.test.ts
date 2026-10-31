import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

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

const mockCtx = {
  fillStyle: '',
  font: '',
  textAlign: '',
  fillRect: vi.fn(),
  fillText: vi.fn(),
};

vi.mock('@napi-rs/canvas', () => ({
  createCanvas: vi.fn().mockReturnValue({
    getContext: vi.fn().mockReturnValue(mockCtx),
    toBuffer: vi.fn().mockReturnValue(Buffer.from('fake-image')),
  }),
}));

import { StatImageGenerator } from '../../../processes/stats-processor/modules/stat-image-generator';

const PRIMARY_STAT_DEFS = [
  { name: 'kills', display_name: 'Kills', is_primary: true, format: 'number', sort_order: 1 },
  { name: 'deaths', display_name: 'Deaths', is_primary: false, format: 'number', sort_order: 2 },
  { name: 'damage', display_name: 'Damage', is_primary: true, format: 'thousands', sort_order: 3 },
  { name: 'kda', display_name: 'KDA', is_primary: true, format: 'decimal', sort_order: 4 },
];

function makeMatchStats(overrides: Record<string, unknown>[] = []) {
  const defaults = [
    {
      id: 'ms-1',
      participant_id: 'p-1',
      username: 'PlayerBlue',
      team_assignment: 'blue',
      total_stats_json: JSON.stringify({ kills: 12, deaths: 3, damage: 15000, kda: 4.5 }),
      maps_played: 3,
    },
    {
      id: 'ms-2',
      participant_id: 'p-2',
      username: 'PlayerRed',
      team_assignment: 'red',
      total_stats_json: JSON.stringify({ kills: 8, deaths: 6, damage: 9000, kda: 1.8 }),
      maps_played: 3,
    },
  ];
  return overrides.length > 0 ? overrides : defaults;
}

describe('StatImageGenerator — Extended', () => {
  let mockDb: {
    run: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
  };
  let generator: StatImageGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      run: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue([]),
    };
    generator = new StatImageGenerator(mockDb);
  });

  describe('generateMatchStatImages — image generation paths', () => {
    it('renders without throwing for blue and red team players', async () => {
      mockDb.all
        .mockResolvedValueOnce([]) // scorecard_player_stats
        .mockResolvedValueOnce(makeMatchStats()) // match_player_stats
        .mockResolvedValueOnce(PRIMARY_STAT_DEFS); // stat defs
      mockDb.get.mockResolvedValueOnce({ game_id: 'game-1' });

      await expect(
        generator.generateMatchStatImages('q-1', 'match-1')
      ).resolves.not.toThrow();
    });

    it('renders without throwing when stat defs are empty', async () => {
      mockDb.all
        .mockResolvedValueOnce([]) // scorecard_player_stats
        .mockResolvedValueOnce(makeMatchStats()) // match_player_stats
        .mockResolvedValueOnce([]); // empty stat defs
      mockDb.get.mockResolvedValueOnce({ game_id: 'game-1' });

      await expect(
        generator.generateMatchStatImages('q-2', 'match-2')
      ).resolves.not.toThrow();
    });

    it('completes without throwing for player with very long username', async () => {
      const longNamePlayer = makeMatchStats([
        {
          id: 'ms-long',
          participant_id: 'p-long',
          username: 'A'.repeat(64),
          team_assignment: 'blue',
          total_stats_json: JSON.stringify({ kills: 5 }),
          maps_played: 1,
        },
      ]);
      mockDb.all
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(longNamePlayer)
        .mockResolvedValueOnce(PRIMARY_STAT_DEFS);
      mockDb.get.mockResolvedValueOnce({ game_id: 'game-1' });

      await expect(
        generator.generateMatchStatImages('q-3', 'match-3')
      ).resolves.not.toThrow();
    });

    it('completes when player has malformed stats JSON', async () => {
      const badJsonPlayer = makeMatchStats([
        {
          id: 'ms-bad',
          participant_id: 'p-bad',
          username: 'BadPlayer',
          team_assignment: 'red',
          total_stats_json: '{not valid json',
          maps_played: 1,
        },
      ]);
      mockDb.all
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(badJsonPlayer)
        .mockResolvedValueOnce(PRIMARY_STAT_DEFS);
      mockDb.get.mockResolvedValueOnce({ game_id: 'game-1' });

      await expect(
        generator.generateMatchStatImages('q-4', 'match-4')
      ).resolves.not.toThrow();
    });

    it('completes when match has many players (10)', async () => {
      const manyPlayers = Array.from({ length: 10 }, (_, i) => ({
        id: `ms-${i}`,
        participant_id: `p-${i}`,
        username: `Player${i}`,
        team_assignment: i % 2 === 0 ? 'blue' : 'red',
        total_stats_json: JSON.stringify({ kills: i * 2, deaths: i }),
        maps_played: 2,
      }));
      mockDb.all
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(manyPlayers)
        .mockResolvedValueOnce(PRIMARY_STAT_DEFS);
      mockDb.get.mockResolvedValueOnce({ game_id: 'game-1' });

      await expect(
        generator.generateMatchStatImages('q-5', 'match-5')
      ).resolves.not.toThrow();
    });
  });

  describe('aggregateStats — via generateMatchStatImages', () => {
    it('inserts aggregated stats for approved submissions', async () => {
      const scorecardStats = [
        {
          participant_id: 'p-1',
          match_game_id: 'mg-1',
          stats_json: JSON.stringify({ kills: 5, deaths: 2 }),
        },
        {
          participant_id: 'p-1',
          match_game_id: 'mg-2',
          stats_json: JSON.stringify({ kills: 7, deaths: 1 }),
        },
      ];
      mockDb.all
        .mockResolvedValueOnce(scorecardStats) // scorecard_player_stats
        .mockResolvedValueOnce([]) // match_player_stats (empty after aggregation)
      ;

      await generator.generateMatchStatImages('q-agg', 'match-agg');

      const insertCall = mockDb.run.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('INSERT INTO match_player_stats')
      );
      expect(insertCall).toBeDefined();
      const params = insertCall![1] as unknown[];
      const statsJson = JSON.parse(params[3] as string);
      expect(statsJson.kills).toBe(12);
      expect(statsJson.deaths).toBe(3);
    });

    it('skips player stats without participant_id during aggregation', async () => {
      const statsWithNull = [
        { participant_id: null, match_game_id: 'mg-1', stats_json: JSON.stringify({ kills: 5 }) },
      ];
      mockDb.all
        .mockResolvedValueOnce(statsWithNull)
        .mockResolvedValueOnce([]);

      await generator.generateMatchStatImages('q-null', 'match-null');

      const insertCall = mockDb.run.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('INSERT INTO match_player_stats')
      );
      expect(insertCall).toBeUndefined();
    });

    it('counts maps_played as number of distinct match_game_ids', async () => {
      const stats = [
        { participant_id: 'p-1', match_game_id: 'mg-1', stats_json: '{"kills":3}' },
        { participant_id: 'p-1', match_game_id: 'mg-1', stats_json: '{"kills":2}' }, // same game id
        { participant_id: 'p-1', match_game_id: 'mg-2', stats_json: '{"kills":4}' }, // different game id
      ];
      mockDb.all
        .mockResolvedValueOnce(stats)
        .mockResolvedValueOnce([]);

      await generator.generateMatchStatImages('q-maps', 'match-maps');

      const insertCall = mockDb.run.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('INSERT INTO match_player_stats')
      );
      expect(insertCall).toBeDefined();
      // maps_played is 5th param (index 4)
      expect((insertCall![1] as unknown[])[4]).toBe(2);
    });
  });
});
