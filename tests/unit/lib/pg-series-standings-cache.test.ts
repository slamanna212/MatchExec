// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch, createMatchGame, createMatchParticipant, createTournament } from '../../utils/pg-fixtures';
import { createSeriesWithEntrants, linkEvent } from '../../utils/pg-series-fixtures';
import {
  matchGamePlacements, matchParticipants, seriesEntrantMembers, tournamentTeams,
} from '../../../lib/db/schema';
import {
  MAX_AGE_MS, clearStandingsCache, getStandingsFingerprint, standingsCacheSize, withStandingsCache,
} from '../../../src/lib/series/standings-cache';

setupPgTestFile({ resetBetweenTests: true });

const pg = () => getPgTestDb();

async function fixture() {
  const game = await createGame();
  const mode = await createGameMode(game.id);
  const { seriesId, entrants } = await createSeriesWithEntrants(pg(), { entrantType: 'solo', entrants: [{ name: 'A', members: ['alice'] }] });
  const match = await createMatch(game.id, mode.id, { id: 'm1' });
  await linkEvent(seriesId, 'match', match.id);
  const participant = await createMatchParticipant(match.id, 'u-alice', 'alice');
  const mg = await createMatchGame(match.id, { status: 'completed' });
  await pg().insert(matchGamePlacements).values({ id: 'pl1', match_game_id: mg.id, entity_type: 'participant', entity_id: participant.id, position: 1, is_winner: true });
  const tournament = await createTournament(game.id, { id: 't1', game_mode_id: mode.id });
  await linkEvent(seriesId, 'tournament', tournament.id);
  await pg().insert(tournamentTeams).values({ id: 'tt1', tournament_id: tournament.id, team_name: 'Team' });
  return { seriesId, entrants, participant };
}

beforeEach(() => clearStandingsCache());

describe('series standings cache', () => {
  it('returns null for an unknown series and never caches it', async () => {
    expect(await getStandingsFingerprint(pg(), 'nope')).toBeNull();
    const compute = vi.fn(async () => null);
    expect(await withStandingsCache(pg(), 'nope', 'season|entrant', compute)).toBeNull();
    expect(standingsCacheSize()).toBe(0);
  });

  it('serves the cached value while nothing changed, per (scope, view) key', async () => {
    const { seriesId } = await fixture();
    const compute = vi.fn(async () => ({ rows: [Math.random()] }));
    const a = await withStandingsCache(pg(), seriesId, 'season|entrant', compute);
    const b = await withStandingsCache(pg(), seriesId, 'season|entrant', compute);
    expect(b).toBe(a);
    expect(compute).toHaveBeenCalledTimes(1);
    await withStandingsCache(pg(), seriesId, 'season|individual', compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('recomputes after an in-place update of a table without updated_at (placements, roster left_at)', async () => {
    const { seriesId, entrants } = await fixture();
    const compute = vi.fn(async () => ({ n: compute.mock.calls.length }));
    await withStandingsCache(pg(), seriesId, 'k', compute);

    await pg().update(matchGamePlacements).set({ position: 2, is_winner: false }).where(eq(matchGamePlacements.id, 'pl1'));
    await withStandingsCache(pg(), seriesId, 'k', compute);
    expect(compute).toHaveBeenCalledTimes(2);

    await pg().update(seriesEntrantMembers).set({ left_at: new Date() }).where(eq(seriesEntrantMembers.id, entrants[0].memberIds[0]));
    await withStandingsCache(pg(), seriesId, 'k', compute);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('recomputes after a delete and after a change to a tournament team of a tournament event', async () => {
    const { seriesId, participant } = await fixture();
    const fp0 = await getStandingsFingerprint(pg(), seriesId);
    await pg().delete(matchParticipants).where(eq(matchParticipants.id, participant.id));
    const fp1 = await getStandingsFingerprint(pg(), seriesId);
    expect(fp1).not.toBe(fp0);
    await pg().update(tournamentTeams).set({ team_name: 'Renamed' }).where(eq(tournamentTeams.id, 'tt1'));
    expect(await getStandingsFingerprint(pg(), seriesId)).not.toBe(fp1);
  });

  it('ignores changes to matches outside the series', async () => {
    const { seriesId } = await fixture();
    const fp0 = await getStandingsFingerprint(pg(), seriesId);
    const game = await createGame({ id: 'other-game', name: 'Other' });
    const mode = await createGameMode(game.id, { id: 'other-mode' });
    await createMatch(game.id, mode.id, { id: 'unrelated' });
    await createMatchParticipant('unrelated', 'u-bob', 'bob');
    // game_modes is part of the fingerprint (scoring types), so compare after the mode insert
    const fp1 = await getStandingsFingerprint(pg(), seriesId);
    await createMatchParticipant('unrelated', 'u-carol', 'carol');
    expect(await getStandingsFingerprint(pg(), seriesId)).toBe(fp1);
    expect(fp1).not.toBe(fp0);
  });

  it('expires entries after MAX_AGE_MS even when the fingerprint is unchanged', async () => {
    const { seriesId } = await fixture();
    const compute = vi.fn(async () => ({}));
    const t0 = Date.now();
    await withStandingsCache(pg(), seriesId, 'k', compute, t0);
    await withStandingsCache(pg(), seriesId, 'k', compute, t0 + MAX_AGE_MS - 1);
    expect(compute).toHaveBeenCalledTimes(1);
    await withStandingsCache(pg(), seriesId, 'k', compute, t0 + MAX_AGE_MS + 1);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
