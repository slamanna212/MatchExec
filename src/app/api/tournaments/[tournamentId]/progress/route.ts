import type {NextResponse,  NextRequest} from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { withKeyedLock } from '@/lib/keyed-lock';
import { planDoubleElimination } from '@/lib/double-elimination';
import type { DeBracket, DeMatch } from '@/lib/double-elimination';
import { apiError, apiOk } from '@/lib/api-response';
import {
  generateNextRoundMatches,
  generateDoubleEliminationRoundMatches,
  saveGeneratedMatches,
  isRoundComplete,
  getCurrentRoundInfo,
} from '@/lib/tournament-bracket';
import { getCumulativeStandings } from '@/lib/tournament-standings';

interface Tournament {
  id: string;
  status: string;
  format: string;
}


interface TournamentMatch {
  id: string;
  status: string;
  winner_team: string | null;
  team1_id: string;
  team2_id: string;
  bracket_type: string;
  match_order: number;
  round?: number;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
): Promise<NextResponse> {
  const { tournamentId } = await params;
  // Serialised per tournament so overlapping progress calls can't generate the next round twice.
  return withKeyedLock(`progress:${tournamentId}`, () => progressTournament(tournamentId));
}

async function progressTournament(tournamentId: string): Promise<NextResponse> { // NOSONAR typescript:S3776
  try {
    const db = await getDbInstance();

    // Get tournament details
    const tournament = await db.get(
      'SELECT * FROM tournaments WHERE id = ?',
      [tournamentId]
    ) as Tournament | undefined;

    if (!tournament) {
      return apiError('Tournament not found', 404);
    }

    if (tournament.status !== 'battle') {
      return apiError('Tournament must be in battle phase to progress', 400);
    }

    // Cumulative-points has no bracket: it completes when all of its matches are done
    if (tournament.format === 'cumulative-points') {
      return await handleCumulativeProgress(tournamentId);
    }

    if (tournament.format === 'double-elimination') {
      return await handleDoubleEliminationProgress(tournamentId);
    }
    if (tournament.format === 'single-elimination') {
      return await handleSingleEliminationProgress(tournamentId, await getCurrentRoundInfo(tournamentId));
    }
    return apiError('Invalid tournament format', 400);

  } catch (error) {
    logger.error('Error progressing tournament:', error);
    return apiError('Failed to progress tournament');
  }
}

/**
 * Cumulative-points: when every tournament match is complete the tournament is
 * complete. Winner = top of standings by points; a points tie is broken by more
 * 1st-place finishes. If players are still level after that, there is no single
 * winner and the tie is announced instead (winner is null in the response).
 */
