import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import type { Tournament } from '@/shared/types';
import { TOURNAMENT_FLOW_STEPS } from '@/shared/types';
import { logger } from '@/lib/logger';
import {
  handleGatherTransition,
  handleAssignTransition,
  handleBattleTransition,
  handleEndTransition
} from '../../../../../lib/tournament-transition-handlers';
import { handleTournamentAssignTransition } from '../../../../../lib/transition-handlers';
import type { Database } from '@/lib/database/connection';

function validateNewStatus(newStatus: string | undefined): string | null {
  if (!newStatus || !TOURNAMENT_FLOW_STEPS[newStatus as keyof typeof TOURNAMENT_FLOW_STEPS]) {
    return 'Invalid status provided';
  }
  return null;
}

function validateTournamentStatusTransition(currentTournament: Tournament, newStatus: string): string | null {
  const currentStep = TOURNAMENT_FLOW_STEPS[currentTournament.status as keyof typeof TOURNAMENT_FLOW_STEPS];
  const newStep = TOURNAMENT_FLOW_STEPS[newStatus as keyof typeof TOURNAMENT_FLOW_STEPS];
  if (newStep.progress < currentStep.progress && newStatus !== 'cancelled') {
    return 'Cannot move backwards in tournament flow';
  }
  return null;
}

async function validateBattleRequirements(db: Database, tournamentId: string): Promise<string | null> {
  const teamCount = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM tournament_teams WHERE tournament_id = ?`, [tournamentId]);
  const memberCount = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM tournament_team_members ttm JOIN tournament_teams tt ON ttm.team_id = tt.id WHERE tt.tournament_id = ?`, [tournamentId]);
  if (!teamCount || teamCount.count < 2) return 'At least 2 teams are required to start tournament battles';
  if (!memberCount || memberCount.count === 0) return 'Teams must have members assigned before starting tournament battles';
  return null;
}

async function executeTournamentStatusActions(db: Database, tournamentId: string, newStatus: string): Promise<void> {
  switch (newStatus) {
    case 'gather':
      await handleGatherTransition(db, tournamentId);
      break;
    case 'assign':
      await handleAssignTransition(db, tournamentId);
      await handleTournamentAssignTransition(tournamentId);
      break;
    case 'battle':
      await handleBattleTransition(db, tournamentId);
      break;
    case 'complete':
    case 'cancelled':
      await handleEndTransition(db, tournamentId, newStatus);
      break;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> }
) {
  try {
    const { tournamentId } = await params;
    const { newStatus } = await request.json();

    const statusError = validateNewStatus(newStatus);
    if (statusError) {
      return NextResponse.json({ error: statusError }, { status: 400 });
    }

    const db = await getDbInstance();

    const currentTournament = await db.get<Tournament>(`SELECT * FROM tournaments WHERE id = ?`, [tournamentId]);
    if (!currentTournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const transitionError = validateTournamentStatusTransition(currentTournament, newStatus);
    if (transitionError) {
      return NextResponse.json({ error: transitionError }, { status: 400 });
    }

    if (newStatus === 'battle') {
      const battleError = await validateBattleRequirements(db, tournamentId);
      if (battleError) {
        return NextResponse.json({ error: battleError }, { status: 400 });
      }
    }

    await db.run(`UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newStatus, tournamentId]);
    logger.debug(`🏆 Tournament ${tournamentId} transitioned from ${currentTournament.status} to ${newStatus}`);

    await executeTournamentStatusActions(db, tournamentId, newStatus);

    // Get updated tournament data with game info
    const updatedTournament = await db.get<Tournament & {
      game_name?: string;
      game_icon?: string; 
      game_color?: string;
      participant_count?: number;
    }>(`
      SELECT 
        t.*, 
        g.name as game_name, 
        g.icon_url as game_icon, 
        g.color as game_color,
        COUNT(DISTINCT ttm.user_id) as participant_count
      FROM tournaments t
      LEFT JOIN games g ON t.game_id = g.id
      LEFT JOIN tournament_teams tt ON t.id = tt.tournament_id
      LEFT JOIN tournament_team_members ttm ON tt.id = ttm.team_id
      WHERE t.id = ?
      GROUP BY t.id
    `, [tournamentId]);

    return NextResponse.json(updatedTournament);

  } catch (error) {
    logger.error('Error transitioning tournament status:', error);
    return NextResponse.json(
      { error: 'Failed to transition tournament status' },
      { status: 500 }
    );
  }
}