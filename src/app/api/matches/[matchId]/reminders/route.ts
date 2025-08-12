import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../../lib/database-init';

interface ReminderDbRow {
  id: string;
  match_id: string;
  reminder_time: string;
  status: 'pending' | 'sent' | 'failed' | 'processed';
  error_message?: string;
  created_at: string;
  sent_at?: string;
  processed_at?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  try {
    const { matchId } = await params;
    
    if (!matchId) {
      return NextResponse.json({ error: 'Match ID is required' }, { status: 400 });
    }

    const db = await getDbInstance();
    const now = new Date().toISOString();

    // Get match details first
    const match = await db.get(`
      SELECT id, name, start_date, player_notifications, status
      FROM matches 
      WHERE id = ?
    `, [matchId]);

    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    // Get scheduled future reminders (pending status and future reminder_time)
    const futureDiscordReminders = await db.all<ReminderDbRow & { type: string; description: string }>(`
      SELECT 
        id,
        match_id,
        reminder_time,
        status,
        error_message,
        created_at,
        sent_at,
        'discord_general' as type,
        'Discord Channel Reminder' as description
      FROM discord_reminder_queue 
      WHERE match_id = ? 
        AND status = 'pending'
        AND datetime(reminder_time) > datetime('now')
      ORDER BY reminder_time ASC
    `, [matchId]);

    const futurePlayerReminders = await db.all<ReminderDbRow & { type: string; description: string }>(`
      SELECT 
        id,
        match_id,
        reminder_time,
        status,
        error_message,
        created_at,
        sent_at,
        'discord_player' as type,
        'Player DM Reminders' as description
      FROM discord_player_reminder_queue 
      WHERE match_id = ? 
        AND status = 'pending'
        AND datetime(reminder_time) > datetime('now')
      ORDER BY reminder_time ASC
    `, [matchId]);

    // Get pending match notifications (status announcements)
    const pendingMatchNotifications = await db.all<ReminderDbRow & { type: string; description: string }>(`
      SELECT 
        id,
        match_id,
        created_at as reminder_time,
        status,
        error_message,
        created_at,
        processed_at as sent_at,
        'discord_match' as type,
        'Match Status Announcement' as description
      FROM discord_match_reminder_queue 
      WHERE match_id = ? 
        AND status = 'pending'
      ORDER BY created_at ASC
    `, [matchId]);

    // Calculate when future reminders would be scheduled (if not already queued)
    const futureScheduledReminders = [];
    
    if (match.start_date) {
      const startDate = new Date(match.start_date);
      const matchStartTime = startDate.getTime();
      
      // Get Discord settings for reminder timing
      const discordSettings = await db.get(`
        SELECT match_reminder_minutes, player_reminder_minutes 
        FROM discord_settings 
        WHERE id = 1
      `);
      
      if (discordSettings) {
        // Check if general reminder would be scheduled
        const generalReminderTime = new Date(matchStartTime - (discordSettings.match_reminder_minutes * 60 * 1000));
        if (generalReminderTime > new Date() && futureDiscordReminders.length === 0) {
          futureScheduledReminders.push({
            id: 'scheduled_general',
            match_id: matchId,
            reminder_time: generalReminderTime.toISOString(),
            status: 'scheduled',
            type: 'discord_general',
            description: `Discord Channel Reminder (${discordSettings.match_reminder_minutes} min before start)`,
            created_at: now
          });
        }
        
        // Check if player reminders would be scheduled
        if (match.player_notifications) {
          const playerReminderTime = new Date(matchStartTime - (discordSettings.player_reminder_minutes * 60 * 1000));
          if (playerReminderTime > new Date() && futurePlayerReminders.length === 0) {
            futureScheduledReminders.push({
              id: 'scheduled_player',
              match_id: matchId,
              reminder_time: playerReminderTime.toISOString(),
              status: 'scheduled',
              type: 'discord_player',
              description: `Player DM Reminders (${discordSettings.player_reminder_minutes} min before start)`,
              created_at: now
            });
          }
        }
      }
    }

    // Combine all future reminders
    const allFutureReminders = [
      ...futureDiscordReminders,
      ...futurePlayerReminders,
      ...pendingMatchNotifications,
      ...futureScheduledReminders
    ].sort((a, b) => {
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
      futureReminders: allFutureReminders,
      reminderCount: allFutureReminders.length
    });

  } catch (error) {
    console.error('Error fetching match reminders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch match reminders' },
      { status: 500 }
    );
  }
}
