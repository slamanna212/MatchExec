/**
 * Bracket progression: complete a tournament or generate its next round from the recorded results.
 *
 * Race safety (plan 1.3): the whole decision -> generate -> save sequence runs in ONE transaction that holds the
 * tournament row lock and then the row locks of the tournament's matches. Overlapping `progress` calls for the same
 * tournament run one after the other, so the second sees the round the first generated (and is told it isn't complete)
 * instead of generating it twice; a result submission racing with a progress call either lands first (and is read) or
 * waits until the round has been generated (and, if it is a rescore, is then refused by the rescore blocker).
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db, Executor } from '../../../lib/db';
import { matches, tournamentMatches } from '../../../lib/db/schema';
import { AfterCommit } from '../matches/effects';
import {
  generateDoubleEliminationRoundMatches, generateNextRoundMatches, getCurrentRoundInfo, isRoundComplete, listByeTeamIds, listDecidedMatches,
  saveGeneratedMatches, type TournamentMatchInfo,
} from './bracket';
import { planDoubleElimination, type DeBracket, type DeMatch } from './double-elimination';
import { playerLabel, queueTournamentWinnerNotification } from './notifications';
import { getCumulativeStandings } from './standings';
import { findTeamIdForPlayer } from './teams';
import { casTournamentStatus, lockTournament, lockTournamentMatches, TournamentError, type TournamentRow } from './tournaments';

export type ProgressResult = Record<string, unknown> & { message: string; tournamentId: string };

/** Progress a tournament in the 'battle' phase. Throws TournamentError (404 / 400 / 409). */
export async function progressTournament(db: Db, tournamentId: string): Promise<ProgressResult> {
  const after = new AfterCommit();
  const result = await db.transaction(async (tx) => {
    const tournament = await lockTournament(tx, tournamentId);
    if (!tournament) throw new TournamentError('Tournament not found', 404);
    if (tournament.status !== 'battle') throw new TournamentError('Tournament must be in battle phase to progress', 400);
    await lockTournamentMatches(tx, tournamentId);

    if (tournament.format === 'cumulative-points') return progressCumulative(tx, tournament);
    if (tournament.format === 'double-elimination') return progressDoubleElimination(tx, tournament, after);
    if (tournament.format === 'single-elimination') return progressSingleElimination(tx, tournament, after);
    throw new TournamentError('Invalid tournament format', 400);
  });
  await after.run();
  return result;
}

async function completeTournament(ex: Executor, tournamentId: string): Promise<void> {
  if (!(await casTournamentStatus(ex, tournamentId, 'battle', 'complete'))) {
    throw new TournamentError('Tournament is no longer in battle phase', 409);
  }
}

/**
 * Cumulative-points: when every tournament match is complete the tournament is complete. Winner = top of standings by
 * points; a points tie is broken by more 1st-place finishes. If players are still level after that, there is no single
 * winner and the tie is announced instead (winner is null in the response).
 */
async function progressCumulative(tx: Executor, tournament: TournamentRow): Promise<ProgressResult> {
  const tournamentId = tournament.id;
  const [counts] = await tx.select({
    total: sql<number>`count(*)`.mapWith(Number),
    incomplete: sql<number>`count(*) filter (where ${matches.status} <> 'complete')`.mapWith(Number),
  }).from(matches).where(eq(matches.tournament_id, tournamentId));
  if (!counts || counts.total === 0) throw new TournamentError('No matches found for this tournament', 400);
  if (counts.incomplete > 0) throw new TournamentError('Not all tournament matches are complete yet', 400);

  const standings = await getCumulativeStandings(tx, tournamentId);
  const top = standings.filter((s) => s.rank === 1);
  const topFirsts = top.length > 0 ? Math.max(...top.map((s) => s.first_places)) : 0;
  const leaders = top.filter((s) => s.first_places === topFirsts);

  await completeTournament(tx, tournamentId);

  if (leaders.length === 1) {
    const winner = leaders[0];
    const soloTeamId = await findTeamIdForPlayer(tx, tournamentId, winner.discord_user_id ?? winner.player_key, winner.user_id ?? winner.player_key);
    await queueTournamentWinnerNotification(
      tx, tournamentId, soloTeamId ?? winner.player_key,
      soloTeamId ? undefined : { winningTeamName: winner.username, winningPlayers: [playerLabel(winner)] },
    );
  } else if (leaders.length > 1) {
    await queueTournamentWinnerNotification(tx, tournamentId, leaders[0].player_key, {
      winningTeamName: `Tie: ${leaders.map((l) => l.username).join(', ')}`,
      winningPlayers: leaders.map(playerLabel),
    });
  }

  return {
    message: leaders.length === 1 ? 'Tournament completed!' : 'Tournament completed in a tie!',
    winner: leaders.length === 1 ? leaders[0].username : null,
    tied: leaders.length > 1 ? leaders.map((l) => l.username) : undefined,
    tournamentId,
  };
}

