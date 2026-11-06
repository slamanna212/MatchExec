/**
 * Withdrawing an entrant mid-season: the entrant becomes `withdrawn` and its unplayed series matches (`created` /
 * `gather` / `assign`) are dealt with:
 * - 2-team Normal matches are cancelled (`transitionMatch`), or for `forfeit` completed with the opponent winning every
 *   map through the normal results path (so placements, notifications and completion side effects all run);
 * - races and other multi-entrant matches lose the entrant's participants and team rows instead (cancelled when fewer
 *   than two entrants remain).
 * Played, in-progress and finished matches, and tournament matches (the bracket's organiser handles those), are untouched.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db, Executor } from '../../../lib/db';
import { gameModes, matchParticipants, matchTeams, matches, seriesEvents } from '../../../lib/db/schema';
import type { WithdrawEntrantInput } from '../../../shared/series-types';
import { logger } from '../logger';
import {
  MatchTransitionError, casMatchStatus, getMatchGames, initializeMatchGames, lockMatch, matchGameIdFor, submitGameResult, transitionMatch,
} from '../matches';
import { getEntrantRow, updateEntrant, type SeriesEntrantWithMembers } from './entrants';
import { SeriesError, lockSeries } from './series';

const UNSTARTED = ['created', 'gather', 'assign'] as const;

export interface WithdrawResult {
  entrant: SeriesEntrantWithMembers;
  /** Matches cancelled (including races that fell below two entrants). */
  cancelled: number;
  /** 2-team matches completed as a forfeit win for the opponent. */
  forfeited: number;
  /** Races the entrant was removed from (the race goes on without it). */
  removed_from: number;
}

interface OpenMatch { id: string; status: (typeof UNSTARTED)[number]; scoring_type: string | null }

/** The series' standalone matches this entrant is on that have not started. */
async function listUnplayedMatches(ex: Executor, seriesId: string, entrantId: string): Promise<OpenMatch[]> {
  const rows = await ex.selectDistinct({ id: matches.id, status: matches.status, scoring_type: gameModes.scoring_type, created: matches.created_at })
    .from(matchTeams)
    .innerJoin(matches, eq(matches.id, matchTeams.match_id))
    .innerJoin(seriesEvents, and(eq(seriesEvents.match_id, matches.id), eq(seriesEvents.series_id, seriesId)))
    .leftJoin(gameModes, and(eq(gameModes.id, matches.mode_id), eq(gameModes.game_id, matches.game_id)))
    .where(and(eq(matchTeams.series_entrant_id, entrantId), inArray(matches.status, [...UNSTARTED])))
    .orderBy(asc(matches.created_at), asc(matches.id));
  return rows.map(({ created: _created, ...r }) => r as OpenMatch);
}

async function activeTeams(ex: Executor, matchId: string) {
  return ex.select({ id: matchTeams.id, entrant: matchTeams.series_entrant_id }).from(matchTeams)
    .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
}

/** Remove the entrant's players and team rows from a race; false when it must be cancelled instead (fewer than 2 entrants left). */
async function removeFromRace(tx: Executor, matchId: string, entrantId: string): Promise<boolean> {
  await lockMatch(tx, matchId);
  const teams = await activeTeams(tx, matchId);
  const leaving = teams.filter((t) => t.entrant === entrantId).map((t) => t.id);
  const remaining = teams.filter((t) => t.entrant !== entrantId);
  // entrants left = distinct tagged entrants (untagged rows count one each)
  const entrantsLeft = new Set(remaining.map((t) => t.entrant ?? t.id)).size;
  if (leaving.length === 0) return true;
  if (entrantsLeft < 2) return false;
  await tx.delete(matchParticipants).where(and(eq(matchParticipants.match_id, matchId), inArray(matchParticipants.team_id, leaving)));
  await tx.delete(matchTeams).where(inArray(matchTeams.id, leaving));
  await tx.update(matches).set({ team_count: remaining.length, updated_at: new Date() }).where(eq(matches.id, matchId));
  return true;
}

