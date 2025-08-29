import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';

export interface DiscordChannel {
  id: string;
  discord_channel_id: string;
  channel_name?: string;
  channel_type: 'text' | 'voice';
  send_announcements?: boolean;
  send_reminders?: boolean;
  send_match_start?: boolean;
  send_signup_updates?: boolean;
  last_name_refresh?: string;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const db = await getDbInstance();
    
    const channels = await db.all<DiscordChannel>(`
      SELECT 
        id,
        discord_channel_id,
        channel_name,
        channel_type,
        send_announcements,
        send_reminders,
        send_match_start,
        send_signup_updates,
        last_name_refresh,
        created_at,
        updated_at
      FROM discord_channels 
      ORDER BY channel_type, channel_name
    `);

    // Convert boolean fields from SQLite integers
    const formattedChannels = channels.map(channel => ({
      ...channel,
      send_announcements: Boolean(channel.send_announcements),
      send_reminders: Boolean(channel.send_reminders),
      send_match_start: Boolean(channel.send_match_start),
      send_signup_updates: Boolean(channel.send_signup_updates)
    }));

    return NextResponse.json(formattedChannels);
  } catch (error) {
    console.error('Error fetching Discord channels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Discord channels' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await getDbInstance();
    const body = await request.json();
    
    const {
      discord_channel_id,
      channel_type,
      send_announcements = false,
      send_reminders = false,
      send_match_start = false,
      send_signup_updates = false
    } = body;

    if (!discord_channel_id || !channel_type) {
      return NextResponse.json(
        { error: 'Channel ID and type are required' },
        { status: 400 }
      );
    }

    if (!['text', 'voice'].includes(channel_type)) {
      return NextResponse.json(
        { error: 'Channel type must be text or voice' },
        { status: 400 }
      );
    }

    // Check if channel already exists
    const existing = await db.get(
      'SELECT id FROM discord_channels WHERE discord_channel_id = ?',
      [discord_channel_id]
    );

    if (existing) {
      return NextResponse.json(
        { error: 'Channel already exists' },
        { status: 409 }
      );
    }

    // Get guild_id from discord_settings
    const discordSettings = await db.get('SELECT guild_id FROM discord_settings LIMIT 1') as { guild_id?: string } | undefined;
    
    if (!discordSettings?.guild_id) {
      return NextResponse.json(
        { error: 'Discord guild not configured' },
        { status: 400 }
      );
    }

    // Generate unique ID
    const channelId = `discord_channel_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Map channel_type to Discord integer type
    const discordType = channel_type === 'text' ? 0 : 2; // 0=text, 2=voice

    await db.run(`
      INSERT INTO discord_channels (
        id, 
        guild_id,
        discord_channel_id, 
        name,
        type,
        channel_type,
        send_announcements,
        send_reminders,
        send_match_start,
        send_signup_updates
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      channelId,
      discordSettings.guild_id,
      discord_channel_id,
      `Channel ${discord_channel_id}`, // Default name, will be updated when names are refreshed
      discordType,
      channel_type,
      channel_type === 'text' ? (send_announcements ? 1 : 0) : 0,
      channel_type === 'text' ? (send_reminders ? 1 : 0) : 0,
      channel_type === 'text' ? (send_match_start ? 1 : 0) : 0,
      channel_type === 'text' ? (send_signup_updates ? 1 : 0) : 0
    ]);

    return NextResponse.json({ 
      success: true, 
      id: channelId,
      message: 'Channel created successfully' 
    });
  } catch (error) {
    console.error('Error creating Discord channel:', error);
    return NextResponse.json(
      { error: 'Failed to create Discord channel' },
      { status: 500 }
    );
  }
}
