import type { NextResponse } from 'next/server';
import { DiscordBotService } from '../../../../../lib/discord-bot-service';
import { getDiscordSettings } from '@/lib/settings';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function POST(): Promise<NextResponse> {
  if (process.env.ENABLE_DEBUG_ROUTES !== 'true') {
    return apiError('Not found', 404);
  }

  try {
    const botService = new DiscordBotService();
    
    // Get the current voice settings
    const settings = await getDiscordSettings();

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