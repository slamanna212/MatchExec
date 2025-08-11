import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { DiscordBotService } from '../../../../../lib/discord-bot-service';

export async function POST() {
  try {
    const db = await getDbInstance();
    const botService = new DiscordBotService(db);
    
    // Get the current voice settings
    const settings = await db.get(`
      SELECT announcer_voice, voice_announcements_enabled
      FROM discord_settings 
      WHERE id = 1
    `);

    if (!settings?.voice_announcements_enabled) {
      return NextResponse.json(
        { error: 'Voice announcements are disabled in settings' },
        { status: 400 }
      );
    }

    // Create a request for the Discord bot to process
    const requestId = await botService.requestVoiceTest(
      '123546381628604420',
      settings.announcer_voice || 'wrestling-announcer'
    );

    // Wait for the request to be processed
    const result = await botService.waitForRequestCompletion(requestId);

    if (result.status === 'completed') {
      const resultData = JSON.parse(result.result || '{}');
      return NextResponse.json(resultData);
    } else {
      const errorData = JSON.parse(result.result || '{}');
      return NextResponse.json(
        { error: errorData.message || 'Voice test failed' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error testing voice lines:', error);
    return NextResponse.json(
      { error: 'Failed to test voice lines' },
      { status: 500 }
    );
  }
}