import { db as defaultDb, type Executor } from './db';
import { logger } from '../src/lib/logger/server';
import {
  enqueueBotRequest, failBotRequest, failStaleVoiceTests, findActiveVoiceTest, getBotRequest,
} from '../src/lib/discord-queues';

interface VoiceTestRequest {
  id: string;
  userId: string;
  voiceId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: string;
  created_at: string;
  updated_at: string;
}

/** Web-side client for `discord_bot_requests` voice tests (request/response RPC to the Discord bot). */
export class DiscordBotService {
  constructor(private ex: Executor = defaultDb) {}

  async requestVoiceTest(userId: string, voiceId?: string): Promise<string> {
    // Clean up any stale pending requests for this user (older than 2 minutes)
    await failStaleVoiceTests(this.ex, userId);

    // Check if there's already a recent pending or processing voice test request for this user
    const existingRequest = await findActiveVoiceTest(this.ex, userId);

    if (existingRequest) {
      logger.debug(`⏭️ Voice test already pending for user ${userId}, returning existing request`);
      return existingRequest.id;
    }

    return enqueueBotRequest(this.ex, 'voice_test', { userId, voiceId });
  }

  async getRequestStatus(requestId: string): Promise<VoiceTestRequest | null> {
    const request = await getBotRequest(this.ex, requestId);

    if (!request || request.type !== 'voice_test') return null;

    const data = (request.data ?? {}) as { userId: string; voiceId?: string };
    return {
      id: request.id,
      userId: data.userId,
      voiceId: data.voiceId,
      status: request.status,
      // The route JSON.parses this string; keep that contract
      result: request.result ? JSON.stringify(request.result) : undefined,
      created_at: request.created_at.toISOString(),
      updated_at: request.updated_at.toISOString()
    };
  }

  async waitForRequestCompletion(requestId: string, timeoutMs = 45000): Promise<VoiceTestRequest> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const request = await this.getRequestStatus(requestId);

      if (request && (request.status === 'completed' || request.status === 'failed')) {
        return request;
      }

      // Wait 500ms before checking again for faster response
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Mark the request as failed due to timeout (only if still pending/processing)
    await failBotRequest(this.ex, requestId, { success: false, message: 'Request timed out after 45 seconds' });

    throw new Error('Request timeout - voice test took longer than 45 seconds to complete');
  }
}
