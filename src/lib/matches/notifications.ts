/**
 * Discord queue rows caused by match scoring / completion. Every function takes the caller's executor so the queue row
 * commits together with the state change that caused it. Failures here are non-critical for the scoring flow and are
 * handled by the callers (`bestEffort`).
 */
import { and, asc, count, eq, inArray, notInArray } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { matchGames, matchParticipants, matchTeams, matches, scorecardSubmissions, statsSettings } from '../../../lib/db/schema';
import { logger } from '../logger';
import {
  enqueueDeletion, enqueueMapCode, enqueueMatchWinner, enqueueScoreNotification, enqueueScorecardPrompt, enqueueStatsImage,
  enqueueStatsReport, enqueueVoiceAnnouncement, enqueueWinnerVote,
} from '../discord-queues';
import { countStatDefinitions, findMapByIdOrName, gameSupportsMapCodes } from '../games';
import { getDiscordSettings } from '../settings';
import { teamLabelForOrder } from '../scoring/winners';
import type { MatchResult } from '@/shared/types';
import { countCommanders } from './participants';
import { getBlueRedChannels, nextFirstTeam } from './voice';
import { getOverallMatchScore, getParticipantPointTotals } from './scoreboard';

const fmt = (p: { username: string; discord_user_id?: string | null }) => (p.discord_user_id ? `<@${p.discord_user_id}>` : p.username);

async function teamPlayers(ex: Executor, matchId: string, teamId: string) {
  return ex.select({ username: matchParticipants.username, discord_user_id: matchParticipants.discord_user_id }).from(matchParticipants)
    .where(and(eq(matchParticipants.match_id, matchId), eq(matchParticipants.team_id, teamId)))
    .orderBy(asc(matchParticipants.username), asc(matchParticipants.id));
}

/** Resolve the winning match_teams.id for a Normal result: the explicit id, else 'team1'/'team2' mapped to team_order 0/1. */
export async function resolveWinnerTeamId(ex: Executor, matchId: string, result: Pick<MatchResult, 'winner' | 'winnerTeamId'>): Promise<string | null> {
  if (result.winnerTeamId) return result.winnerTeamId;
  if (result.winner !== 'team1' && result.winner !== 'team2') return null;
  const [row] = await ex.select({ id: matchTeams.id }).from(matchTeams)
    .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.team_order, result.winner === 'team1' ? 0 : 1), eq(matchTeams.is_reserve, false))).limit(1);
  return row?.id ?? null;
}

/** Queue a Discord score notification for a scored game. */
export async function queueScoreNotification(ex: Executor, matchGameId: string, result: MatchResult): Promise<void> {
  const [gameData] = await ex
    .select({ match_id: matchGames.match_id, round: matchGames.round, map_id: matchGames.map_id, game_id: matches.game_id })
    .from(matchGames).innerJoin(matches, eq(matches.id, matchGames.match_id)).where(eq(matchGames.id, matchGameId));
  if (!gameData) {
    logger.warning('No game data found for score notification');
    return;
  }

  // The `winner` label follows the queue contract: 'team1'/'team2' for team_order 0/1, 'team' for 3rd+ teams,
  // 'participant' for FFA/Position, 'tie' for draws.
  let winningTeamName: string;
  let winningPlayers: string[];
  let winnerLabel: string;

  let participantWinnerId: string | undefined;
  if (result.isFfaMode && result.participantWinnerId) participantWinnerId = result.participantWinnerId;
  else if (result.isPositionMode && result.positionResults) participantWinnerId = Object.entries(result.positionResults).find(([, pos]) => pos === 1)?.[0];

  if (result.isFfaMode || result.isPositionMode) {
    winnerLabel = 'participant';
    const [participant] = participantWinnerId
      ? await ex.select({ username: matchParticipants.username, discord_user_id: matchParticipants.discord_user_id }).from(matchParticipants)
          .where(and(eq(matchParticipants.match_id, gameData.match_id), eq(matchParticipants.id, participantWinnerId)))
      : [];
    winningTeamName = participant?.username ?? 'Unknown Player';
    winningPlayers = [participant ? fmt(participant) : 'Unknown Player'];
  } else if (result.draw) {
    winnerLabel = 'tie';
    winningTeamName = 'Draw';
    winningPlayers = [];
  } else {
    const winnerTeamId = await resolveWinnerTeamId(ex, gameData.match_id, result);
    const [teamRow] = winnerTeamId
      ? await ex.select({ team_name: matchTeams.team_name, team_order: matchTeams.team_order }).from(matchTeams).where(eq(matchTeams.id, winnerTeamId))
      : [];
    if (winnerTeamId && teamRow) {
      winnerLabel = teamLabelForOrder(teamRow.team_order);
      winningTeamName = teamRow.team_name;
      winningPlayers = (await teamPlayers(ex, gameData.match_id, winnerTeamId)).map(fmt);
    } else {
      const isTeam1 = result.winner !== 'team2';
      winnerLabel = isTeam1 ? 'team1' : 'team2';
      winningTeamName = isTeam1 ? 'Blue Team' : 'Red Team';
      winningPlayers = [];
    }
  }

  await enqueueScoreNotification(ex, {
    matchId: gameData.match_id,
    gameId: gameData.game_id, // the GAME id, used for the embed's game display
    mapId: gameData.map_id || 'unknown',
    gameNumber: gameData.round,
    winner: winnerLabel,
    winningTeamName,
    winningPlayers,
  });
  logger.debug(`Queued score notification: ${winningTeamName} wins game ${gameData.round}`);
}

