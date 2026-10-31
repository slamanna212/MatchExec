import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import {
  DEFAULT_POSITION_SPREAD,
  getPointsForPosition,
  parsePositionScoringConfig,
} from '@/lib/scoring-functions';

describe('parsePositionScoringConfig', () => {
  it('falls back to the default spread when nothing is configured', () => {
    for (const raw of [null, undefined, '']) {
      expect(parsePositionScoringConfig(raw).pointsPerPosition).toEqual(DEFAULT_POSITION_SPREAD);
    }
  });

  it('parses the { type, pointsPerPosition } form', () => {
    const cfg = parsePositionScoringConfig(JSON.stringify({ type: 'Position', pointsPerPosition: { '1': 10, '2': 5 } }));
    expect(cfg.pointsPerPosition).toEqual({ '1': 10, '2': 5 });
  });

  it('parses the flat per-match override form', () => {
    const cfg = parsePositionScoringConfig(JSON.stringify({ '1': 100, '2': 50 }));
    expect(cfg.pointsPerPosition).toEqual({ '1': 100, '2': 50 });
  });

  it('falls back to the default spread for malformed input instead of throwing or awarding 0', () => {
    for (const raw of ['not json', '[]', '"x"', '{}', JSON.stringify({ '1': 'a' }), JSON.stringify({ first: 3 })]) {
      expect(parsePositionScoringConfig(raw).pointsPerPosition).toEqual(DEFAULT_POSITION_SPREAD);
    }
  });

  it('getPointsForPosition returns 0 beyond the spread and tolerates a config without pointsPerPosition', () => {
    expect(getPointsForPosition(11, parsePositionScoringConfig(null))).toBe(0);
    expect(getPointsForPosition(1, {} as any)).toBe(0);
  });
});