async function progressSingleElimination(tx: Executor, tournament: TournamentRow, after: AfterCommit): Promise<ProgressResult> {
  const tournamentId = tournament.id;
  const { maxWinnersRound } = await getCurrentRoundInfo(tx, tournamentId);

  if (!(await isRoundComplete(tx, tournamentId, maxWinnersRound, 'winners'))) {
    throw new TournamentError(`Round ${maxWinnersRound} is not complete yet`, 400);
  }

  // A drawn match is complete but has no winner. Advancing anyway would leave both its teams out of the next round (and
  // could crown the wrong champion), so stall until it is rescored.
  const [drawn] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(matches)
    .innerJoin(tournamentMatches, eq(matches.id, tournamentMatches.match_id))
    .where(and(
      eq(tournamentMatches.tournament_id, tournamentId), eq(tournamentMatches.round, maxWinnersRound), eq(tournamentMatches.bracket_type, 'winners'),
      eq(matches.status, 'complete'), sql`${matches.winner_team} is null`,
    ));
  if (drawn && drawn.n > 0) {
    throw new TournamentError(`Round ${maxWinnersRound} has a match that ended in a draw; rescore one of its maps to decide a winner`, 400);
  }

  const completed = await listDecidedMatches(tx, tournamentId, maxWinnersRound, 'winners');
  if (completed.length === 0) throw new TournamentError('No completed matches found to progress from', 400);

  // Teams that had a bye into this round still have to play: the tournament is over only when one match finished AND no bye teams remain.
  const byeTeams = await listByeTeamIds(tx, tournamentId, maxWinnersRound, 'winners');
  if (completed.length === 1 && byeTeams.length === 0) {
    await completeTournament(tx, tournamentId);
    if (completed[0].winner_team) await queueTournamentWinnerNotification(tx, tournamentId, completed[0].winner_team);
    return { message: 'Tournament completed!', winner: completed[0].winner_team, tournamentId };
  }

  const nextRoundMatches = await generateNextRoundMatches(tx, tournamentId, maxWinnersRound, 'winners');
  if (nextRoundMatches.length === 0) throw new TournamentError('No matches to generate for next round', 400);

  const infos: TournamentMatchInfo[] = nextRoundMatches.map((match, index) => ({
    id: match.id,
    tournament_id: tournamentId,
    round: maxWinnersRound + 1,
    bracket_type: 'winners',
    team1_id: match.team1_id,
    team2_id: match.team2_id,
    match_order: index + 1,
  }));
  await saveGeneratedMatches(tx, nextRoundMatches, infos, {}, after);

  return {
    message: `Generated ${nextRoundMatches.length} matches for Round ${maxWinnersRound + 1}`,
    matchCount: nextRoundMatches.length,
    nextRound: maxWinnersRound + 1,
    tournamentId,
  };
}

const bracketLabel = (b: DeBracket) => (b === 'winners' ? 'winners bracket' : b === 'losers' ? 'losers bracket' : 'grand final');

async function progressDoubleElimination(tx: Executor, tournament: TournamentRow, after: AfterCommit): Promise<ProgressResult> {
  const tournamentId = tournament.id;
  const rows = await tx.select({
    bracket_type: tournamentMatches.bracket_type, round: tournamentMatches.round, team1_id: tournamentMatches.team1_id,
    team2_id: tournamentMatches.team2_id, status: matches.status, winner_team: matches.winner_team,
  }).from(tournamentMatches).innerJoin(matches, eq(matches.id, tournamentMatches.match_id))
    .where(eq(tournamentMatches.tournament_id, tournamentId))
    .orderBy(asc(tournamentMatches.bracket_type), asc(tournamentMatches.round), asc(tournamentMatches.match_order), asc(tournamentMatches.match_id));

  const bracketMatches: DeMatch[] = rows
    .filter((r) => r.team1_id && r.team2_id)
    .map((r) => ({
      bracket: r.bracket_type, round: r.round, team1: r.team1_id as string, team2: r.team2_id as string,
      winner: r.winner_team, complete: r.status === 'complete',
    }));

  // Teams entered in the bracket: everyone in a round-1 match plus the round-1 bye team, if any (byes are recorded when the bracket is generated).
  const entered = new Set<string>();
  for (const m of bracketMatches) {
    if (m.bracket === 'winners' && m.round === 1) { entered.add(m.team1); entered.add(m.team2); }
  }
  for (const id of await listByeTeamIds(tx, tournamentId, 1, 'winners')) entered.add(id);

  const plan = planDoubleElimination([...entered], bracketMatches);

  if (plan.champion) {
    await completeTournament(tx, tournamentId);
    await queueTournamentWinnerNotification(tx, tournamentId, plan.champion);
    return { message: 'Tournament completed!', winner: plan.champion, tournamentId };
  }
  if (plan.matches.length === 0) throw new TournamentError(plan.waiting ?? 'No progression available at this time', 400);

  const generated = await generateDoubleEliminationRoundMatches(tx, tournamentId, plan.matches);
  const orderInRound = new Map<string, number>();
  const infos: TournamentMatchInfo[] = generated.map((match, i) => {
    const planned = plan.matches[i];
    const key = `${planned.bracket}:${planned.round}`;
    const order = (orderInRound.get(key) ?? 0) + 1;
    orderInRound.set(key, order);
    return { id: match.id, tournament_id: tournamentId, round: planned.round, bracket_type: planned.bracket, team1_id: planned.team1, team2_id: planned.team2, match_order: order };
  });
  await saveGeneratedMatches(tx, generated, infos, {}, after);

  const groups = new Map<string, number>();
  for (const p of plan.matches) {
    const key = p.bracket === 'final' ? (p.reset ? 'grand final reset' : 'grand final') : `${bracketLabel(p.bracket)} round ${p.round}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const summary = [...groups].map(([name, n]) => `${n} ${n === 1 ? 'match' : 'matches'} (${name})`).join(', ');
  return { message: `Generated ${summary}`, matchCount: generated.length, tournamentId };
}
