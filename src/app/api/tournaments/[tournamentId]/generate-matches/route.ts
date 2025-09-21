import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { 
  generateSingleEliminationMatches,
  generateDoubleEliminationMatches,
  saveGeneratedMatches,
  BracketAssignment 
} from '@/lib/tournament-bracket';

interface Tournament {
  id: string;
  status: string;
  format: string;
  game_id: string;
  rounds_per_match: number;
  start_time?: string;
}

interface MatchCount {
  count: number;
}

interface Team {
  id: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { tournamentId } = await params;
    const body = await request.json().catch(() => ({}));
    const { assignments }: { assignments?: BracketAssignment[] } = body;

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

    if (tournament.status !== 'assign') {
      return NextResponse.json(
        { error: 'Tournament must be in assign phase to generate matches' },
        { status: 400 }
      );
    }

    // Check if matches already exist for this tournament
    const existingMatches = await db.get(
      'SELECT COUNT(*) as count FROM matches WHERE tournament_id = ?',
      [tournamentId]
    ) as MatchCount | undefined;

    if (existingMatches && existingMatches.count > 0) {
      return NextResponse.json(
        { error: 'Matches have already been generated for this tournament' },
        { status: 400 }
      );
    }

    // Get tournament teams if no assignments provided
    let bracketAssignments: BracketAssignment[];
    
    if (assignments && assignments.length > 0) {
      bracketAssignments = assignments;
    } else {
      // Auto-assign teams in order they were created
      const teams = await db.all(
        'SELECT id FROM tournament_teams WHERE tournament_id = ? ORDER BY created_at',
        [tournamentId]
      ) as Team[];
      
      if (teams.length < 2) {
        return NextResponse.json(
          { error: 'At least 2 teams are required to generate matches' },
          { status: 400 }
        );
      }

      bracketAssignments = teams.map((team, index) => ({
        position: index,
        teamId: team.id
      }));
    }

    // Validate bracket assignments
    if (bracketAssignments.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 teams must be assigned to bracket positions' },
        { status: 400 }
      );
    }

    // Generate matches based on tournament format
    let generatedMatches;
    let tournamentMatches;

    if (tournament.format === 'single-elimination') {
      const matches = await generateSingleEliminationMatches(
        tournamentId,
        bracketAssignments,
        tournament.game_id,
        tournament.rounds_per_match,
        tournament.start_time ? new Date(tournament.start_time) : undefined
      );

      generatedMatches = matches;

      // Create tournament match relationships from generated matches
      tournamentMatches = matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournamentId,
        round: match.tournament_round,
        bracket_type: match.tournament_bracket_type as 'winners' | 'losers' | 'final',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));
    } else if (tournament.format === 'double-elimination') {
      const matches = await generateDoubleEliminationMatches(
        tournamentId,
        bracketAssignments,
        tournament.game_id,
        tournament.rounds_per_match,
        tournament.start_time ? new Date(tournament.start_time) : undefined
      );

      generatedMatches = matches;

      // Create tournament match relationships from generated matches
      tournamentMatches = matches.map((match, index) => ({
        id: match.id,
        tournament_id: tournamentId,
        round: match.tournament_round,
        bracket_type: match.tournament_bracket_type as 'winners' | 'losers' | 'final',
        team1_id: match.team1_id,
        team2_id: match.team2_id,
        match_order: index + 1
      }));
    } else {
      return NextResponse.json(
        { error: 'Invalid tournament format' },
        { status: 400 }
      );
    }

    // Save matches to database
    await saveGeneratedMatches(generatedMatches, tournamentMatches);

    // Update tournament status to 'battle'
    await db.run(
      'UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['battle', tournamentId]
    );

    return NextResponse.json({
      message: 'Tournament matches generated successfully',
      matchCount: generatedMatches.length,
      format: tournament.format,
      tournamentId
    });

  } catch (error) {
    console.error('Error generating tournament matches:', error);
    return NextResponse.json(
      { error: 'Failed to generate tournament matches' },
      { status: 500 }
    );
  }
}