/**
 * Fixtures for the playoff tests: a head_to_head league whose standings are decided by an explicit finishing order
 * (every entrant beats every entrant ranked below it), plus planned playoff events. Use with setupPgTestFile().
 */
import { eq } from 'drizzle-orm';
import { getPgTestDb } from './pg-test-db';
import { createSeriesWithEntrants, modeWithMaps } from './pg-series-fixtures';
import { normalMatch, setupStandingsWorld, type StandingsWorld } from './pg-standings-fixtures';
import { series } from '../../lib/db/schema';
import { createSeriesPlannedEvent } from '@/lib/series';
import type { SeriesEventRole, SeriesSeedingRule } from '../../shared/series-types';

export interface LeagueEntrant {
  name: string;
  division?: string;
  status?: 'pending' | 'active' | 'withdrawn';
}

export interface League {
  world: StandingsWorld;
  seriesId: string;
  /** Entrant ids by name. */
  id: Record<string, string>;
  /** Plays one match: `winner` takes the only map. Extra event fields (stage_id, ...) go in `ev`. */
  play: (winner: string, loser: string, ev?: Record<string, unknown>) => Promise<unknown>;
  /** Everyone beats everyone ranked below them in `order`. */
  rankBy: (order: string[], ev?: Record<string, unknown>) => Promise<void>;
}

/** A Normal head_to_head series with a game + mode (so tournaments can be created) and a two-player roster per entrant. */
export async function createLeague(
  entrants: LeagueEntrant[], opts: { announcements?: boolean; status?: 'created' | 'registration' | 'active' | 'complete' | 'cancelled' } = {},
): Promise<League> {
  const db = getPgTestDb();
  const world = await setupStandingsWorld();
  const s = await createSeriesWithEntrants(db, {
    entrantType: 'team', scoringType: 'Normal', gameId: world.gameId, status: opts.status ?? 'active', scoringConfig: { mode: 'head_to_head' },
    entrants: entrants.map((e) => ({ name: e.name, division: e.division, status: e.status, members: [`${e.name}-1`, `${e.name}-2`] })),
  });
  const { modeId } = await modeWithMaps(world.gameId, 'Normal', 5, 5); // tournaments need a mode with maps
  await db.update(series).set({ game_mode_id: modeId, announcements: opts.announcements ?? true }).where(eq(series.id, s.seriesId));
  const id = Object.fromEntries(s.entrants.map((e) => [e.name, e.id]));
  const play: League['play'] = (winner, loser, ev = {}) =>
    normalMatch(world, s.seriesId, { entrant: id[winner], players: [`${winner}-1`], name: winner }, { entrant: id[loser], players: [`${loser}-1`], name: loser }, ['a'], ev);
  const rankBy: League['rankBy'] = async (order, ev = {}) => {
    for (const [i, w] of order.entries()) for (const l of order.slice(i + 1)) await play(w, l, ev);
  };
  return { world, seriesId: s.seriesId, id, play, rankBy };
}

export const bracketRule = (over: Partial<SeriesSeedingRule> = {}): SeriesSeedingRule => ({
  source: 'season', top: 4, format: 'single-elimination', template: { name: 'Playoffs' }, ...over,
});

/** A planned playoff event with the given rule. Returns its id. */
export async function plannedPlayoff(
  seriesId: string, rule: SeriesSeedingRule = bracketRule(), over: { role?: SeriesEventRole; stage_id?: string | null; week?: number } = {},
): Promise<string> {
  return createSeriesPlannedEvent(getPgTestDb(), seriesId, { role: over.role ?? 'season_playoff', seeding_rule: rule, stage_id: over.stage_id, week: over.week });
}