async function handleCumulativeProgress(tournamentId: string) {
  const db = await getDbInstance();

  const counts = await db.get<{ total: number; incomplete: number }>(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status = 'complete' THEN 0 ELSE 1 END) as incomplete
    FROM matches WHERE tournament_id = ?
  `, [tournamentId]);

  if (!counts || counts.total === 0) {
    return apiError('No matches found for this tournament', 400);
  }
  if ((counts.incomplete ?? 0) > 0) {
    return apiError('Not all tournament matches are complete yet', 400);
  }

  const standings = await getCumulativeStandings(db, tournamentId);
  const top = standings.filter(s => s.rank === 1);
  const topFirsts = top.length > 0 ? Math.max(...top.map(s => s.first_places)) : 0;
  const leaders = top.filter(s => s.first_places === topFirsts);

  await db.run(
    'UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['complete', tournamentId]
  );

  try {
    const { queueTournamentWinnerNotification } = await import('../../../../../lib/tournament-notifications');
    if (leaders.length === 1) {
      const winner = leaders[0];
      const soloTeam = await db.get<{ team_id: string }>(`
        SELECT ttm.team_id FROM tournament_team_members ttm
        JOIN tournament_teams tt ON tt.id = ttm.team_id
        WHERE tt.tournament_id = ? AND (ttm.discord_user_id = ? OR ttm.user_id = ?)
        LIMIT 1
      `, [tournamentId, winner.discord_user_id ?? winner.player_key, winner.user_id ?? winner.player_key]);

      await queueTournamentWinnerNotification(
        tournamentId,
        soloTeam?.team_id ?? winner.player_key,
        soloTeam ? undefined : {
          winningTeamName: winner.username,
          winningPlayers: [winner.discord_user_id ? `<@${winner.discord_user_id}>` : winner.username],
        }
      );
    } else if (leaders.length > 1) {
      await queueTournamentWinnerNotification(tournamentId, leaders[0].player_key, {
        winningTeamName: `Tie: ${leaders.map(l => l.username).join(', ')}`,
        winningPlayers: leaders.map(l => l.discord_user_id ? `<@${l.discord_user_id}>` : l.username),
      });
    }
  } catch (error) {
    logger.error('Failed to queue tournament winner notification:', error);
  }

  return apiOk({
    message: leaders.length === 1 ? 'Tournament completed!' : 'Tournament completed in a tie!',
    winner: leaders.length === 1 ? leaders[0].username : null,
    tied: leaders.length > 1 ? leaders.map(l => l.username) : undefined,
    tournamentId
  });
}

async function handleSingleEliminationProgress(tournamentId: string, roundInfo: { maxWinnersRound: number; maxLosersRound: number; winnersComplete: boolean; losersComplete: boolean }) {
  const db = await getDbInstance();
  
  // Check if current winner's bracket round is complete
  if (!await isRoundComplete(tournamentId, roundInfo.maxWinnersRound, 'winners')) {
    return apiError(`Round ${roundInfo.maxWinnersRound} is not complete yet`, 400);
  }

  // A drawn match is complete but has no winner. Advancing anyway would leave both its teams
  // out of the next round (and could crown the wrong champion), so stall until it is rescored.
  const drawn = await db.get<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ? AND tm.round = ? AND tm.bracket_type = 'winners'
      AND m.status = 'complete' AND m.winner_team IS NULL
  `, [tournamentId, roundInfo.maxWinnersRound]);
  if (drawn && drawn.count > 0) {
    return apiError(
      `Round ${roundInfo.maxWinnersRound} has a match that ended in a draw; rescore one of its maps to decide a winner`,
      400
    );
  }

  // Get completed matches from current round
  const completedMatches = await db.all(`
    SELECT m.*, tm.team1_id, tm.team2_id, tm.bracket_type, tm.match_order
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ?
      AND tm.round = ?
      AND tm.bracket_type = 'winners'
      AND m.status = 'complete'
      AND m.winner_team IS NOT NULL
    ORDER BY tm.match_order
  `, [tournamentId, roundInfo.maxWinnersRound]) as TournamentMatch[];

  if (completedMatches.length === 0) {
    return apiError('No completed matches found to progress from', 400);
  }

  // Check for bye teams in the current round — if any exist, a final match still needs to be generated
  const byeTeamsCurrent = await db.all(
    'SELECT team_id FROM tournament_round_byes WHERE tournament_id = ? AND round = ? AND bracket_type = ?',
    [tournamentId, roundInfo.maxWinnersRound, 'winners']
  ) as { team_id: string }[];

  // Tournament is complete only when 1 match finishes AND no bye teams remain for this round
  if (completedMatches.length === 1 && byeTeamsCurrent.length === 0) {
    await db.run(
      'UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['complete', tournamentId]
    );

    // Queue tournament winner notification
    try {
      const { queueTournamentWinnerNotification } = await import('../../../../../lib/tournament-notifications');
      if (completedMatches[0].winner_team) {
        await queueTournamentWinnerNotification(tournamentId, completedMatches[0].winner_team);
      }
    } catch (error) {
      logger.error('Failed to queue tournament winner notification:', error);
      // Don't fail the tournament completion if notification fails
    }

    return apiOk({
      message: 'Tournament completed!',
      winner: completedMatches[0].winner_team,
      tournamentId
    });
  }

  // Generate next round matches
  const nextRoundMatches = await generateNextRoundMatches(
    tournamentId,
    roundInfo.maxWinnersRound,
    'winners',
    'single-elimination'
  );

  if (nextRoundMatches.length === 0) {
    return apiError('No matches to generate for next round', 400);
  }

  // Create tournament match relationships
  const tournamentMatches = nextRoundMatches.map((match, index) => ({
    id: match.id,
    tournament_id: tournamentId,
    round: roundInfo.maxWinnersRound + 1,
    bracket_type: 'winners' as const,
    team1_id: completedMatches[index * 2]?.winner_team || '',
    team2_id: completedMatches[index * 2 + 1]?.winner_team || '',
    match_order: index + 1
  }));

  // Save new matches
  await saveGeneratedMatches(nextRoundMatches, tournamentMatches);

  return apiOk({
    message: `Generated ${nextRoundMatches.length} matches for Round ${roundInfo.maxWinnersRound + 1}`,
    matchCount: nextRoundMatches.length,
    nextRound: roundInfo.maxWinnersRound + 1,
    tournamentId
  });
}

