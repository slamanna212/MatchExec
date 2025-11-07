import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';
import { logger } from '@/lib/logger';


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
    const scheduledAnnouncements = [];
    
    if (match.start_date) {
      // Get the announcements from the match record
      const matchWithAnnouncements = await db.get<{
        announcements?: string;
      }>(`
        SELECT announcements
        FROM matches 
        WHERE id = ?
      `, [matchId]);
      
      if (matchWithAnnouncements?.announcements) {
        try {
          let announcements;

          // Handle different announcement field formats
          if (typeof matchWithAnnouncements.announcements === 'string') {
            try {
              announcements = JSON.parse(matchWithAnnouncements.announcements);
            } catch {
              // If it's not valid JSON, skip this match
              logger.debug(`⚠️ Skipping match ${match.name} - announcements field is not valid JSON`);
              return NextResponse.json({
                match: {
                  id: match.id,
                  name: match.name,
                  start_date: match.start_date,
                  player_notifications: Boolean(match.player_notifications),
                  status: match.status
                },
                reminders: [],
                reminderCount: 0
              });
            }
          } else if (typeof matchWithAnnouncements.announcements === 'number' || typeof matchWithAnnouncements.announcements === 'boolean') {
            // For tournament matches, announcements is a boolean/number flag
            // Use default announcement schedule for tournament matches
            if (matchWithAnnouncements.announcements) {
              announcements = [
                { id: 'default_1hour', value: 1, unit: 'hours' },
                { id: 'default_30min', value: 30, unit: 'minutes' }
              ];
            } else {
              // announcements disabled for this tournament match
              return NextResponse.json({
                match: {
                  id: match.id,
                  name: match.name,
                  start_date: match.start_date,
                  player_notifications: Boolean(match.player_notifications),
                  status: match.status
                },
                reminders: [],
                reminderCount: 0
              });
            }
          } else {
            announcements = matchWithAnnouncements.announcements;
          }

          const startDate = new Date(match.start_date);

          for (const announcement of announcements) {
            // Calculate when this announcement should be sent
            const { value, unit, id } = announcement;
            let millisecondsOffset = 0;
            
            switch (unit) {
              case 'minutes':
                millisecondsOffset = value * 60 * 1000;
                break;
              case 'hours':
                millisecondsOffset = value * 60 * 60 * 1000;
                break;
              case 'days':
                millisecondsOffset = value * 24 * 60 * 60 * 1000;
                break;
            }
            
            const announcementTime = new Date(startDate.getTime() - millisecondsOffset);
            
            // Check if this announcement was already processed in the announcement queue
            const queuedAnnouncement = await db.get<{
              status: string;
              posted_at?: string;
              error_message?: string;
            }>(`
              SELECT status, posted_at, error_message
              FROM discord_announcement_queue 
              WHERE match_id = ? AND announcement_type = 'timed'
              AND announcement_data = ?
            `, [matchId, JSON.stringify(announcement)]);
            
            let status = 'pending';
            let sentAt = null;
            let errorMessage = null;
            
            if (queuedAnnouncement) {
              status = queuedAnnouncement.status === 'completed' ? 'sent' : queuedAnnouncement.status;
              sentAt = queuedAnnouncement.posted_at;
              errorMessage = queuedAnnouncement.error_message;
            } else if (announcementTime <= new Date()) {
              // If time has passed but no queue entry exists, it should have been processed
              status = 'scheduled';
            }
            
            scheduledAnnouncements.push({
              id: `announcement_${id}`,
              match_id: matchId,
              reminder_time: announcementTime.toISOString(),
              status: status,
              error_message: errorMessage,
              created_at: now,
              sent_at: sentAt,
              type: 'timed_announcement',
              description: `${value} ${unit} before start`,
              timing: { value, unit }
            });
          }
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