/** Complete an unplayed 2-team Normal match with every map won by `winnerTeamId`. Returns false when it has no maps to score. */
async function forfeitMatch(db: Db, matchId: string, status: OpenMatch['status'], winnerTeamId: string, loserTeamId: string): Promise<boolean> {
  let current: OpenMatch['status'] = status;
  if (current === 'created') {
    await transitionMatch(matchId, 'gather');
    current = 'gather';
  }
  if (current === 'gather') {
    await transitionMatch(matchId, 'assign');
    current = 'assign';
  }
  // start it quietly: a forfeited match must not announce "match started" or play the welcome message
  const hasGames = await db.transaction(async (tx) => {
    await lockMatch(tx, matchId);
    if (!(await casMatchStatus(tx, matchId, 'assign', 'battle'))) throw new MatchTransitionError('Match status changed concurrently', 409);
    await initializeMatchGames(tx, matchId);
    return (await getMatchGames(tx, matchId)).length > 0;
  });
  if (!hasGames) {
    await transitionMatch(matchId, 'cancelled'); // nothing to score
    return false;
  }
  for (const game of await getMatchGames(db, matchId)) {
    const gameId = (game.id as string | undefined) ?? matchGameIdFor(matchId, Number(game.round));
    await submitGameResult(matchId, gameId, { type: 'Normal', matchId, gameId, winnerTeamId, loserTeamId });
  }
  return true;
}

/**
 * Withdraw an entrant from the series. The status change commits first (so no new fixtures are made for it), then every
 * unplayed match is handled on its own; a failure on one match is logged and does not stop the others.
 * Throws SeriesError (404 unknown series / entrant, 409 finished series / already withdrawn).
 */
export async function withdrawEntrant(db: Db, seriesId: string, entrantId: string, input: WithdrawEntrantInput): Promise<WithdrawResult> {
  if (input.unplayed !== 'cancel' && input.unplayed !== 'forfeit') throw new SeriesError('unplayed must be cancel or forfeit', 400);

  const { entrant, open } = await db.transaction(async (tx) => {
    const series = await lockSeries(tx, seriesId);
    if (!series) throw new SeriesError('Series not found', 404);
    if (series.status === 'complete' || series.status === 'cancelled') throw new SeriesError(`Cannot withdraw entrants from a ${series.status} series`, 409);
    const existing = await getEntrantRow(tx, seriesId, entrantId);
    if (!existing) throw new SeriesError('Entrant not found in this series', 404);
    if (existing.status === 'withdrawn') throw new SeriesError('Entrant is already withdrawn', 409);
    const updated = await updateEntrant(tx, seriesId, entrantId, { status: 'withdrawn' }, { allowWithdrawn: true });
    return { entrant: updated, open: await listUnplayedMatches(tx, seriesId, entrantId) };
  });

  const result: WithdrawResult = { entrant, cancelled: 0, forfeited: 0, removed_from: 0 };
  for (const match of open) {
    try {
      const teams = await activeTeams(db, match.id);
      const own = teams.find((t) => t.entrant === entrantId);
      const opponent = teams.find((t) => t.entrant !== entrantId);
      const twoTeamNormal = (match.scoring_type ?? 'Normal') === 'Normal' && teams.length === 2 && own && opponent;

      if (twoTeamNormal && input.unplayed === 'forfeit') {
        if (await forfeitMatch(db, match.id, match.status, opponent.id, own.id)) result.forfeited++;
        else result.cancelled++;
      } else if (twoTeamNormal) {
        await transitionMatch(match.id, 'cancelled');
        result.cancelled++;
      } else if (await db.transaction((tx) => removeFromRace(tx, match.id, entrantId))) {
        result.removed_from++;
      } else {
        await transitionMatch(match.id, 'cancelled');
        result.cancelled++;
      }
    } catch (error) {
      logger.error(`Failed to handle match ${match.id} while withdrawing entrant ${entrantId}:`, error);
    }
  }
  logger.debug(`Series ${seriesId}: entrant ${entrantId} withdrawn (${result.cancelled} cancelled, ${result.forfeited} forfeited, ${result.removed_from} removed from)`);
  return result;
}
