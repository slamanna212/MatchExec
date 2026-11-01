/**
 * Match status transitions. `transitionMatch` is the one entry point for the API: it validates, flips the status with a
 * compare-and-set under a row lock, and writes every Discord queue row the new status causes inside the SAME
 * transaction. Work that talks to the bot and waits (voice channel creation) and activity-feed writes run after commit.
 */
import { db, type Executor } from '../../../lib/db';
import { MATCH_FLOW_STEPS } from '@/shared/types';
import { logger } from '../logger';
import { deleteFeedEvents, logFeedEvent } from '../feed-helpers';
import { enqueueAnnouncement, enqueueStatusUpdate, hasAnnouncement } from '../discord-queues';
import { getMap } from '../games';
import { cleanMapId } from '../utils/map-utils';
import { AfterCommit, bestEffort } from './effects';
import { areAllGamesCompleted, getOngoingGame, initializeMatchGames, lookupMapName } from './games';
import { MapCodeService } from './map-codes';
import { casMatchStatus, getMatch, getMatchName, listTournamentMatchIds, type MatchStatus } from './matches';
import { queueDiscordDeletion, queueScorecardPrompts, queueWinnerVote } from './notifications';
import { determineMatchWinner } from './scoreboard';
import { createMatchTeams, lockMatch } from './teams';
import { runMatchCompletionSideEffects } from './completion';
import { deleteMatchVoiceChannels, VoiceChannelService } from './voice-channels';

/** Allowed match status transitions. 'complete' and 'cancelled' are terminal. */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  created: ['gather', 'cancelled'],
  gather: ['assign', 'cancelled'],
  assign: ['battle', 'cancelled'],
  battle: ['complete', 'cancelled'],
  complete: [],
  cancelled: [],
};

export class MatchTransitionError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message);
    this.name = 'MatchTransitionError';
  }
}

export function isKnownStatus(status: unknown): status is MatchStatus {
  return typeof status === 'string' && !!MATCH_FLOW_STEPS[status as keyof typeof MATCH_FLOW_STEPS];
}

// ─── Per-status effects (run inside the transition transaction) ─────────────

export async function handleGatherTransition(ex: Executor, matchId: string, after: AfterCommit): Promise<void> {
  await bestEffort(ex, 'Error handling gather transition', async (sp) => {
    if (!(await hasAnnouncement(sp, matchId, 'standard'))) {
      await enqueueAnnouncement(sp, { matchId, type: 'standard', dedupe: ['pending', 'processing'] });
    }
  }, undefined);
  const name = (await getMatchName(ex, matchId)) ?? matchId;
  after.add(() => logFeedEvent({
    eventType: 'match_phase_changed', priority: 3, title: 'Match Signups Opened', description: `"${name}" is now accepting signups`, matchId,
  }));
}

/** Queues the status update and creates the teams. Voice channels are created after commit (see `afterTransitionCommit`). */
export async function handleAssignTransition(ex: Executor, matchId: string, after: AfterCommit): Promise<void> {
  await bestEffort(ex, 'Error queuing Discord status update', (sp) => enqueueStatusUpdate(sp, matchId, 'assign'), undefined);
  await bestEffort(ex, 'Error creating match teams', (sp) => createMatchTeams(sp, matchId), undefined);
  const name = (await getMatchName(ex, matchId)) ?? matchId;
  after.add(() => logFeedEvent({
    eventType: 'match_phase_changed', priority: 3, title: 'Match Signups Closed', description: `"${name}" signups closed, teams being assigned`, matchId,
  }));
}

export async function handleBattleTransition(ex: Executor, matchId: string, after: AfterCommit): Promise<void> {
  await bestEffort(ex, 'Error queuing welcome voice announcement', async (sp) => { await VoiceChannelService.queueVoiceAnnouncement(sp, matchId, 'welcome'); }, undefined);
  await bestEffort(ex, 'Error queuing Discord match start notification', (sp) => enqueueAnnouncement(sp, { matchId, type: 'match_start' }), undefined);

  await bestEffort(ex, 'Error initializing match games', async (sp) => {
    await initializeMatchGames(sp, matchId);
    // Scorecard prompts + winner vote for the first map (after participants are assigned).
    const first = await getOngoingGame(sp, matchId);
    if (first) {
      const mapName = (await lookupMapName(sp, matchId, first.map_id)) || first.map_id || '';
      await bestEffort(sp, 'Error queuing battle start DMs', async (sp2) => {
        await queueScorecardPrompts(sp2, matchId, first.id, mapName);
        await queueWinnerVote(sp2, matchId, first.id, mapName);
      }, undefined);
    }
  }, undefined);
  await bestEffort(ex, 'Error processing first map code', async (sp) => { await MapCodeService.processFirstMapCode(sp, matchId); }, undefined);

  const match = await getMatch(ex, matchId);
  const name = match?.name ?? matchId;
  const firstGame = await getOngoingGame(ex, matchId);
  let mapName: string | null = null;
  if (firstGame?.map_id && match) mapName = (await getMap(ex, match.game_id, cleanMapId(firstGame.map_id)))?.name ?? null;
  after.add(async () => {
    await logFeedEvent({ eventType: 'match_started', priority: 2, title: 'Match Started', description: `"${name}" is now live`, matchId });
    if (firstGame) {
      await logFeedEvent({
        eventType: 'match_scoring_required', priority: 3, title: 'Map Scoring Required',
        description: `"${name}" - Map ${firstGame.round}: ${mapName ?? 'Unknown Map'}`,
        matchId, metadata: { matchGameId: firstGame.id, round: firstGame.round, mapName },
      });
    }
  });
}

