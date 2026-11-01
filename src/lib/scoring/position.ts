/**
 * Pure position-scoring calculations (no database, no I/O). Everything that needs the database lives in
 * `src/lib/matches/*`.
 */
import { logger } from '../logger';
import type { PositionScoringConfig } from '@/shared/types';

/** Points for a finishing position under a spread. Returns 0 when the position is not in the config. */
export function getPointsForPosition(position: number, config: PositionScoringConfig): number {
  return config?.pointsPerPosition?.[position.toString()] ?? 0;
}

/**
 * Points spread used when neither the match, its tournament, nor the game defines one (F1-style top 10).
 * Without it every Position result would award 0 and tie.
 */
export const DEFAULT_POSITION_SPREAD: Record<string, number> = {
  '1': 25, '2': 18, '3': 15, '4': 12, '5': 10, '6': 8, '7': 6, '8': 4, '9': 2, '10': 1,
};

/**
 * Normalise a stored spread into a PositionScoringConfig. Accepts the `{ type, pointsPerPosition }` form (games,
 * tournaments) and the flat `{ "1": 25, ... }` form (per-match override from the create form), as an object (jsonb)
 * or a JSON string. Missing or malformed input falls back to DEFAULT_POSITION_SPREAD.
 */
export function parsePositionScoringConfig(raw: unknown): PositionScoringConfig {
  const fallback: PositionScoringConfig = { type: 'Position', pointsPerPosition: DEFAULT_POSITION_SPREAD };
  if (raw === null || raw === undefined || raw === '') return fallback;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      logger.error('Unparseable position scoring spread, using default spread');
      return fallback;
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fallback;
  const record = parsed as Record<string, unknown>;
  const spread = (record.pointsPerPosition ?? record) as Record<string, unknown>;
  const entries = typeof spread === 'object' && spread !== null ? Object.entries(spread) : [];
  const valid = entries.length > 0 &&
    entries.every(([pos, pts]) => /^[1-9]\d*$/.test(pos) && typeof pts === 'number' && Number.isFinite(pts));
  if (!valid) {
    logger.error('Malformed position scoring spread, using default spread');
    return fallback;
  }
  return { type: 'Position', pointsPerPosition: spread as Record<string, number> };
}

/** participantId -> points for each (participantId -> 1-based position) entry. */
export function calculatePointsFromConfig(
  positionResults: Record<string, number>,
  config: PositionScoringConfig,
): Record<string, number> {
  const pointsAwarded: Record<string, number> = {};
  for (const [participantId, position] of Object.entries(positionResults)) {
    pointsAwarded[participantId] = getPointsForPosition(position, config);
  }
  return pointsAwarded;
}

/**
 * Competition ranking (1, 1, 3) by points, highest first: tied entries share a position, and a tie for the top
 * spot yields no winner, matching determineMatchWinner's tie handling.
 */
export function rankByPoints(
  points: Map<string, number>,
): Array<{ teamId: string; points: number; position: number; isWinner: boolean }> {
  const ranked = [...points.entries()].sort((a, b) => b[1] - a[1]);
  const topTied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
  let position = 0;
  return ranked.map(([teamId, pts], i) => {
    if (i === 0 || pts !== ranked[i - 1][1]) position = i + 1;
    return { teamId, points: pts, position, isWinner: position === 1 && !topTied };
  });
}
