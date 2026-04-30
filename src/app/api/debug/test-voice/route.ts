import { getDbInstance } from '../../../../lib/database-init';
import { DiscordBotService } from '../../../../../lib/discord-bot-service';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function POST() {
  try {
    const db = await getDbInstance();
    const botService = new DiscordBotService(db);
    
    // Get the current voice settings
    const settings = await db.get<{
      announcer_voice?: string;
      voice_announcements_enabled?: number;
    }>(`
      SELECT announcer_voice, voice_announcements_enabled
      FROM discord_settings 
      WHERE id = 1
    `);

    if (!settings?.voice_announcements_enabled) {
      return apiError('Voice announcements are disabled in settings', 400);
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
      return apiOk(resultData);
    }
      const errorData = JSON.parse(result.result || '{}');
      return apiError(errorData.message || 'Voice test failed');

  } catch (error) {
    logger.error('Error testing voice lines:', error);
    return apiError('Failed to test voice lines');
  }
}