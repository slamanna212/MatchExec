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
    
    // Add to announcement queue
    await db.run(`
      INSERT OR IGNORE INTO discord_announcement_queue (match_id, status)
      VALUES (?, 'pending')
    `, [eventData.id]);
    
    console.log('📢 Discord announcement queued for:', eventData.name);
    return true;
  } catch (error) {
    console.error('❌ Error queuing Discord announcement:', error);
    return false;
  }
}