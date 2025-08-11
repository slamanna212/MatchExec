import { Database } from './database/connection';

interface VoiceTestRequest {
  id: string;
  userId: string;
  voiceId?: string;
  status: 'pending' | 'completed' | 'failed';
  result?: string;
  created_at: string;
  updated_at: string;
}

export class DiscordBotService {
  constructor(private db: Database) {}

  async requestVoiceTest(userId: string, voiceId?: string): Promise<string> {
    // Check if there's already a pending voice test request for this user
    const existingRequest = await this.db.get(`
      SELECT id FROM discord_bot_requests 
      WHERE type = 'voice_test' AND status = 'pending' 
      AND JSON_EXTRACT(data, '$.userId') = ?
      LIMIT 1
    `, [userId]);

    if (existingRequest) {
      console.log(`⏭️ Voice test already pending for user ${userId}, returning existing request`);
      return existingRequest.id;
    }

    const requestId = `voice_test_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    await this.db.run(`
      INSERT INTO discord_bot_requests (id, type, data, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      requestId,
      'voice_test',
      JSON.stringify({ userId, voiceId }),
      'pending'
    ]);

    return requestId;
  }

  async getRequestStatus(requestId: string): Promise<VoiceTestRequest | null> {
    const request = await this.db.get<{
      id: string;
      data: string;
      status: string;
      result: string | null;
      created_at: string;
      updated_at: string;
    }>(`
      SELECT id, data, status, result, created_at, updated_at
      FROM discord_bot_requests
      WHERE id = ? AND type = 'voice_test'
    `, [requestId]);

    if (!request) return null;

    const data = JSON.parse(request.data);
    return {
      id: request.id,
      userId: data.userId,
      voiceId: data.voiceId,
      status: request.status as 'pending' | 'completed' | 'failed',
      result: request.result || undefined,
      created_at: request.created_at,
      updated_at: request.updated_at
    };
  }

  async waitForRequestCompletion(requestId: string, timeoutMs: number = 30000): Promise<VoiceTestRequest> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const request = await this.getRequestStatus(requestId);
      
      if (request && (request.status === 'completed' || request.status === 'failed')) {
        return request;
      }
      
      // Wait 500ms before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error('Request timeout');
  }
}