import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import type {
  BracketAssignment
} from '@/lib/tournament-bracket';
import {
  generateSingleEliminationMatches,
  generateDoubleEliminationMatches,
  saveGeneratedMatches
} from '@/lib/tournament-bracket';
import type { Database } from '@/lib/database/connection';

interface TournamentMatchRecord {
  id: string;
  tournament_id: string;
  round: number;
  bracket_type: 'winners' | 'losers' | 'final';
  team1_id?: string;
  team2_id?: string;
  match_order: number;
}

interface GeneratedMatchData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generatedMatches: any[];
  tournamentMatches: TournamentMatchRecord[];
}

async function getBracketAssignments(db: Database, tournamentId: string, provided?: BracketAssignment[]): Promise<BracketAssignment[] | { error: string }> {
  if (provided && provided.length > 0) return provided;
  const teams = await db.all('SELECT id FROM tournament_teams WHERE tournament_id = ? ORDER BY created_at', [tournamentId]) as Team[];
  if (teams.length < 2) return { error: 'At least 2 teams are required to generate matches' };
  return teams.map((team, index) => ({ position: index, teamId: team.id }));
}

async function generateMatchesForFormat(tournament: Tournament, tournamentId: string, bracketAssignments: BracketAssignment[]): Promise<GeneratedMatchData | { error: string }> {
  const startTime = tournament.start_time ? new Date(tournament.start_time) : undefined;
  let matches;
  if (tournament.format === 'single-elimination') {
    matches = await generateSingleEliminationMatches(tournamentId, bracketAssignments, tournament.game_id, tournament.rounds_per_match, startTime);
  } else if (tournament.format === 'double-elimination') {
    matches = await generateDoubleEliminationMatches(tournamentId, bracketAssignments, tournament.game_id, tournament.rounds_per_match, startTime);
  } else {
    return { error: 'Invalid tournament format' };
  }
  const tournamentMatches: TournamentMatchRecord[] = matches.map((match, index) => ({
    id: match.id,
    tournament_id: tournamentId,
    round: match.tournament_round,
    bracket_type: match.tournament_bracket_type as 'winners' | 'losers' | 'final',
    team1_id: match.team1_id,
    team2_id: match.team2_id,
    match_order: index + 1
  }));
  return { generatedMatches: matches, tournamentMatches };
}

async function queueMatchAnnouncements(db: Database, generatedMatches: { id: string }[]): Promise<void> {
  for (const match of generatedMatches) {
    try {
      const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      await db.run(`INSERT INTO discord_announcement_queue (id, match_id, announcement_type, status) VALUES (?, ?, 'standard', 'pending')`, [announcementId, match.id]);
    } catch (error) {
      logger.error(`Failed to queue announcement for match ${match.id}:`, error);
    }
  }
}

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

    const tournament = await db.get('SELECT * FROM tournaments WHERE id = ?', [tournamentId]) as Tournament | undefined;
    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (tournament.status !== 'assign') {
      return NextResponse.json({ error: 'Tournament must be in assign phase to generate matches' }, { status: 400 });
    }

    const existingMatches = await db.get('SELECT COUNT(*) as count FROM matches WHERE tournament_id = ?', [tournamentId]) as MatchCount | undefined;
    if (existingMatches && existingMatches.count > 0) {
      return NextResponse.json({ error: 'Matches have already been generated for this tournament' }, { status: 400 });
    }

    const bracketAssignmentsResult = await getBracketAssignments(db, tournamentId, assignments);
    if ('error' in bracketAssignmentsResult) {
      return NextResponse.json({ error: bracketAssignmentsResult.error }, { status: 400 });
    }

    if (bracketAssignmentsResult.length < 2) {
      return NextResponse.json({ error: 'At least 2 teams must be assigned to bracket positions' }, { status: 400 });
    }

    const matchData = await generateMatchesForFormat(tournament, tournamentId, bracketAssignmentsResult);
    if ('error' in matchData) {
      return NextResponse.json({ error: matchData.error }, { status: 400 });
    }

    const { generatedMatches, tournamentMatches } = matchData;

    await saveGeneratedMatches(generatedMatches, tournamentMatches);
    await queueMatchAnnouncements(db, generatedMatches);

    await db.run('UPDATE tournaments SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [tournamentId]);

    return NextResponse.json({
      message: 'Tournament bracket generated successfully',
      matchCount: generatedMatches.length,
      format: tournament.format,
      tournamentId
    });

  } catch (error) {
    logger.error('Error generating tournament matches:', error);
    return NextResponse.json(
      { error: 'Failed to generate tournament matches' },
      { status: 500 }
    );
  }
}