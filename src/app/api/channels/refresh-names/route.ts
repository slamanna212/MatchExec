import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';

export async function POST() {
  try {
    const db = await getDbInstance();

    // Get Discord settings to verify bot configuration
    const settings = await db.get<{
      bot_token?: string;
      guild_id?: string;
    }>(`
      SELECT bot_token, guild_id
      FROM discord_settings 
      WHERE id = 1
    `);

    if (!settings?.bot_token || !settings?.guild_id) {
      return NextResponse.json(
        { error: 'Discord bot not configured' },
        { status: 400 }
      );
    }

    // Get all channels that need name refresh
    const channels = await db.all<{
      id: string;
      discord_channel_id: string;
      channel_name?: string;
    }>(`
      SELECT id, discord_channel_id, channel_name
      FROM discord_channels
    `);

    let updatedCount = 0;
    const errors: string[] = [];

    for (const channel of channels) {
      try {
        // Fetch channel info from Discord API using fetch
        const response = await fetch(`https://discord.com/api/v10/channels/${channel.discord_channel_id}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bot ${settings.bot_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const discordChannel = await response.json() as { name?: string; type?: number };

          if (discordChannel?.name) {
            // Update channel name in database
            await db.run(`
              UPDATE discord_channels 
              SET channel_name = ?, last_name_refresh = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [discordChannel.name, channel.id]);
            
            updatedCount++;
          }
        } else {
          const errorMsg = `Failed to refresh channel ${channel.discord_channel_id}: HTTP ${response.status}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      } catch (error) {
        const errorMsg = `Failed to refresh channel ${channel.discord_channel_id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    return NextResponse.json({
      success: true,
      updated_count: updatedCount,
      total_channels: channels.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error refreshing channel names:', error);
    return NextResponse.json(
      { error: 'Failed to refresh channel names' },
      { status: 500 }
    );
  }
}
