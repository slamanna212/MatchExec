/**
 * Tournament status transitions. `transitionTournament` is the one entry point for the API: it locks the tournament,
 * validates, flips the status with a compare-and-set, and writes every Discord queue row and match update the new
 * status causes inside the SAME transaction. Activity-feed writes run after commit.
 */
import { and, asc, eq } from 'drizzle-orm';
import type { Db, Executor } from '../../../lib/db';
import { matches, tournamentMatches, tournamentParticipants, tournamentTeamMembers, tournamentTeams } from '../../../lib/db/schema';
import { TOURNAMENT_FLOW_STEPS } from '@/shared/types';
import { getMode, listModes } from '../games';
import { logFeedEvent } from '../feed-helpers';
import { logger } from '../logger';
import { enqueueAnnouncement, enqueueDeletion, enqueueStatusUpdate } from '../discord-queues';
import { listAllMessages } from '../discord-messages';
import { casMatchStatus, handleTournamentAssignTransition, initializeMatchGames } from '../matches';
import { AfterCommit, bestEffort } from '../matches/effects';
import { genId } from '../matches/ids';
import { countTeamMemberUsers, countTeamMembers, countTeams } from './teams';
import {
  casTournamentStatus, getTournament, getTournamentName, getTournamentWithGame, lockTournament, TournamentError,
  type TournamentRow, type TournamentStatus, type TournamentWithGame,
} from './tournaments';

/**
 * Allowed tournament status transitions. Forward moves are one step at a time (skipping 'assign' would start a
 * tournament with no bracket); 'complete' and 'cancelled' are terminal.
 */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  created: ['gather', 'cancelled'],
  gather: ['assign', 'cancelled'],
  assign: ['battle', 'cancelled'],
  battle: ['complete', 'cancelled'],
  complete: [],
  cancelled: [],
};

export function isKnownStatus(status: unknown): status is TournamentStatus {
  return typeof status === 'string' && !!TOURNAMENT_FLOW_STEPS[status as keyof typeof TOURNAMENT_FLOW_STEPS];
}

/** Why `from -> to` is not allowed, or null. Pure. */
export function validateStatusTransition(from: string, to: string): string | null {
  if (from === to) return `Tournament is already in "${to}" status`;
  if (!(ALLOWED_TRANSITIONS[from] ?? []).includes(to)) return `Cannot transition tournament from "${from}" to "${to}"`;
  return null;
}

/** Starting needs at least 2 teams and some members on them. */
async function validateBattleRequirements(ex: Executor, tournamentId: string): Promise<string | null> {
  if ((await countTeams(ex, tournamentId)) < 2) return 'At least 2 teams are required to start tournament battles';
  if ((await countTeamMembers(ex, tournamentId)) === 0) return 'Teams must have members assigned before starting tournament battles';
  return null;
}

// ─── per-status effects (inside the transition transaction) ──────────────────

export async function handleGatherTransition(ex: Executor, tournamentId: string, after: AfterCommit): Promise<void> {
  logger.debug(`Tournament ${tournamentId} is now open for team signups`);
  const queued = await bestEffort(ex, 'Error queuing Discord tournament announcement',
    async (sp) => { await enqueueAnnouncement(sp, { matchId: tournamentId, type: 'tournament', dedupe: ['pending', 'processing'] }); return true; }, false);
  if (!queued) logger.warning('Failed to queue Discord announcement for tournament:', tournamentId);
  const name = (await getTournamentName(ex, tournamentId)) ?? tournamentId;
  after.add(() => logFeedEvent({
    eventType: 'tournament_phase_changed', priority: 3, title: 'Tournament Signups Opened', description: `"${name}" is now accepting signups`, tournamentId,
  }));
}

/**
 * Individual modes (FFA / Position scoring, or team_size 1) get one solo team per participant when no teams exist yet.
 * FFA/Position modes have a NULL team_size, so the scoring_type must be checked as well.
 */
export async function autoCreateSoloTeams(ex: Executor, tournament: Pick<TournamentRow, 'id' | 'game_id' | 'game_mode_id'>): Promise<number> {
  if ((await countTeams(ex, tournament.id)) > 0) return 0;
  const participants = await ex.select().from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournament_id, tournament.id)).orderBy(asc(tournamentParticipants.joined_at), asc(tournamentParticipants.id));
  if (participants.length === 0) return 0;

  const mode = tournament.game_mode_id ? await getMode(ex, tournament.game_id, tournament.game_mode_id) : undefined;
  let individual: boolean;
  if (mode) {
    individual = mode.scoring_type === 'FFA' || mode.scoring_type === 'Position' || mode.team_size === 1;
  } else {
    // No resolvable mode: any solo mode in the game
    individual = (await listModes(ex, tournament.game_id)).some((m) => m.team_size === 1);
  }
  if (!individual) return 0;

  logger.debug(`Auto-creating solo teams for ${participants.length} participants`);
  for (const p of participants) {
    const teamId = genId('team');
    await ex.insert(tournamentTeams).values({ id: teamId, tournament_id: tournament.id, team_name: p.username });
    await ex.insert(tournamentTeamMembers).values({
      id: genId('member'), team_id: teamId, user_id: p.user_id, discord_user_id: p.discord_user_id, username: p.username,
    });
    await ex.update(tournamentParticipants).set({ team_assignment: teamId }).where(eq(tournamentParticipants.id, p.id));
  }
  logger.debug(`Created ${participants.length} solo teams automatically`);
  return participants.length;
}

