import type { NextRequest} from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    if (!channelId || typeof channelId !== 'string' || channelId.length > 100) {
      return apiError('Invalid ID', 400);
    }
    const db = await getDbInstance();
    const body = await request.json();

    /* eslint-disable @typescript-eslint/naming-convention */
    const {
      send_announcements = false,
      send_reminders = false,
      send_match_start = false,
      send_signup_updates = false,
      send_health_alerts = false
    } = body;
    /* eslint-enable @typescript-eslint/naming-convention */

    // Verify channel exists and is a text channel
    const channel = await db.get<{ channel_type: string }>(
      'SELECT channel_type FROM discord_channels WHERE id = ?',
      [channelId]
    );

    if (!channel) {
      return apiError('Channel not found', 404);
    }

    if (channel.channel_type !== 'text') {
      return apiError('Notification settings only apply to text channels', 400);
    }

    await db.run(`
      UPDATE discord_channels SET
        send_announcements = ?,
        send_reminders = ?,
        send_match_start = ?,
        send_signup_updates = ?,
        send_health_alerts = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      send_announcements ? 1 : 0,
      send_reminders ? 1 : 0,
      send_match_start ? 1 : 0,
      send_signup_updates ? 1 : 0,
      send_health_alerts ? 1 : 0,
      channelId
    ]);

    return apiOk({
      success: true,
      message: 'Channel notification settings updated successfully'
    });
  } catch (error) {
    logger.error('Error updating Discord channel:', error);
    return apiError('Failed to update Discord channel');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const { channelId } = await params;
    if (!channelId || typeof channelId !== 'string' || channelId.length > 100) {
      return apiError('Invalid ID', 400);
    }
    const db = await getDbInstance();

    // Check if channel exists
    const channel = await db.get(
      'SELECT id FROM discord_channels WHERE id = ?',
      [channelId]
    );

    if (!channel) {
      return apiError('Channel not found', 404);
    }

    await db.run('DELETE FROM discord_channels WHERE id = ?', [channelId]);

    return apiOk({
      success: true,
      message: 'Channel deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting Discord channel:', error);
    return apiError('Failed to delete Discord channel');
  }
}
