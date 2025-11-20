import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { processMatchAnnouncements } from '../../../../../lib/reminder-helpers';


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    
    if (!matchId) {
      return NextResponse.json({ error: 'Match ID is required' }, { status: 400 });
    }

    const db = await getDbInstance();
    const now = new Date().toISOString();

    // Get match details first
    const match = await db.get<{
      id: string;
      name: string;
      start_date?: string;
      player_notifications?: number;
      status: string;
    }>(`
      SELECT id, name, start_date, player_notifications, status
      FROM matches 
      WHERE id = ?
    `, [matchId]);

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Get scheduled announcements from match creation process
    let scheduledAnnouncements: Awaited<ReturnType<typeof processMatchAnnouncements>> = [];

    if (match.start_date) {
      const matchWithAnnouncements = await db.get<{
        announcements?: unknown;
      }>(`
        SELECT announcements
        FROM matches
        WHERE id = ?
      `, [matchId]);

      if (matchWithAnnouncements?.announcements) {
        try {
          scheduledAnnouncements = await processMatchAnnouncements(
            db,
            matchId,
            matchWithAnnouncements.announcements,
            match.start_date,
            now
          );
        } catch (parseError) {
          logger.error('Error parsing match announcements:', parseError);
        }
      }
    }

    // Sort announcements by reminder time (newest first)
    const allReminders = scheduledAnnouncements.sort((a, b) => {
      const timeA = new Date(a.reminder_time);
      const timeB = new Date(b.reminder_time);
      return timeB.getTime() - timeA.getTime();
    });

    return NextResponse.json({ 
      match: {
        id: match.id,
        name: match.name,
        start_date: match.start_date,
        player_notifications: Boolean(match.player_notifications),
        status: match.status
      },
      reminders: allReminders,
      reminderCount: allReminders.length
    });

  } catch (error) {
    logger.error('Error fetching match reminders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch match reminders' },
      { status: 500 }
    );
  }
}
