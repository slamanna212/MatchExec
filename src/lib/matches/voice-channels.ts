/**
 * Auto-created voice channels for matches: creation (asks the Discord bot over `discord_bot_requests` and waits for the
 * result), cleanup, and the voice announcements that go with them.
 *
 * `createMatchVoiceChannels` waits for the bot, so it must NOT be called inside a database transaction: it enqueues the
 * request on the pool, polls until the bot answers, and only then records the channels.
 */
import { and, asc, eq, exists, lte, sql } from 'drizzle-orm';
import { db, type Executor } from '../../../lib/db';
import { autoVoiceChannels, matchTeams, matches, tournamentMatches, tournamentTeams, tournaments } from '../../../lib/db/schema';
import { logger } from '../logger';
import { findGlobalVoiceChannelId } from '../discord-channels';
import { enqueueBotRequest, enqueueVoiceAnnouncement, getBotRequest } from '../discord-queues';
import { getModeScoringTypeAndMaxTeams } from '../games';
import { getAnyDiscordSettings } from '../settings';
import { getBlueRedChannels, scheduleVoiceCleanup, nextFirstTeam, trackAutoVoiceChannels } from './voice';
import { getMatchTeams, MAX_VOICE_CHANNELS_PER_MATCH } from './teams';

export interface VoiceChannelCreationResult {
  success: boolean;
  blueChannelId?: string;
  redChannelId?: string;
  /** N-team aware: one entry per match_teams row a channel was created for, in team_order. */
  channelIds?: string[];
  message?: string;
}

async function tournamentTeamNames(ex: Executor, matchId: string): Promise<{ team1?: string; team2?: string } | null> {
  const [tm] = await ex.select({ team1_id: tournamentMatches.team1_id, team2_id: tournamentMatches.team2_id }).from(tournamentMatches).where(eq(tournamentMatches.match_id, matchId));
  if (!tm) return null;
  const name = async (id: string | null) => id ? (await ex.select({ n: tournamentTeams.team_name }).from(tournamentTeams).where(eq(tournamentTeams.id, id)))[0]?.n : undefined;
  return { team1: await name(tm.team1_id), team2: await name(tm.team2_id) };
}

async function determineChannelNames(ex: Executor, match: { id: string; name: string; tournament_id: string | null }, isSingleTeam: boolean) {
  const names = match.tournament_id ? await tournamentTeamNames(ex, match.id) : null;
  if (isSingleTeam) return { blueChannelName: (match.tournament_id ? names?.team1 : undefined) || match.name } as { blueChannelName: string; redChannelName?: string };
  if (!names) return { blueChannelName: `${match.name} - Blue Team`, redChannelName: `${match.name} - Red Team` };
  const vsName = `${names.team1 || 'Team 1'} vs ${names.team2 || 'Team 2'}`;
  return { blueChannelName: `${vsName} - Blue Team`, redChannelName: `${vsName} - Red Team` };
}

