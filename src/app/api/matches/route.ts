import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { MatchDbRow, GameDbRow } from '@/shared/types';


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    const db = await getDbInstance();
    
    let query = `
      SELECT m.*, g.name as game_name, g.icon_url as game_icon, g.max_signups as max_participants
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
    `;
    
    const params: string[] = [];
    
    if (status === 'complete') {
      query += ` WHERE m.status = 'complete'`;
    } else {
      // Default behavior: show all matches EXCEPT completed ones
      query += ` WHERE m.status != 'complete'`;
    }
    
    query += ` ORDER BY m.created_at DESC`;
    
    const matches = await db.all<MatchDbRow>(query, params);
    
    // Parse maps JSON for each match
    const parsedMatches = matches.map(match => ({
      ...match,
      maps: match.maps ? (typeof match.maps === 'string' ? JSON.parse(match.maps) : match.maps) : []
    }));
    
    return NextResponse.json(parsedMatches);
  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, 
      description, 
      gameId, 
      startDate,
      livestreamLink,
      rules,
      rounds,
      maps,
      eventImageUrl,
      playerNotifications,
      announcementVoiceChannel,
      announcements,
    } = body;
    
    if (!name || !gameId) {
      return NextResponse.json(
        { error: 'Missing required fields: name and gameId' },
        { status: 400 }
      );
    }
    
    const db = await getDbInstance();
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get the game's max signups setting
    const game = await db.get<GameDbRow>('SELECT max_signups FROM games WHERE id = ?', [gameId]);
    const maxParticipants = game?.max_signups || 20; // fallback to 20 if not found
    
    // For now, use placeholder values for Discord fields until they're configured
    const guildId = 'placeholder_guild';
    const channelId = 'placeholder_channel';
    
    await db.run(`
      INSERT INTO matches (
        id, name, description, game_id, guild_id, channel_id, max_participants, status, start_date,
        rules, rounds, maps, livestream_link, event_image_url, player_notifications, announcement_voice_channel, announcements
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      matchId,
      name,
      description || null,
      gameId,
      guildId,
      channelId,
      maxParticipants,
      'created',
      startDate ? new Date(startDate).toISOString() : null,
      rules || null,
      rounds || null,
      maps && maps.length > 0 ? JSON.stringify(maps) : null,
      livestreamLink || null,
      eventImageUrl || null,
      playerNotifications ?? true,
      announcementVoiceChannel || null,
      announcements && announcements.length > 0 ? JSON.stringify(announcements) : null
    ]);
    
    const match = await db.get<MatchDbRow>(`
      SELECT m.*, g.name as game_name, g.icon_url as game_icon
      FROM matches m
      LEFT JOIN games g ON m.game_id = g.id
      WHERE m.id = ?
    `, [matchId]);
    
    // Parse maps for the returned match
    const parsedMatch = {
      ...(match || {}),
      maps: match?.maps ? (typeof match.maps === 'string' ? JSON.parse(match.maps) : match.maps) : []
    };

    // DEBUG: Log what data we received
    console.log('DEBUG - Match creation data:');
    console.log('  startDate:', startDate);
    console.log('  announcements:', announcements);
    console.log('  announcements length:', announcements?.length);
    
    // CREATE REMINDER RECORDS from announcements configured during match creation
    if (announcements && announcements.length > 0 && startDate) {
      try {
        const startDateTime = new Date(startDate);
        console.log(`📅 Creating ${announcements.length} reminders from match creation announcements...`);
        
        for (const announcement of announcements) {
          // Convert announcement timing to actual reminder time
          let reminderTime: Date;
          const value = announcement.value || 1;
          
          switch (announcement.unit) {
            case 'minutes':
              reminderTime = new Date(startDateTime.getTime() - (value * 60 * 1000));
              break;
            case 'hours':
              reminderTime = new Date(startDateTime.getTime() - (value * 60 * 60 * 1000));
              break;
            case 'days':
              reminderTime = new Date(startDateTime.getTime() - (value * 24 * 60 * 60 * 1000));
              break;
            default:
              console.warn(`Unknown announcement unit: ${announcement.unit}`);
              continue;
          }
          
          // Only create reminder if it's in the future
          if (reminderTime > new Date()) {
            const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await db.run(`
              INSERT INTO discord_reminder_queue (id, match_id, reminder_time, status)
              VALUES (?, ?, ?, 'pending')
            `, [reminderId, matchId, reminderTime.toISOString()]);
            
            console.log(`✅ Created reminder: ${value} ${announcement.unit} before start (${reminderTime.toISOString()})`);
          } else {
            console.log(`⚠️ Skipped past reminder: ${value} ${announcement.unit} before start`);
          }
        }
      } catch (reminderError) {
        console.error('❌ Error creating announcement reminders:', reminderError);
        // Don't fail match creation if reminders fail
      }
    }

    // Discord announcement will be triggered when match transitions to "gather" stage
    // Match created in "created" status - no announcement yet
    console.log(`✅ Match created in "created" status: ${name}`);
    
    return NextResponse.json(parsedMatch, { status: 201 });
  } catch (error) {
    console.error('Error creating match:', error);
    return NextResponse.json(
      { error: 'Failed to create match' },
      { status: 500 }
    );
  }
}