async function handleDoubleEliminationProgress(tournamentId: string) {
  const db = await getDbInstance();

  const rows = await db.all<{
    bracket_type: DeBracket; round: number; team1_id: string | null; team2_id: string | null;
    status: string; winner_team: string | null;
  }>(`
    SELECT tm.bracket_type, tm.round, tm.team1_id, tm.team2_id, m.status, m.winner_team
    FROM tournament_matches tm
    JOIN matches m ON m.id = tm.match_id
    WHERE tm.tournament_id = ?
    ORDER BY tm.bracket_type, tm.round, tm.match_order
  `, [tournamentId]);

  const bracketMatches: DeMatch[] = rows
    .filter(r => r.team1_id && r.team2_id)
    .map(r => ({
      bracket: r.bracket_type,
      round: r.round,
      team1: r.team1_id as string,
      team2: r.team2_id as string,
      winner: r.winner_team,
      complete: r.status === 'complete',
    }));

  // Teams entered in the bracket: everyone in a round-1 match plus the round-1 bye team, if any
  // (byes are recorded when the bracket is generated).
  const entered = new Set<string>();
  for (const m of bracketMatches) {
    if (m.bracket === 'winners' && m.round === 1) { entered.add(m.team1); entered.add(m.team2); }
  }
  const byes = await db.all<{ team_id: string }>(
    `SELECT team_id FROM tournament_round_byes WHERE tournament_id = ? AND round = 1 AND bracket_type = 'winners'`,
    [tournamentId]
  );
  for (const b of byes) entered.add(b.team_id);

  const plan = planDoubleElimination([...entered], bracketMatches);

  if (plan.champion) {
    const finished = await db.run(
      `UPDATE tournaments SET status = 'complete', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'battle'`,
      [tournamentId]
    );
    if (!finished.changes) return apiError('Tournament is no longer in battle phase', 409);

    try {
      const { queueTournamentWinnerNotification } = await import('../../../../../lib/tournament-notifications');
      await queueTournamentWinnerNotification(tournamentId, plan.champion);
    } catch (error) {
      logger.error('Failed to queue tournament winner notification:', error);
      // Don't fail the tournament completion if notification fails
    }

    return apiOk({ message: 'Tournament completed!', winner: plan.champion, tournamentId });
  }

  if (plan.matches.length === 0) {
    return apiError(plan.waiting ?? 'No progression available at this time', 400);
  }

  const generated = await generateDoubleEliminationRoundMatches(tournamentId, plan.matches);
  const orderInRound = new Map<string, number>();
  const tournamentMatches = generated.map((match, i) => {
    const planned = plan.matches[i];
    const key = `${planned.bracket}:${planned.round}`;
    const order = (orderInRound.get(key) ?? 0) + 1;
    orderInRound.set(key, order);
    return {
      id: match.id,
      tournament_id: tournamentId,
      round: planned.round,
      bracket_type: planned.bracket,
      team1_id: planned.team1,
      team2_id: planned.team2,
      match_order: order,
    };
  });
  await saveGeneratedMatches(generated, tournamentMatches);

  const label = (b: DeBracket) => (b === 'winners' ? "winners bracket" : b === 'losers' ? "losers bracket" : 'grand final');
  const groups = new Map<string, number>();
  for (const p of plan.matches) {
    const key = p.bracket === 'final' ? (p.reset ? 'grand final reset' : 'grand final') : `${label(p.bracket)} round ${p.round}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const summary = [...groups].map(([name, n]) => `${n} ${n === 1 ? 'match' : 'matches'} (${name})`).join(', ');

  return apiOk({
    message: `Generated ${summary}`,
    matchCount: generated.length,
    tournamentId
  });
}