async function waitForVoiceChannelCreation(requestId: string, matchId: string): Promise<VoiceChannelCreationResult> {
  const maxWaitTime = 30000;
  const pollInterval = 500;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitTime) {
    const request = await getBotRequest(db, requestId);
    if (request?.status === 'completed' && request.result) {
      logger.debug(`Voice channels created successfully for match ${matchId}`);
      return request.result as unknown as VoiceChannelCreationResult;
    }
    if (request?.status === 'failed') {
      const result = (request.result ?? {}) as { message?: string };
      logger.error(`Voice channel creation failed: ${result.message || 'Unknown error'}`);
      return { success: false, message: result.message || 'Failed to create voice channels' };
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  logger.error(`Voice channel creation request timed out for match ${matchId}`);
  return { success: false, message: 'Voice channel creation timed out' };
}

/** Ask the bot to create the match's voice channels and wait (up to 30s) for the answer. Never throws. */
export async function createMatchVoiceChannels(matchId: string): Promise<VoiceChannelCreationResult> {
  try {
    const settings = await getAnyDiscordSettings(db);
    if (!settings?.voice_channel_category_id) {
      logger.debug('Voice channel category not configured, skipping auto-creation');
      return { success: true, message: 'Voice channel category not configured' };
    }

    const [match] = await db.select({ id: matches.id, name: matches.name, tournament_id: matches.tournament_id, game_id: matches.game_id, mode_id: matches.mode_id })
      .from(matches).where(eq(matches.id, matchId));
    if (!match) {
      logger.error('Match not found for voice channel creation:', matchId);
      return { success: false, message: 'Match not found' };
    }

    const gameMode = match.mode_id ? await getModeScoringTypeAndMaxTeams(db, match.game_id, match.mode_id) : undefined;
    const isSingleTeam = gameMode?.max_teams === 1;

    // One channel name per non-reserve match_teams row (N-team aware, capped); legacy blue/red naming for <= 2 teams.
    const activeTeams = (await getMatchTeams(db, matchId)).filter((t) => !t.is_reserve).slice(0, MAX_VOICE_CHANNELS_PER_MATCH);
    // FFA/Position matches have one match_teams row per participant, so they share a single lobby channel.
    const isSharedLobby = gameMode?.scoring_type === 'FFA' || gameMode?.scoring_type === 'Position';

    let channelNames: string[];
    if (isSharedLobby) {
      channelNames = [match.name];
    } else if (isSingleTeam) {
      channelNames = [(await determineChannelNames(db, match, true)).blueChannelName];
    } else if (activeTeams.length > 2) {
      channelNames = activeTeams.map((t) => `${match.name} - ${t.team_name}`);
    } else {
      const { blueChannelName, redChannelName } = await determineChannelNames(db, match, false);
      channelNames = redChannelName ? [blueChannelName, redChannelName] : [blueChannelName];
    }

    const requestId = await enqueueBotRequest(db, 'voice_channel_create', {
      matchId,
      categoryId: settings.voice_channel_category_id,
      channelNames,
      // Legacy fields kept for backward compatibility with older bot builds.
      blueChannelName: channelNames[0],
      redChannelName: channelNames[1],
      isSingleTeam: channelNames.length <= 1,
    });
    logger.debug(`Voice channel creation request queued: ${requestId} (${channelNames.length} channel(s))`);
    return await waitForVoiceChannelCreation(requestId, matchId);
  } catch (error) {
    logger.error('Error creating voice channels:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** True when the match already has voice channels: auto-created (tracked) or set on a team by hand. */
export async function matchHasVoiceChannels(ex: Executor, matchId: string): Promise<boolean> {
  const [tracked] = await ex.select({ id: autoVoiceChannels.id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, matchId)).limit(1);
  if (tracked) return true;
  const [onTeam] = await ex.select({ id: matchTeams.id }).from(matchTeams)
    .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false), sql`${matchTeams.voice_channel_id} is not null`)).limit(1);
  return !!onTeam;
}

/**
 * 'assign' matches whose start is within `leadMinutes` (or already past) and that have teams but no voice channels yet.
 * Cumulative-points tournament matches hold every participant and never get per-match channels.
 */
export async function listMatchesNeedingVoiceChannels(ex: Executor, now: Date, leadMinutes: number, limit = 10): Promise<Array<{ id: string; name: string }>> {
  const horizon = new Date(now.getTime() + leadMinutes * 60_000);
  const cumulative = ex.select({ id: tournaments.id }).from(tournaments)
    .where(and(eq(tournaments.id, matches.tournament_id), eq(tournaments.format, 'cumulative-points')));
  const hasTeam = ex.select({ id: matchTeams.id }).from(matchTeams).where(and(eq(matchTeams.match_id, matches.id), eq(matchTeams.is_reserve, false)));
  const hasChannel = ex.select({ id: autoVoiceChannels.id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, matches.id));
  const hasTeamChannel = ex.select({ id: matchTeams.id }).from(matchTeams)
    .where(and(eq(matchTeams.match_id, matches.id), eq(matchTeams.is_reserve, false), sql`${matchTeams.voice_channel_id} is not null`));
  return ex.select({ id: matches.id, name: matches.name }).from(matches)
    .where(and(
      eq(matches.status, 'assign'), lte(matches.start_date, horizon),
      exists(hasTeam), sql`not exists ${hasChannel}`, sql`not exists ${hasTeamChannel}`, sql`not exists ${cumulative}`,
    ))
    .orderBy(asc(matches.start_date), asc(matches.id)).limit(limit);
}

/** Create the match's voice channels unless it already has some. Call OUTSIDE a transaction; never throws. Returns true if channels exist afterwards. */
export async function ensureMatchVoiceChannels(matchId: string): Promise<boolean> {
  try {
    if (await matchHasVoiceChannels(db, matchId)) return true;
    const [row] = await db.select({ tournament_id: matches.tournament_id }).from(matches).where(eq(matches.id, matchId));
    if (row?.tournament_id) {
      const [t] = await db.select({ format: tournaments.format }).from(tournaments).where(eq(tournaments.id, row.tournament_id));
      if (t?.format === 'cumulative-points') return false;
    }
    await VoiceChannelService.setupMatchVoiceChannels(matchId);
    return await matchHasVoiceChannels(db, matchId);
  } catch (error) {
    logger.error(`Error ensuring voice channels for match ${matchId}:`, error);
    return false;
  }
}

/** Schedule durable cleanup; the bot retains ownership until Discord confirms deletion. */
export async function deleteMatchVoiceChannels(ex: Executor, matchId: string): Promise<boolean> {
  await scheduleVoiceCleanup(ex, matchId);
  return true;
}

/** Record created channels for later cleanup: first two as blue/red, further ones as team3.., a single one as 'all'. */
export async function trackVoiceChannels(ex: Executor, matchId: string, blueChannelId: string, redChannelId?: string, extraChannelIds?: string[]): Promise<void> {
  const channels = redChannelId
    ? [
        { channelId: blueChannelId, teamName: 'blue' },
        { channelId: redChannelId, teamName: 'red' },
        ...(extraChannelIds ?? []).map((channelId, i) => ({ channelId, teamName: `team${i + 3}` })),
      ]
    : [{ channelId: blueChannelId, teamName: 'all' }];
  await trackAutoVoiceChannels(ex, matchId, channels);
}

export type VoiceAnnouncementType = 'welcome' | 'nextround' | 'finish';

export const VoiceChannelService = {
  /** Create voice channels for a match and point each match_teams row at its channel. Call OUTSIDE a transaction. */
  async setupMatchVoiceChannels(matchId: string): Promise<boolean> {
    try {
      const result = await createMatchVoiceChannels(matchId);
      if (!result.success || !result.blueChannelId) {
        logger.debug(`Voice channels not created for match ${matchId}: ${result.message || 'Unknown reason'}`);
        return false;
      }
      // The bot persists ownership and team assignments even when this caller times out.
      return true;
    } catch (error) {
      logger.error('Error setting up voice channels:', error);
      return false;
    }
  },

  /** Queue a voice announcement for a match; falls back to the global blue/red voice channels. */
  async queueVoiceAnnouncement(ex: Executor, matchId: string, type: VoiceAnnouncementType): Promise<boolean> {
    try {
      return await ex.transaction(async (sp) => queueVoiceAnnouncementIn(sp, matchId, type)); // savepoint: a failure must not abort the caller's tx
    } catch (error) {
      logger.error('Error queuing voice announcement:', error);
      return false;
    }
  },
};

async function queueVoiceAnnouncementIn(ex: Executor, matchId: string, type: VoiceAnnouncementType): Promise<boolean> {
  const [match] = await ex.select({ id: matches.id }).from(matches).where(eq(matches.id, matchId));
  if (!match) {
    logger.error('Match not found for voice announcement:', matchId);
    return false;
  }
  const channels = await getBlueRedChannels(ex, matchId);
  let blue = channels.blue;
  let red = channels.red;
  if (!blue && !red) {
    blue = await findGlobalVoiceChannelId(ex, 'blue');
    red = await findGlobalVoiceChannelId(ex, 'red');
  }
  if (!blue && !red) {
    logger.debug(`No voice channels configured for match ${matchId}`);
    return true;
  }
  const firstTeam = await nextFirstTeam(ex, matchId);
  await enqueueVoiceAnnouncement(ex, { matchId, type, blueChannel: blue ?? null, redChannel: red ?? null, firstTeam });
  return true;
}