export async function handleAssignTransition(ex: Executor, tournamentId: string, after: AfterCommit): Promise<void> {
  logger.debug(`Tournament ${tournamentId} signups closed, ready for bracket assignment`);
  const tournament = await getTournament(ex, tournamentId);
  if (tournament) await bestEffort(ex, 'Error auto-creating solo teams', (sp) => autoCreateSoloTeams(sp, tournament), 0);
  await bestEffort(ex, 'Error queuing Discord tournament status update', (sp) => enqueueStatusUpdate(sp, tournamentId, 'assign'), undefined);
  await bestEffort(ex, 'Error queuing status updates for tournament matches', (sp) => handleTournamentAssignTransition(sp, tournamentId), undefined);
  after.add(() => logFeedEvent({
    eventType: 'tournament_phase_changed', priority: 3, title: 'Tournament Signups Closed',
    description: `"${tournament?.name ?? tournamentId}" signups closed, bracket being assigned`, tournamentId,
  }));
}

/** Start every round-1 match that is waiting in 'assign': flip to battle, announce the start and create its game rows. */
export async function startFirstRoundMatches(ex: Executor, tournamentId: string): Promise<number> {
  const first = await ex.select({ id: matches.id, name: matches.name }).from(matches)
    .innerJoin(tournamentMatches, eq(tournamentMatches.match_id, matches.id))
    .where(and(eq(tournamentMatches.tournament_id, tournamentId), eq(tournamentMatches.round, 1), eq(matches.status, 'assign')))
    .orderBy(asc(tournamentMatches.match_order), asc(matches.id));

  let started = 0;
  for (const match of first) {
    const ok = await bestEffort(ex, `Error starting match ${match.id}`, async (sp) => {
      if (!(await casMatchStatus(sp, match.id, 'assign', 'battle'))) return false;
      await enqueueAnnouncement(sp, { matchId: match.id, type: 'match_start' });
      await initializeMatchGames(sp, match.id);
      return true;
    }, false);
    if (ok) {
      started++;
      logger.debug(`Started match with notifications: ${match.name}`);
    }
  }
  if (started > 0) logger.debug(`Started ${started} first round matches`);
  return started;
}

export async function handleBattleTransition(ex: Executor, tournamentId: string, after: AfterCommit): Promise<void> {
  logger.debug(`Tournament ${tournamentId} started - transitioning first round matches to battle`);
  await startFirstRoundMatches(ex, tournamentId);
  const name = (await getTournamentName(ex, tournamentId)) ?? tournamentId;
  after.add(() => logFeedEvent({
    eventType: 'tournament_started', priority: 2, title: 'Tournament Started', description: `"${name}" battles are underway`, tournamentId,
  }));
}

export async function handleEndTransition(ex: Executor, tournamentId: string, status: 'complete' | 'cancelled', after: AfterCommit): Promise<void> {
  const name = (await getTournamentName(ex, tournamentId)) ?? tournamentId;
  await bestEffort(ex, 'Error queuing Discord event deletion', async (sp) => {
    // Only tournaments that actually have a Discord event need a deletion job.
    const hasEvent = (await listAllMessages(sp, tournamentId)).some((m) => m.discord_event_id);
    if (!hasEvent) {
      logger.debug('No Discord event found for tournament:', tournamentId);
      return;
    }
    await enqueueDeletion(sp, tournamentId);
    logger.debug('Discord event deletion queued for tournament:', tournamentId);
  }, undefined);
  after.add(() => logFeedEvent({
    eventType: status === 'complete' ? 'tournament_completed' : 'tournament_cancelled',
    priority: 2,
    title: status === 'complete' ? 'Tournament Completed' : 'Tournament Cancelled',
    description: status === 'complete' ? `"${name}" is over` : `"${name}" was cancelled`,
    tournamentId,
  }));
}

async function runStatusEffects(ex: Executor, tournamentId: string, newStatus: TournamentStatus, after: AfterCommit): Promise<void> {
  switch (newStatus) {
    case 'gather': await handleGatherTransition(ex, tournamentId, after); break;
    case 'assign': await handleAssignTransition(ex, tournamentId, after); break;
    case 'battle': await handleBattleTransition(ex, tournamentId, after); break;
    case 'complete':
    case 'cancelled': await handleEndTransition(ex, tournamentId, newStatus, after); break;
    default: logger.debug(`No special handling needed for status: ${newStatus}`);
  }
}

export type TransitionResult = TournamentWithGame & { participant_count: number };

/**
 * Move a tournament to `newStatus`. One transaction: row lock -> validation -> compare-and-set -> per-status effects
 * (queue rows, match updates). Concurrent transitions queue behind the lock; the loser fails validation (400) because
 * the status already changed. Throws TournamentError (404 / 400 / 409).
 */
export async function transitionTournament(db: Db, tournamentId: string, newStatus: string): Promise<TransitionResult> {
  if (!isKnownStatus(newStatus)) throw new TournamentError('Invalid status provided', 400);
  const after = new AfterCommit();

  const result = await db.transaction(async (tx) => {
    const current = await lockTournament(tx, tournamentId);
    if (!current) throw new TournamentError('Tournament not found', 404);

    const transitionError = validateStatusTransition(current.status, newStatus);
    if (transitionError) throw new TournamentError(transitionError, 400);
    if (newStatus === 'battle') {
      const battleError = await validateBattleRequirements(tx, tournamentId);
      if (battleError) throw new TournamentError(battleError, 400);
    }

    if (!(await casTournamentStatus(tx, tournamentId, current.status, newStatus))) {
      throw new TournamentError('Tournament status changed concurrently; please retry', 409);
    }
    logger.debug(`Tournament ${tournamentId} transitioned from ${current.status} to ${newStatus}`);

    await runStatusEffects(tx, tournamentId, newStatus, after);

    const updated = await getTournamentWithGame(tx, tournamentId);
    return { ...updated!, participant_count: await countTeamMemberUsers(tx, tournamentId) };
  });

  await after.run();
  return result;
}
