import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const db = await getDbInstance();

    // Get available voice channels
    const voiceChannels = await db.all<{
      discord_channel_id: string;
      channel_name: string;
    }>(`
      SELECT discord_channel_id, channel_name
      FROM discord_channels
      WHERE channel_type = 'voice'
      ORDER BY channel_name
    `);

    // Get current match voice channel assignments
    const matchData = await db.get<{
      blue_team_voice_channel?: string;
      red_team_voice_channel?: string;
    }>(`
      SELECT blue_team_voice_channel, red_team_voice_channel
      FROM matches
      WHERE id = ?
    `, [matchId]);

    return NextResponse.json({
      voiceChannels: voiceChannels.map(vc => ({
        value: vc.discord_channel_id,
        label: vc.channel_name || `Channel ${vc.discord_channel_id}`
      })),
      currentAssignments: {
        blueTeamVoiceChannel: matchData?.blue_team_voice_channel || null,
        redTeamVoiceChannel: matchData?.red_team_voice_channel || null
      }
    });
  } catch (error) {
    logger.error('Error fetching voice channels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voice channels' },
      { status: 500 }
    );
  }
}
