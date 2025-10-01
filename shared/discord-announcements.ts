import { logger } from '../src/lib/logger/server';

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
    // Import here to avoid build issues
    const { getDbInstance } = await import('../src/lib/database-init');
    const db = await getDbInstance();
    
    // Check if announcement already exists to prevent duplicates
    const existing = await db.get(`
      SELECT id FROM discord_announcement_queue 
      WHERE match_id = ? AND (announcement_type IS NULL OR announcement_type = 'standard')
    `, [eventData.id]);
    
    if (existing) {
      logger.debug('📢 Discord announcement already queued for:', eventData.name);
      return true;
    }
    
    // Generate unique ID for the announcement queue entry
    const announcementId = `announce_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to announcement queue with explicit 'standard' type
    await db.run(`
      INSERT INTO discord_announcement_queue (id, match_id, announcement_type, status)
      VALUES (?, ?, 'standard', 'pending')
    `, [announcementId, eventData.id]);
    
    logger.debug('📢 Discord announcement queued for:', eventData.name);
    return true;
  } catch (error) {
    logger.error('❌ Error queuing Discord announcement:', error);
    return false;
  }
}