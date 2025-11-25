import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';

interface AnnouncerSettings {
  announcer_voice?: string;
  voice_announcements_enabled?: boolean;
  match_start_delay_seconds?: number;
}

export async function GET() {
  try {
    const db = await getDbInstance();
    
    // Get announcer settings from the Discord settings table for now
    // TODO: Move to dedicated announcer settings table if needed
    const result = await db.get<{
      announcer_voice?: string;
      voice_announcements_enabled?: number;
      match_start_delay_seconds?: number;
    }>(`
      SELECT
        announcer_voice,
        voice_announcements_enabled,
        match_start_delay_seconds
      FROM discord_settings
      LIMIT 1
    `);

    const settings: AnnouncerSettings = {
      announcer_voice: result?.announcer_voice || 'wrestling-announcer',
      voice_announcements_enabled: Boolean(result?.voice_announcements_enabled),
      match_start_delay_seconds: result?.match_start_delay_seconds ?? 45
    };

    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Error fetching announcer settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch announcer settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await getDbInstance();
    const body: AnnouncerSettings = await request.json();

    const {
      announcer_voice,
      voice_announcements_enabled,
      match_start_delay_seconds
    } = body;

    // Validate match_start_delay_seconds if provided
    if (match_start_delay_seconds !== undefined) {
      if (typeof match_start_delay_seconds !== 'number' ||
          match_start_delay_seconds < 0 ||
          match_start_delay_seconds > 300) {
        return NextResponse.json(
          { error: 'match_start_delay_seconds must be a number between 0 and 300' },
          { status: 400 }
        );
      }
    }

    // Ensure we have a settings row before updating
    await db.run(`
      INSERT INTO discord_settings (id, guild_id, bot_token)
      VALUES (1, '', '')
      ON CONFLICT(id) DO NOTHING
    `);

    // Build dynamic UPDATE query based on provided fields
    const updates = [];
    const params = [];

    if (announcer_voice !== undefined) {
      updates.push('announcer_voice = ?');
      params.push(announcer_voice);
    }

    if (voice_announcements_enabled !== undefined) {
      updates.push('voice_announcements_enabled = ?');
      params.push(voice_announcements_enabled ? 1 : 0);
    }

    if (match_start_delay_seconds !== undefined) {
      updates.push('match_start_delay_seconds = ?');
      params.push(match_start_delay_seconds);
    }

    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\')');

      await db.run(`
        UPDATE discord_settings SET
          ${updates.join(', ')}
        WHERE id = 1
      `, params);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating announcer settings:', error);
    return NextResponse.json(
      { error: 'Failed to update announcer settings' },
      { status: 500 }
    );
  }
}