export async function handleCompleteTransition(ex: Executor, matchId: string, after: AfterCommit): Promise<void> {
  await runMatchCompletionSideEffects(ex, matchId, after);
}

export async function handleCancelledTransition(ex: Executor, matchId: string, after: AfterCommit): Promise<void> {
  await bestEffort(ex, 'Error queuing Discord deletion for cancelled match', (sp) => queueDiscordDeletion(sp, matchId), undefined);
  await bestEffort(ex, 'Error deleting voice channels for cancelled match', async (sp) => { await deleteMatchVoiceChannels(sp, matchId); }, undefined);
  const name = (await getMatchName(ex, matchId)) ?? matchId;
  after.add(async () => {
    await deleteFeedEvents(matchId, ['match_scoring_required']);
    await logFeedEvent({ eventType: 'match_cancelled', priority: 2, title: 'Match Cancelled', description: `"${name}" was cancelled`, matchId });
  });
}

/** Route a status to its handler. Does NOT validate the transition: that is `transitionMatch`'s job. */
export async function handleStatusTransition(ex: Executor, matchId: string, newStatus: string, after = new AfterCommit()): Promise<AfterCommit> {
  switch (newStatus) {
    case 'gather': await handleGatherTransition(ex, matchId, after); break;
    case 'assign': await handleAssignTransition(ex, matchId, after); break;
    case 'battle': await handleBattleTransition(ex, matchId, after); break;
    case 'complete': await handleCompleteTransition(ex, matchId, after); break;
    case 'cancelled': await handleCancelledTransition(ex, matchId, after); break;
    default: logger.debug(`No special handling needed for status: ${newStatus}`);
  }
  return after;
}

/** Tournament assign: queue a Discord status update for every match of the tournament so signups close. */
export async function handleTournamentAssignTransition(ex: Executor, tournamentId: string): Promise<void> {
  const ids = await listTournamentMatchIds(ex, tournamentId);
  if (ids.length === 0) {
    logger.debug(`No matches found for tournament: ${tournamentId}`);
    return;
  }
  for (const id of ids) {
    await bestEffort(ex, `Error queuing Discord status update for tournament match ${id}`, (sp) => enqueueStatusUpdate(sp, id, 'assign'), undefined);
  }
  logger.info(`Queued Discord status updates for ${ids.length} tournament matches`);
}

// ─── The transition ──────────────────────────────────────────────────────────

/**
 * Move a match to `newStatus`. Throws MatchTransitionError (404 unknown match, 400 invalid / unscored, 409 lost a race).
 * Returns the previous status.
 *
 * Race: the match row is locked (`FOR UPDATE`) for the whole transition, so two simultaneous requests are serialised,
 * and the status flip is additionally a compare-and-set; the loser gets 409 and none of the loser's queue rows commit.
 */
export async function transitionMatch(matchId: string, newStatus: MatchStatus, opts: { force?: boolean } = {}): Promise<{ from: MatchStatus }> {
  const after = new AfterCommit();
  const from = await db.transaction(async (tx) => {
    const current = await lockMatch(tx, matchId);
    if (!current) throw new MatchTransitionError('Match not found', 404);
    if (current.status === newStatus) throw new MatchTransitionError(`Match is already in "${newStatus}" status`, 400);
    if (!(ALLOWED_TRANSITIONS[current.status] ?? []).includes(newStatus)) {
      throw new MatchTransitionError(`Cannot transition match from "${current.status}" to "${newStatus}"`, 400);
    }

    let winnerTeam: string | null | undefined;
    if (newStatus === 'complete') {
      if (!opts.force && !(await areAllGamesCompleted(tx, matchId))) {
        throw new MatchTransitionError('Cannot complete match: not all maps have been scored', 400);
      }
      winnerTeam = await determineMatchWinner(tx, matchId);
    }
    if (!(await casMatchStatus(tx, matchId, current.status, newStatus, winnerTeam))) {
      throw new MatchTransitionError('Match status changed concurrently; please retry', 409);
    }
    logger.debug(`Match ${matchId} transitioned from ${current.status} to ${newStatus}`);
    await handleStatusTransition(tx, matchId, newStatus, after);
    return current.status;
  });

  // After commit: the bot round-trip for voice channels (waits for the bot, so it can't hold a transaction) and the feed.
  if (newStatus === 'assign') {
    try {
      await VoiceChannelService.setupMatchVoiceChannels(matchId);
    } catch (error) {
      logger.error('Error setting up voice channels:', error);
    }
  }
  await after.run();
  return { from };
}
