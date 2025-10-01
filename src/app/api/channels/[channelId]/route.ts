import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const db = await getDbInstance();
    const body = await request.json();
    const { channelId } = await params;
    
    const {
      send_announcements = false,
      send_reminders = false,
      send_match_start = false,
      send_signup_updates = false
    } = body;

    // Verify channel exists and is a text channel
    const channel = await db.get<{ channel_type: string }>(
      'SELECT channel_type FROM discord_channels WHERE id = ?',
      [channelId]
    );

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      );
    }

    if (channel.channel_type !== 'text') {
      return NextResponse.json(
        { error: 'Notification settings only apply to text channels' },
        { status: 400 }
      );
    }

    await db.run(`
      UPDATE discord_channels SET
        send_announcements = ?,
        send_reminders = ?,
        send_match_start = ?,
        send_signup_updates = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      send_announcements ? 1 : 0,
      send_reminders ? 1 : 0,
      send_match_start ? 1 : 0,
      send_signup_updates ? 1 : 0,
      channelId
    ]);

    return NextResponse.json({ 
      success: true,
      message: 'Channel notification settings updated successfully' 
    });
  } catch (error) {
    logger.error('Error updating Discord channel:', error);
    return NextResponse.json(
      { error: 'Failed to update Discord channel' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const db = await getDbInstance();
    const { channelId } = await params;

    // Check if channel exists
    const channel = await db.get(
      'SELECT id FROM discord_channels WHERE id = ?',
      [channelId]
    );

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      );
    }

    await db.run('DELETE FROM discord_channels WHERE id = ?', [channelId]);

    return NextResponse.json({ 
      success: true,
      message: 'Channel deleted successfully' 
    });
  } catch (error) {
    logger.error('Error deleting Discord channel:', error);
    return NextResponse.json(
      { error: 'Failed to delete Discord channel' },
      { status: 500 }
    );
  }
}
