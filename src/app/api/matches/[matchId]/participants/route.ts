import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { matchId } = await params;
    
    // Check if match exists and get game info
    const match = await db.get(
      'SELECT m.id, m.game_id, g.id as game_name FROM matches m JOIN games g ON m.game_id = g.id WHERE m.id = ?',
      [matchId]
    );
    
    if (!match) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }
    
    // Fetch all participants for this match
    const participants = await db.all(`
      SELECT id, user_id, username, joined_at, signup_data, team_assignment
      FROM match_participants 
      WHERE match_id = ?
      ORDER BY joined_at ASC
    `, [matchId]);
    
    // Parse signup_data JSON for each participant if it exists
    const parsedParticipants = participants.map(participant => ({
      ...participant,
      signup_data: participant.signup_data ? JSON.parse(participant.signup_data) : null
    }));
    
    // Fetch signup form configuration to get field labels
    let signupConfig = null;
    try {
      const fs = require('fs');
      const path = require('path');
      const signupPath = path.join(process.cwd(), 'data', 'games', match.game_id, 'signup.json');
      
      if (fs.existsSync(signupPath)) {
        const signupData = fs.readFileSync(signupPath, 'utf8');
        signupConfig = JSON.parse(signupData);
      }
    } catch (error) {
      console.log('No signup form config found for game:', match.game_id);
    }
    
    return NextResponse.json({
      participants: parsedParticipants,
      signupConfig: signupConfig
    });
  } catch (error) {
    console.error('Error fetching match participants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch participants' },
      { status: 500 }
    );
  }
}