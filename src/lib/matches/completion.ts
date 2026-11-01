/** Side effects of a match completing. Fire exactly once per match, after the status flipped to 'complete'. */
import type { Executor } from '../../../lib/db';
import { logger } from '../logger';
import { logFeedEvent } from '../feed-helpers';
import type { AfterCommit} from './effects';
import { bestEffort } from './effects';
import { getMatchName } from './matches';
import { queueDiscordDeletion, queueMatchWinnerNotification, queueStatsAggregation, queueStatsReportDMs } from './notifications';
import { deleteMatchVoiceChannels } from './voice-channels';

/**
 * Shared by the manual transition (to 'complete') and by auto-complete after the last map is scored: winner
 * notification, Discord message cleanup, stats queues, auto-created voice channel cleanup and the feed event. The queue
 * rows are written on `ex` (the caller's transaction); the feed event is deferred to `after`.
 */
export async function runMatchCompletionSideEffects(ex: Executor, matchId: string, after: AfterCommit): Promise<void> {
  await bestEffort(ex, 'Error queuing match winner notification', (sp) => queueMatchWinnerNotification(sp, matchId), undefined);
  await bestEffort(ex, 'Error queuing Discord deletion for completed match', (sp) => queueDiscordDeletion(sp, matchId), undefined);
  await bestEffort(ex, 'Error queuing stats aggregation', (sp) => queueStatsAggregation(sp, matchId), undefined);
  await bestEffort(ex, 'Error queuing stats report DMs', (sp) => queueStatsReportDMs(sp, matchId), undefined);
  await bestEffort(ex, 'Error deleting voice channels for completed match', async (sp) => { await deleteMatchVoiceChannels(sp, matchId); }, undefined);

  const name = (await getMatchName(ex, matchId)) ?? matchId;
  after.add(() => logFeedEvent({
    eventType: 'match_completed', priority: 2, title: 'Match Completed', description: `"${name}" has finished`, matchId,
  }));
  logger.debug(`Match completion side effects queued for ${matchId}`);
}
