import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';

export async function GET() {
  try {
    const db = await getDbInstance();
    
    const settings = await db.get(`
      SELECT 
        bot_token,
        guild_id,
        announcement_channel_id,
        results_channel_id,
        moderator_role_id,
        participant_role_id,
        command_prefix,
        auto_role_assignment
      FROM discord_settings 
      WHERE id = 1
    `);

    // Don't expose the bot token in the response for security
    const safeSettings = settings ? {
      ...settings,
      bot_token: settings.bot_token ? '••••••••' : null
    } : null;

    return NextResponse.json(safeSettings || {});
  } catch (error) {
    console.error('Error fetching Discord settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Discord settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await getDbInstance();
    const body = await request.json();
    
    const {
      bot_token,
      guild_id,
      announcement_channel_id,
      results_channel_id,
      moderator_role_id,
      participant_role_id,
      command_prefix,
      auto_role_assignment
    } = body;

    // Update the settings (there should only be one row with id = 1)
    await db.run(`
      UPDATE discord_settings SET
        bot_token = COALESCE(?, bot_token),
        guild_id = ?,
        announcement_channel_id = ?,
        results_channel_id = ?,
        moderator_role_id = ?,
        participant_role_id = ?,
        command_prefix = ?,
        auto_role_assignment = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [
      bot_token === '••••••••' ? null : bot_token, // Don't update if masked
      guild_id,
      announcement_channel_id,
      results_channel_id,
      moderator_role_id,
      participant_role_id,
      command_prefix,
      auto_role_assignment ? 1 : 0
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating Discord settings:', error);
    return NextResponse.json(
      { error: 'Failed to update Discord settings' },
      { status: 500 }
    );
  }
}