import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const body = await request.json();
    const { teamAssignments, blueTeamVoiceChannel, redTeamVoiceChannel } = body;

    if (!teamAssignments || !Array.isArray(teamAssignments)) {
      return NextResponse.json({ error: 'Invalid team assignments data' }, { status: 400 });
    }

    const db = await getDbInstance();

    // Update team assignments for all participants
    const updatePromises = teamAssignments.map(async (assignment: { participantId: string; team: string }) => {
      if (!['reserve', 'blue', 'red'].includes(assignment.team)) {
        throw new Error(`Invalid team assignment: ${assignment.team}`);
      }

      return db.run(
        'UPDATE match_participants SET team_assignment = ? WHERE id = ? AND match_id = ?',
        [assignment.team, assignment.participantId, matchId]
      );
    });

    await Promise.all(updatePromises);

    // Update voice channel assignments for teams
    await db.run(
      'UPDATE matches SET blue_team_voice_channel = ?, red_team_voice_channel = ? WHERE id = ?',
      [blueTeamVoiceChannel || null, redTeamVoiceChannel || null, matchId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating team assignments:', error);
    return NextResponse.json(
      { error: 'Failed to update team assignments' },
      { status: 500 }
    );
  }
}