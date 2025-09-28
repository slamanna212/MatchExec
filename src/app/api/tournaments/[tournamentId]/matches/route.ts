import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';

interface TournamentMatch {
  id: string;
  name: string;
  status: string;
  tournament_round: number;
  tournament_bracket_type: string;
  team1_name?: string;
  team2_name?: string;
  winner_team?: string;
  start_date: string;
  start_time: string;
  team1_id?: string;
  team2_id?: string;
  match_order: number;
  parent_match1_id?: string;
  parent_match2_id?: string;
}

interface BracketMatch {
  id: string;
  round: number;
  bracket_type: 'winners' | 'losers' | 'final';
  team1?: {
    id: string;
    name: string;
  };
  team2?: {
    id: string;
    name: string;
  };
  winner?: string;
  status: 'pending' | 'ongoing' | 'completed';
  match_order: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { tournamentId } = await params;
    const db = await getDbInstance();

    // Fetch tournament matches with tournament match details
    const matches = await db.all(`
      SELECT
        m.id,
        m.name,
        m.status,
        m.tournament_round,
        m.tournament_bracket_type,
        m.team1_name,
        m.team2_name,
        m.winner_team,
        m.start_date,
        m.start_time,
        tm.team1_id,
        tm.team2_id,
        tm.match_order,
        tm.parent_match1_id,
        tm.parent_match2_id
      FROM matches m
      LEFT JOIN tournament_matches tm ON m.id = tm.match_id
      WHERE m.tournament_id = ?
      ORDER BY m.tournament_round, tm.match_order
    `, [tournamentId]) as TournamentMatch[];

    // For completed matches without winner_team, calculate from match_games
    for (const match of matches) {
      if (match.status === 'complete' && !match.winner_team) {
        const gameWinners = await db.all(`
          SELECT winner_id, COUNT(*) as wins
          FROM match_games
          WHERE match_id = ? AND winner_id IS NOT NULL
          GROUP BY winner_id
          ORDER BY wins DESC
        `, [match.id]) as { winner_id: string; wins: number }[];

        if (gameWinners.length > 0) {
          const topWinner = gameWinners[0];
          // Convert team1/team2 to actual team IDs
          if (topWinner.winner_id === 'team1') {
            match.winner_team = match.team1_id;
          } else if (topWinner.winner_id === 'team2') {
            match.winner_team = match.team2_id;
          } else {
            match.winner_team = topWinner.winner_id;
          }
        }
      }
    }

    // Transform to bracket match format
    const bracketMatches: BracketMatch[] = matches.map(match => ({
      id: match.id,
      round: match.tournament_round,
      bracket_type: match.tournament_bracket_type as 'winners' | 'losers' | 'final',
      team1: match.team1_id ? {
        id: match.team1_id,
        name: match.team1_name || 'Team 1'
      } : undefined,
      team2: match.team2_id ? {
        id: match.team2_id,
        name: match.team2_name || 'Team 2'
      } : undefined,
      winner: match.winner_team || undefined,
      status: match.status === 'complete' ? 'completed' :
              match.status === 'battle' ? 'ongoing' : 'pending',
      match_order: match.match_order
    }));

    return NextResponse.json({
      matches: bracketMatches,
      count: bracketMatches.length
    });

  } catch (error) {
    console.error('Error fetching tournament matches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tournament matches' },
      { status: 500 }
    );
  }
}