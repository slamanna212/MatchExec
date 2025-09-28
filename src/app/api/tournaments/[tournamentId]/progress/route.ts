import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { 
  generateNextRoundMatches,
  generateLosersBracketMatches,
  generateGrandFinalsMatch,
  generateGrandFinalsResetMatch,
  checkGrandFinalsReset,
  saveGeneratedMatches,
  isRoundComplete,
  getCurrentRoundInfo
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

interface WinnerResult {
  winner_team: string;
}

export async function POST(
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
      return NextResponse.json(
        { error: 'Tournament not found' },
        { status: 404 }
      );
    }

    if (tournament.status !== 'battle') {
      return NextResponse.json(
        { error: 'Tournament must be in battle phase to progress' },
        { status: 400 }
      );
    }

    // Get current round information
    const roundInfo = await getCurrentRoundInfo(tournamentId);
    
    // Check what progression is needed
    if (tournament.format === 'single-elimination') {
      return await handleSingleEliminationProgress(tournamentId, roundInfo);
    } else if (tournament.format === 'double-elimination') {
      return await handleDoubleEliminationProgress(tournamentId, roundInfo);
    } else {
      return NextResponse.json(
        { error: 'Invalid tournament format' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Error progressing tournament:', error);
    return NextResponse.json(
      { error: 'Failed to progress tournament' },
      { status: 500 }
    );
  }
}

async function handleSingleEliminationProgress(tournamentId: string, roundInfo: { maxWinnersRound: number; maxLosersRound: number; winnersComplete: boolean; losersComplete: boolean }) {
  const db = await getDbInstance();
  
  // Check if current winner's bracket round is complete
  if (!await isRoundComplete(tournamentId, roundInfo.maxWinnersRound, 'winners')) {
    return NextResponse.json(
      { error: `Round ${roundInfo.maxWinnersRound} is not complete yet` },
      { status: 400 }
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
    return NextResponse.json(
      { error: 'No completed matches found to progress from' },
      { status: 400 }
    );
  }

  // If only one match left, tournament is complete
  if (completedMatches.length === 1) {
    await db.run(
      'UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['complete', tournamentId]
    );

    // Queue tournament winner notification
    try {
      const { queueTournamentWinnerNotification } = await import('../../../../../lib/tournament-notifications');
      await queueTournamentWinnerNotification(tournamentId, completedMatches[0].winner_team);
    } catch (error) {
      console.error('Failed to queue tournament winner notification:', error);
      // Don't fail the tournament completion if notification fails
    }

    return NextResponse.json({
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
    return NextResponse.json(
      { error: 'No matches to generate for next round' },
      { status: 400 }
    );
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

  return NextResponse.json({
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
  // const losersComplete = roundInfo.maxLosersRound > 0 ? 
  //   await isRoundComplete(tournamentId, roundInfo.maxLosersRound, 'losers') : true;

  // Check for grand finals
  const grandFinalsMatches = await db.all(`
    SELECT m.*, tm.bracket_type, tm.round
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ? AND tm.bracket_type = 'final'
    ORDER BY tm.round DESC
  `, [tournamentId]) as GrandFinalsMatch[];

  // If grand finals exist and are complete, check for reset or completion
  if (grandFinalsMatches.length > 0) {
    const latestFinal = grandFinalsMatches[0];
    
    if (latestFinal.status === 'complete' && latestFinal.winner_team) {
      // Get loser's bracket winner
      const losersBracketWinner = await db.get(`
        SELECT m.winner_team
        FROM matches m
        JOIN tournament_matches tm ON m.id = tm.match_id
        WHERE tm.tournament_id = ?
          AND tm.bracket_type = 'losers'
          AND m.status = 'complete'
        ORDER BY tm.round DESC, tm.match_order DESC
        LIMIT 1
      `, [tournamentId]) as WinnerResult | undefined;

      const needsReset = await checkGrandFinalsReset(
        tournamentId,
        latestFinal.winner_team,
        losersBracketWinner?.winner_team || ''
      );

      if (needsReset && latestFinal.tournament_round === 1) {
        // Generate reset match
        const resetMatches = await generateGrandFinalsResetMatch(
          tournamentId,
          latestFinal.team1_name || '',
          latestFinal.team2_name || ''
        );

        const tournamentMatches = [{
          id: resetMatches[0].id,
          tournament_id: tournamentId,
          round: 2,
          bracket_type: 'final' as const,
          team1_id: latestFinal.team1_name || '',
          team2_id: latestFinal.team2_name || '',
          match_order: 1
        }];

        await saveGeneratedMatches(resetMatches, tournamentMatches);

        return NextResponse.json({
          message: 'Generated Grand Finals Reset match',
          matchCount: 1,
          tournamentId
        });
      } else {
        // Tournament is complete
        await db.run(
          'UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['complete', tournamentId]
        );

        // Queue tournament winner notification
        try {
          const { queueTournamentWinnerNotification } = await import('../../../../../lib/tournament-notifications');
          await queueTournamentWinnerNotification(tournamentId, latestFinal.winner_team);
        } catch (error) {
          console.error('Failed to queue tournament winner notification:', error);
          // Don't fail the tournament completion if notification fails
        }

        return NextResponse.json({
          message: 'Tournament completed!',
          winner: latestFinal.winner_team,
          tournamentId
        });
      }
    }

    return NextResponse.json(
      { error: 'Grand finals match is not yet complete' },
      { status: 400 }
    );
  }

  // Check if both brackets are ready for grand finals (currently unused but kept for future logic)
  // const winnersFinished = roundInfo.maxWinnersRound > 0 && winnersComplete;
  // const losersFinished = roundInfo.maxLosersRound > 0 && losersComplete;

  // Get current winners bracket winner and losers bracket winner
  const winnersWinner = await db.get(`
    SELECT m.winner_team
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ?
      AND tm.bracket_type = 'winners'
      AND m.status = 'complete'
    ORDER BY tm.round DESC, tm.match_order DESC
    LIMIT 1
  `, [tournamentId]) as WinnerResult | undefined;

  const losersWinner = await db.get(`
    SELECT m.winner_team
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ?
      AND tm.bracket_type = 'losers'
      AND m.status = 'complete'
    ORDER BY tm.round DESC, tm.match_order DESC
    LIMIT 1
  `, [tournamentId]) as WinnerResult | undefined;

  // Check if we can generate grand finals
  if (winnersWinner && losersWinner) {
    const grandFinalsMatches = await generateGrandFinalsMatch(
      tournamentId,
      winnersWinner.winner_team,
      losersWinner.winner_team
    );

    const tournamentMatches = [{
      id: grandFinalsMatches[0].id,
      tournament_id: tournamentId,
      round: 1,
      bracket_type: 'final' as const,
      team1_id: winnersWinner.winner_team,
      team2_id: losersWinner.winner_team,
      match_order: 1
    }];

    await saveGeneratedMatches(grandFinalsMatches, tournamentMatches);

    return NextResponse.json({
      message: 'Generated Grand Finals match',
      matchCount: 1,
      tournamentId
    });
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

      return NextResponse.json({
        message: `Generated ${nextRoundMatches.length} winner's bracket matches for Round ${roundInfo.maxWinnersRound + 1}`,
        matchCount: nextRoundMatches.length,
        nextRound: roundInfo.maxWinnersRound + 1,
        tournamentId
      });
    }
  }

  return NextResponse.json(
    { error: 'No progression available at this time' },
    { status: 400 }
  );
}