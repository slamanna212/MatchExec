import { getDbInstance } from './database-init';
import { logger } from '@/lib/logger';
import type { FeedEventType, FeedPriority } from '@/shared/types';

export interface LogFeedEventOptions {
  eventType: FeedEventType;
  priority: FeedPriority;
  title: string;
  description?: string;
  matchId?: string;
  tournamentId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an event to the activity feed.
 * Never throws — feed logging must not disrupt match operations.
 */
export async function logFeedEvent(options: LogFeedEventOptions): Promise<void> {
  try {
    const db = await getDbInstance();
    const id = `feed_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    await db.run(
      `INSERT INTO activity_feed
         (id, event_type, priority, title, description, match_id, tournament_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        options.eventType,
        options.priority,
        options.title,
        options.description ?? null,
        options.matchId ?? null,
        options.tournamentId ?? null,
        options.metadata ? JSON.stringify(options.metadata) : null,
      ]
    );

    logger.debug(`Feed event logged: [${options.eventType}] ${options.title}`);
  } catch (error) {
    // Intentionally swallowed — feed logging is non-critical infrastructure
    logger.error('Failed to log feed event:', error);
  }
}
