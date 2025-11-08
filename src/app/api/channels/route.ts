import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../lib/database-init';
import { logger } from '@/lib/logger';

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
    logger.error('Error fetching Discord channels:', error);
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

    const channelData = extractChannelData(body);
    const validationError = validateChannelInput(channelData);

    if (validationError) {
      return validationError;
    }

    const existenceError = await checkChannelExistence(db, channelData.discord_channel_id);
    if (existenceError) {
      return existenceError;
    }

    const guildId = await fetchGuildId(db);
    if (!guildId) {
      return NextResponse.json(
        { error: 'Discord guild not configured' },
        { status: 400 }
      );
    }

    const channelId = await createDiscordChannel(db, channelData, guildId);

    return NextResponse.json({
      success: true,
      id: channelId,
      message: 'Channel created successfully'
    });
  } catch (error) {
    logger.error('Error creating Discord channel:', error);
    return NextResponse.json(
      { error: 'Failed to create Discord channel' },
      { status: 500 }
    );
  }
}

function extractChannelData(body: any) {
  return {
    discord_channel_id: body.discord_channel_id,
    channel_type: body.channel_type,
    send_announcements: body.send_announcements ?? false,
    send_reminders: body.send_reminders ?? false,
    send_match_start: body.send_match_start ?? false,
    send_signup_updates: body.send_signup_updates ?? false
  };
}

function validateChannelInput(data: ReturnType<typeof extractChannelData>) {
  if (!data.discord_channel_id || !data.channel_type) {
    return NextResponse.json(
      { error: 'Channel ID and type are required' },
      { status: 400 }
    );
  }

  if (!['text', 'voice'].includes(data.channel_type)) {
    return NextResponse.json(
      { error: 'Channel type must be text or voice' },
      { status: 400 }
    );
  }

  if (data.channel_type === 'voice') {
    return NextResponse.json(
      { error: 'Voice channels are automatically created and cannot be manually added' },
      { status: 400 }
    );
  }

  return null;
}

async function checkChannelExistence(db: any, discordChannelId: string) {
  const existing = await db.get(
    'SELECT id FROM discord_channels WHERE discord_channel_id = ?',
    [discordChannelId]
  );

  if (existing) {
    return NextResponse.json(
      { error: 'Channel already exists' },
      { status: 409 }
    );
  }

  return null;
}

async function fetchGuildId(db: any): Promise<string | null> {
  const discordSettings = await db.get('SELECT guild_id FROM discord_settings LIMIT 1') as { guild_id?: string } | undefined;
  return discordSettings?.guild_id || null;
}

async function createDiscordChannel(
  db: any,
  data: ReturnType<typeof extractChannelData>,
  guildId: string
): Promise<string> {
  const channelId = `discord_channel_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const discordType = data.channel_type === 'text' ? 0 : 2;

  const getFlag = (flag: boolean) => (data.channel_type === 'text' && flag) ? 1 : 0;

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
    guildId,
    data.discord_channel_id,
    `Channel ${data.discord_channel_id}`,
    discordType,
    data.channel_type,
    getFlag(data.send_announcements),
    getFlag(data.send_reminders),
    getFlag(data.send_match_start),
    getFlag(data.send_signup_updates)
  ]);

  return channelId;
}