/** Queue the map-code DMs for a map that just became the ongoing one. */
export async function queueMapCodePMsForNext(ex: Executor, matchId: string, mapName?: string, mapInstanceId?: string): Promise<void> {
  if (!mapName) return;
  const [match] = await ex.select({ map_codes: matches.map_codes, game_id: matches.game_id }).from(matches).where(eq(matches.id, matchId));
  if (!match || !(await gameSupportsMapCodes(ex, match.game_id))) return;
  const mapCodes = match.map_codes ?? {};

  // Instance id exact match first (keys look like "hanamura-1776547135395-abc"), then display name, then a
  // case/diacritics-insensitive match.
  let mapCode: string | undefined = mapInstanceId ? mapCodes[mapInstanceId] || undefined : undefined;
  const cleanName = mapName.replace(/-\d+$/, '');
  if (!mapCode) {
    mapCode = mapCodes[cleanName];
    if (!mapCode) {
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const key = Object.keys(mapCodes).find((k) => norm(k) === norm(cleanName));
      if (key) mapCode = mapCodes[key];
    }
  }
  if (!mapCode) return;

  const mapRow = await findMapByIdOrName(ex, match.game_id, cleanName);
  await enqueueMapCode(ex, { matchId, mapName: mapRow?.name ?? mapName, mapCode });
  logger.debug(`Map code PMs queued for next map: ${mapName} in match ${matchId}`);
}

/** Queue the winner-announcement for a completed match. */
export async function queueMatchWinnerNotification(ex: Executor, matchId: string): Promise<void> {
  const [matchData] = await ex.select({ name: matches.name, game_id: matches.game_id }).from(matches).where(eq(matches.id, matchId));
  if (!matchData) {
    logger.warning('Match not found for winner notification:', matchId);
    return;
  }
  const scoreData = await getOverallMatchScore(ex, matchId);

  let winner: string;
  let winningTeamName: string;
  let winningPlayers: string[] = [];
  let team1Score: number;
  let team2Score: number;
  let totalMaps: number;

  if (scoreData.scoringType === 'FFA' || scoreData.scoringType === 'Position') {
    const totals = await getParticipantPointTotals(ex, matchId);
    const [completed] = await ex.select({ cnt: count() }).from(matchGames).where(and(eq(matchGames.match_id, matchId), eq(matchGames.status, 'completed')));
    totalMaps = completed?.cnt ?? 0;
    if (totals.length === 0 || totalMaps === 0) {
      logger.warning('No completed games found for match winner notification:', matchId);
      return;
    }
    const isTie = totals.length > 1 && totals[0].total_pts === totals[1].total_pts;
    team1Score = totals[0].total_pts;
    team2Score = 0;
    if (isTie) {
      winner = 'tie';
      winningTeamName = 'Match Tied';
    } else {
      winner = 'participant';
      const [participant] = await ex.select({ username: matchParticipants.username, discord_user_id: matchParticipants.discord_user_id }).from(matchParticipants)
        .where(and(eq(matchParticipants.match_id, matchId), eq(matchParticipants.id, totals[0].entity_id)));
      winningTeamName = participant?.username ?? 'Unknown Player';
      winningPlayers = participant ? [fmt(participant)] : [];
    }
  } else {
    if (scoreData.totalNormalGames === 0) {
      logger.warning('No completed normal games found for match winner notification:', matchId);
      return;
    }
    team1Score = scoreData.team1Wins;
    team2Score = scoreData.team2Wins;
    totalMaps = scoreData.totalNormalGames;
    const winnerTeamId = scoreData.overallWinnerTeamId;
    if (winnerTeamId) {
      const winnerTeam = scoreData.teamScores.find((t) => t.teamId === winnerTeamId);
      winner = teamLabelForOrder(winnerTeam?.teamOrder);
      winningTeamName = winnerTeam?.teamName ?? 'Unknown Team';
      // With 3+ teams the 2-slot score columns can't hold the winner's wins; show winner vs best opponent.
      if (winner === 'team') {
        team1Score = winnerTeam?.wins ?? 0;
        team2Score = Math.max(0, ...scoreData.teamScores.filter((t) => t.teamId !== winnerTeamId).map((t) => t.wins));
      }
      winningPlayers = (await teamPlayers(ex, matchId, winnerTeamId)).map(fmt);
    } else {
      winner = 'tie';
      winningTeamName = 'Match Tied';
    }
  }

  await enqueueMatchWinner(ex, { matchId, matchName: matchData.name, gameId: matchData.game_id, winner, winningTeamName, winningPlayers, team1Score, team2Score, totalMaps });
  logger.debug(`Match winner notification queued: ${winningTeamName} (${winner}) for ${matchData.name} (${team1Score}-${team2Score})`);
}

