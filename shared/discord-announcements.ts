import { logger } from '../src/lib/logger/server';
import { db as pgDb } from '../lib/db';
import { enqueueAnnouncement } from '../src/lib/discord-queues';

export interface EventAnnouncementData {
  id: string;
  name: string;
  description: string;
  game_id: string;
  type: 'competitive' | 'casual';
  maps?: string[];
  max_participants: number;
  guild_id: string;
}

// Queue an announcement request that the Discord bot will process
export async function postEventAnnouncement(eventData: EventAnnouncementData): Promise<boolean> {
  try {
    // Inserts only when no announcement of any status exists yet for this match (prevents duplicates)
    const queued = await enqueueAnnouncement(pgDb, {
      matchId: eventData.id,
      type: 'standard',
      dedupe: ['pending', 'processing', 'completed', 'failed'],
    });

    if (!queued) {
      logger.debug('📢 Discord announcement already queued for:', eventData.name);
      return true;
    }

    logger.debug('📢 Discord announcement queued for:', eventData.name);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord announcement:', error);
    return false;
  }
}