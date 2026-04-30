import type { NextRequest} from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import {
  generateNextRoundMatches,
  generateLosersBracketMatches,
  generateGrandFinalsMatch,
  saveGeneratedMatches,
  isRoundComplete,
  getCurrentRoundInfo,
  isBracketReadyForFinals,
  getBracketWinner
} from '@/lib/tournament-bracket';

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

interface GrandFinalsMatch {
  id: string;
  status: string;
  winner_team: string | null;
  bracket_type: string;
  round: number;
  team1_name?: string;
  team2_name?: string;
  tournament_round?: number;
}

export async function POST( // NOSONAR typescript:S3776
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { tournamentId } = await params;
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

    // Get current round information
    const roundInfo = await getCurrentRoundInfo(tournamentId);

    // Check what progression is needed
    if (tournament.format === 'single-elimination') {
      return await handleSingleEliminationProgress(tournamentId, roundInfo);
    } else if (tournament.format === 'double-elimination') {
      return await handleDoubleEliminationProgress(tournamentId, roundInfo);
    }
      return apiError('Invalid tournament format', 400);

  } catch (error) {
    logger.error('Error progressing tournament:', error);
    return apiError('Failed to progress tournament');
  }
}

async function handleSingleEliminationProgress(tournamentId: string, roundInfo: { maxWinnersRound: number; maxLosersRound: number; winnersComplete: boolean; losersComplete: boolean }) {
  const db = await getDbInstance();
  
  // Check if current winner's bracket round is complete
  if (!await isRoundComplete(tournamentId, roundInfo.maxWinnersRound, 'winners')) {
    return apiError(`Round ${roundInfo.maxWinnersRound} is not complete yet`, 400);
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

async function handleDoubleEliminationProgress(tournamentId: string, roundInfo: { maxWinnersRound: number; maxLosersRound: number; winnersComplete: boolean; losersComplete: boolean }) {
  const db = await getDbInstance();
  
  // Check current state and determine what needs to progress
  const winnersComplete = await isRoundComplete(tournamentId, roundInfo.maxWinnersRound, 'winners');

  // Check for grand finals
  const grandFinalsMatches = await db.all(`
    SELECT m.*, tm.bracket_type, tm.round
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ? AND tm.bracket_type = 'final'
    ORDER BY tm.round DESC
  `, [tournamentId]) as GrandFinalsMatch[];

  // If grand finals exist and are complete, tournament is complete
  if (grandFinalsMatches.length > 0) {
    const latestFinal = grandFinalsMatches[0];

    if (latestFinal.status === 'complete' && latestFinal.winner_team) {
      // Tournament is complete
      await db.run(
        'UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['complete', tournamentId]
      );

      // Queue tournament winner notification
      try {
        const { queueTournamentWinnerNotification } = await import('../../../../../lib/tournament-notifications');
        if (latestFinal.winner_team) {
          await queueTournamentWinnerNotification(tournamentId, latestFinal.winner_team);
        }
      } catch (error) {
        logger.error('Failed to queue tournament winner notification:', error);
        // Don't fail the tournament completion if notification fails
      }

      return apiOk({
        message: 'Tournament completed!',
        winner: latestFinal.winner_team,
        tournamentId
      });
    }

    return apiError('Grand finals match is not yet complete', 400);
  }

  // Check if both brackets are ready for grand finals
  const winnersReady = await isBracketReadyForFinals(tournamentId, 'winners');
  const losersReady = await isBracketReadyForFinals(tournamentId, 'losers');

  // If both brackets are complete and ready, generate grand finals
  if (winnersReady && losersReady) {
    const winnersWinner = await getBracketWinner(tournamentId, 'winners');
    const losersWinner = await getBracketWinner(tournamentId, 'losers');

    if (winnersWinner && losersWinner) {
      const grandFinalsMatches = await generateGrandFinalsMatch(
        tournamentId,
        winnersWinner,
        losersWinner
      );

      const tournamentMatches = [{
        id: grandFinalsMatches[0].id,
        tournament_id: tournamentId,
        round: 1,
        bracket_type: 'final' as const,
        team1_id: winnersWinner,
        team2_id: losersWinner,
        match_order: 1
      }];

      await saveGeneratedMatches(grandFinalsMatches, tournamentMatches);

      return apiOk({
        message: 'Generated Grand Finals match',
        matchCount: 1,
        tournamentId
      });
    }
  }

  // Progress winner's bracket if complete
  if (winnersComplete && roundInfo.maxWinnersRound > 0) {
    const nextRoundMatches = await generateNextRoundMatches(
      tournamentId,
      roundInfo.maxWinnersRound,
      'winners',
      'double-elimination'
    );

    if (nextRoundMatches.length > 0) {
      const completedMatches = await db.all(`
        SELECT m.*, tm.team1_id, tm.team2_id, tm.bracket_type, tm.match_order
        FROM matches m
        JOIN tournament_matches tm ON m.id = tm.match_id
        WHERE tm.tournament_id = ?
          AND tm.round = ?
          AND tm.bracket_type = 'winners'
          AND m.status = 'complete'
        ORDER BY tm.match_order
      `, [tournamentId, roundInfo.maxWinnersRound]) as TournamentMatch[];

      const tournamentMatches = nextRoundMatches.map((match, index) => ({
        id: match.id,
        tournament_id: tournamentId,
        round: roundInfo.maxWinnersRound + 1,
        bracket_type: 'winners' as const,
        team1_id: completedMatches[index * 2]?.winner_team || '',
        team2_id: completedMatches[index * 2 + 1]?.winner_team || '',
        match_order: index + 1
      }));

      await saveGeneratedMatches(nextRoundMatches, tournamentMatches);

      // Also generate loser's bracket matches from eliminated teams
      const eliminatedTeams = completedMatches
        .map(match => match.team1_id === match.winner_team ? match.team2_id : match.team1_id)
        .filter(Boolean);

      if (eliminatedTeams.length > 0) {
        const losersBracketMatches = await generateLosersBracketMatches(
          tournamentId,
          roundInfo.maxWinnersRound,
          eliminatedTeams
        );

        if (losersBracketMatches.length > 0) {
          const losersTournamentMatches = losersBracketMatches.map((match, index) => ({
            id: match.id,
            tournament_id: tournamentId,
            round: match.tournament_round || 1,
            bracket_type: 'losers' as const,
            team1_id: eliminatedTeams[index * 2] || '',
            team2_id: eliminatedTeams[index * 2 + 1] || '',
            match_order: index + 1
          }));

          await saveGeneratedMatches(losersBracketMatches, losersTournamentMatches);
        }
      }

      return apiOk({
        message: `Generated ${nextRoundMatches.length} winner's bracket matches for Round ${roundInfo.maxWinnersRound + 1}`,
        matchCount: nextRoundMatches.length,
        nextRound: roundInfo.maxWinnersRound + 1,
        tournamentId
      });
    }
  }

  return apiError('No progression available at this time', 400);
}