// TODO(stats): stats_settings / scorecard_submissions belong to Stage 2 item 8; only these tiny reads live here.
async function statsEnabled(ex: Executor): Promise<boolean> {
  const [row] = await ex.select({ enabled: statsSettings.enabled }).from(statsSettings).where(eq(statsSettings.id, 1));
  return !!row?.enabled;
}

export async function queueScorecardPrompts(ex: Executor, matchId: string, matchGameId: string, mapName: string): Promise<void> {
  if (!(await statsEnabled(ex))) return;
  const [match] = await ex.select({ game_id: matches.game_id }).from(matches).where(eq(matches.id, matchId));
  if (!match || (await countStatDefinitions(ex, match.game_id)) === 0) return;
  await enqueueScorecardPrompt(ex, { matchId, matchGameId, mapName });
  logger.debug(`Scorecard prompt queued for match ${matchId}, game ${matchGameId}`);
}

export async function queueWinnerVote(ex: Executor, matchId: string, matchGameId: string, mapName: string): Promise<void> {
  const discord = await getDiscordSettings(ex);
  if (!discord?.winner_vote_enabled) {
    logger.debug(`Winner vote skipped for match ${matchId}: winner_vote_enabled is disabled`);
    return;
  }
  if ((await countCommanders(ex, matchId)) === 0) {
    logger.debug(`Winner vote skipped for match ${matchId}: no eligible commanders`);
    return;
  }
  await enqueueWinnerVote(ex, { matchId, matchGameId, mapName });
}

export async function queueStatsAggregation(ex: Executor, matchId: string): Promise<void> {
  if (!(await statsEnabled(ex))) return;
  const [row] = await ex.select({ cnt: count() }).from(scorecardSubmissions)
    .where(and(eq(scorecardSubmissions.match_id, matchId), inArray(scorecardSubmissions.review_status, ['approved', 'auto_approved'])));
  if (!row || row.cnt === 0) return;
  await enqueueStatsImage(ex, matchId);
}

export async function queueStatsReportDMs(ex: Executor, matchId: string): Promise<void> {
  const [pending] = await ex.select({ cnt: count() }).from(scorecardSubmissions)
    .where(and(eq(scorecardSubmissions.match_id, matchId), notInArray(scorecardSubmissions.review_status, ['approved', 'rejected', 'auto_approved'])));
  if (pending && pending.cnt > 0) {
    logger.debug(`Stats report DMs deferred for match ${matchId} - ${pending.cnt} submission(s) still pending review`);
    return;
  }
  await enqueueStatsReport(ex, matchId);
}

/** Queue Discord message/event deletion for a finished or cancelled match. */
export async function queueDiscordDeletion(ex: Executor, matchId: string): Promise<void> {
  await enqueueDeletion(ex, matchId);
  logger.debug(`Discord deletion queued for match: ${matchId}`);
}

/** Queue the voice announcement that follows a scored map ('nextround' while maps remain, 'finish' when complete). */
export async function queueVoiceAnnouncementForScore(ex: Executor, matchId: string, hasNextMap: boolean, isMatchComplete: boolean): Promise<void> {
  const { blue, red } = await getBlueRedChannels(ex, matchId);
  if (!blue && !red) {
    logger.debug(`No voice channels configured for match: ${matchId}`);
    return;
  }
  let type: 'nextround' | 'finish';
  if (isMatchComplete) type = 'finish';
  else if (hasNextMap) type = 'nextround';
  else {
    logger.warning('No next map but match not complete for:', matchId);
    return;
  }
  const firstTeam = await nextFirstTeam(ex, matchId);
  await enqueueVoiceAnnouncement(ex, { matchId, type, blueChannel: blue ?? null, redChannel: red ?? null, firstTeam });
}

/**
 * Stats-enabled matches hold the Discord map notification until the scorecard players are matched. Queues the held
 * notification for `matchGameId` (once) and marks the game notified. Returns whether a notification was queued.
 */
export async function releaseHeldScoreNotification(ex: Executor, matchGameId: string): Promise<boolean> {
  return ex.transaction(async (tx) => {
    const [game] = await tx
      .select({ match_id: matchGames.match_id, discord_notified: matchGames.discord_notified, stats_enabled: matches.stats_enabled })
      .from(matchGames).innerJoin(matches, eq(matches.id, matchGames.match_id)).where(eq(matchGames.id, matchGameId)).for('update', { of: matchGames });
    if (!game?.stats_enabled || game.discord_notified) return false;
    const { getMatchResult } = await import('./results');
    const result = await getMatchResult(tx, matchGameId);
    if (!result) return false;
    await queueScoreNotification(tx, matchGameId, result);
    await tx.update(matchGames).set({ discord_notified: true }).where(eq(matchGames.id, matchGameId));
    return true;
  });
}
