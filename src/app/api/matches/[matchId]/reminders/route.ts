import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';


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
          const announcements = JSON.parse(matchWithAnnouncements.announcements);
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
              status = queuedAnnouncement.status === 'posted' ? 'sent' : queuedAnnouncement.status;
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
          console.error('Error parsing match announcements:', parseError);
        }
      }
    }

    // Sort announcements by reminder time
    const allReminders = scheduledAnnouncements.sort((a, b) => {
      const timeA = new Date(a.reminder_time);
      const timeB = new Date(b.reminder_time);
      return timeA.getTime() - timeB.getTime();
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
    console.error('Error fetching match reminders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch match reminders' },
      { status: 500 }
    );
  }
}
