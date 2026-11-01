/** Saving and reading the result of a single match game (placements), plus map progression and auto-completion. */
import { and, asc, eq } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { matchGamePlacements, matchGames, matchParticipants, matchTeams, matches } from '../../../lib/db/schema';
import { logger } from '../logger';
import { deleteFeedEvents, logFeedEvent } from '../feed-helpers';
import { rankByPoints } from '../scoring/position';
import { teamLabelForOrder } from '../scoring/winners';
import type { MatchResult } from '@/shared/types';
import type { GameResult, ParticipantPlacement, TeamPlacement } from '../types/scoring';
import { bestEffort, AfterCommit } from './effects';
import { ensureMatchGameExists, getScoringTypeForGame, listPlacements, lookupMapName, areAllGamesCompleted } from './games';
import { newPlacementId } from './ids';
import {
  queueMapCodePMsForNext, queueScoreNotification, queueScorecardPrompts, queueVoiceAnnouncementForScore, queueWinnerVote,
  resolveWinnerTeamId,
} from './notifications';
import { calculatePositionPoints, determineMatchWinner } from './scoreboard';
import { casMatchStatus } from './matches';
import { createMatchTeams, lockMatch } from './teams';
import { runMatchCompletionSideEffects } from './completion';

/** Thrown by saveMatchResult when the game is already scored and the caller didn't ask to rescore. */
export class GameAlreadyScoredError extends Error {
  constructor(public matchGameId: string) {
    super(`Game ${matchGameId} is already scored; pass rescore: true to correct its result`);
    this.name = 'GameAlreadyScoredError';
  }
}

// ─── Placement writers ───────────────────────────────────────────────────────
// Each writer first clears the game's placements so a rescore replaces (rather than merges with) the previous result.

async function clearPlacements(ex: Executor, matchGameId: string): Promise<void> {
  await ex.delete(matchGamePlacements).where(eq(matchGamePlacements.match_game_id, matchGameId));
}

/**
 * Normal mode: one row per non-reserve team. The winner gets position 1 / is_winner; every other team position 2, since
 * a single game declares one winner. A draw writes every team at position 1 with is_winner false.
 */
async function savePlacementsForNormal(
  ex: Executor, matchGameId: string, matchId: string, winnerTeamId: string | null,
  winnerScore?: number | null, loserTeamId?: string | null, loserScore?: number | null, draw = false,
): Promise<void> {
  await clearPlacements(ex, matchGameId);
  const teams = await ex.select({ id: matchTeams.id }).from(matchTeams)
    .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
  // With exactly two teams the loser is unambiguous, so a loserScore is kept even without loserTeamId.
  const impliedLoserId = !loserTeamId && !draw && winnerTeamId && teams.length === 2 ? teams.find((t) => t.id !== winnerTeamId)?.id : undefined;
  const effectiveLoserId = loserTeamId ?? impliedLoserId;
  if (teams.length === 0) return;
  await ex.insert(matchGamePlacements).values(teams.map((team) => {
    const isWinner = !draw && team.id === winnerTeamId;
    const score = isWinner ? (winnerScore ?? null) : (effectiveLoserId && team.id === effectiveLoserId ? (loserScore ?? null) : null);
    return {
      id: newPlacementId(), match_game_id: matchGameId, entity_type: 'team' as const, entity_id: team.id,
      position: draw || isWinner ? 1 : 2, score, is_winner: isWinner,
    };
  }));
}

async function savePlacementsForFfa(ex: Executor, matchGameId: string, winnerParticipantId: string): Promise<void> {
  await clearPlacements(ex, matchGameId);
  await ex.insert(matchGamePlacements).values({
    id: newPlacementId(), match_game_id: matchGameId, entity_type: 'participant', entity_id: winnerParticipantId, position: 1, is_winner: true,
  });
}

async function savePlacementsForPosition(
  ex: Executor, matchGameId: string, matchId: string, positionResults: Record<string, number>, pointsAwarded: Record<string, number>,
): Promise<void> {
  await clearPlacements(ex, matchGameId);
  const entries = Object.entries(positionResults);
  if (entries.length > 0) {
    await ex.insert(matchGamePlacements).values(entries.map(([participantId, position]) => ({
      id: newPlacementId(), match_game_id: matchGameId, entity_type: 'participant' as const, entity_id: participantId,
      position, points_awarded: pointsAwarded[participantId] ?? 0, is_winner: position === 1,
    })));
  }
  await savePlacementsForPositionTeams(ex, matchGameId, matchId, positionResults, pointsAwarded);
}

/**
 * Team-endurance Position matches (participants grouped into match_teams with 2+ members) additionally get team-level
 * rows: each team's members' points summed and ranked. A no-op for individual Position matches.
 */
async function savePlacementsForPositionTeams(
  ex: Executor, matchGameId: string, matchId: string, positionResults: Record<string, number>, pointsAwarded: Record<string, number>,
): Promise<void> {
  const participantIds = Object.keys(positionResults);
  if (participantIds.length === 0) return;
  const teamRows = await ex.select({ id: matchParticipants.id, team_id: matchParticipants.team_id }).from(matchParticipants)
    .where(eq(matchParticipants.match_id, matchId));
  const teamOfParticipant = new Map(teamRows.map((r) => [r.id, r.team_id]));

  const countByTeam = new Map<string, number>();
  const teamPoints = new Map<string, number>();
  for (const pid of participantIds) {
    const teamId = teamOfParticipant.get(pid);
    if (!teamId) continue;
    countByTeam.set(teamId, (countByTeam.get(teamId) ?? 0) + 1);
    teamPoints.set(teamId, (teamPoints.get(teamId) ?? 0) + (pointsAwarded[pid] ?? 0));
  }
  if (![...countByTeam.values()].some((c) => c >= 2) || teamPoints.size === 0) return;

  await ex.insert(matchGamePlacements).values(rankByPoints(teamPoints).map(({ teamId, points, position, isWinner }) => ({
    id: newPlacementId(), match_game_id: matchGameId, entity_type: 'team' as const, entity_id: teamId, position, points_awarded: points, is_winner: isWinner,
  })));
}

/** Write the placements and mark the game completed. Runs inside the caller's transaction. */
async function saveScoringModeResult(ex: Executor, matchGameId: string, result: MatchResult): Promise<void> {
  const completed = { status: 'completed' as const, completed_at: new Date(), updated_at: new Date() };
  if (result.isPositionMode && result.positionResults) {
    const pointsAwarded = await calculatePositionPoints(ex, result.positionResults, matchGameId);
    await savePlacementsForPosition(ex, matchGameId, result.matchId, result.positionResults, pointsAwarded);
  } else if (result.isFfaMode && result.participantWinnerId) {
    await savePlacementsForFfa(ex, matchGameId, result.participantWinnerId);
  } else {
    // Normal mode needs team rows to hold the result; make sure they exist (idempotent).
    await createMatchTeams(ex, result.matchId);
    if (result.draw) {
      await savePlacementsForNormal(ex, matchGameId, result.matchId, null, undefined, undefined, undefined, true);
    } else {
      const winnerTeamId = await resolveWinnerTeamId(ex, result.matchId, result);
      await savePlacementsForNormal(ex, matchGameId, result.matchId, winnerTeamId, result.winnerScore, result.loserTeamId, result.loserScore);
    }
  }
  await ex.update(matchGames).set(completed).where(eq(matchGames.id, matchGameId));
}

// ─── saveMatchResult ─────────────────────────────────────────────────────────

/** Promote the first pending map to ongoing and queue its map-code / scorecard / winner-vote work. */
async function setNextMapToOngoing(ex: Executor, matchId: string): Promise<{ id: string; round: number; mapName: string | null } | null> {
  const [next] = await ex.select({ id: matchGames.id, round: matchGames.round, map_id: matchGames.map_id }).from(matchGames)
    .where(and(eq(matchGames.match_id, matchId), eq(matchGames.status, 'pending'))).orderBy(asc(matchGames.round)).limit(1);
  if (!next) return null;
  await ex.update(matchGames).set({ status: 'ongoing' }).where(eq(matchGames.id, next.id));
  const mapName = await lookupMapName(ex, matchId, next.map_id);

  await bestEffort(ex, 'Error queuing map code PMs for next map', (sp) => queueMapCodePMsForNext(sp, matchId, mapName ?? undefined, next.map_id ?? undefined), undefined);
  await bestEffort(ex, 'Error queuing scorecard prompts or winner vote for next map', async (sp) => {
    await queueScorecardPrompts(sp, matchId, next.id, mapName || '');
    await queueWinnerVote(sp, matchId, next.id, mapName || '');
  }, undefined);
  return { id: next.id, round: next.round, mapName };
}

/** After a rescore, refresh winner_team on an already-complete match (no other side effects). */
async function recomputeWinnerAfterRescore(ex: Executor, matchId: string): Promise<void> {
  const [match] = await ex.select({ status: matches.status }).from(matches).where(eq(matches.id, matchId));
  if (match?.status !== 'complete') return;
  const winnerTeam = await determineMatchWinner(ex, matchId);
  await ex.update(matches).set({ winner_team: winnerTeam, updated_at: new Date() }).where(and(eq(matches.id, matchId), eq(matches.status, 'complete')));
}

/**
 * Save the result of a match game: team-based, FFA or Position. Everything the result causes (placements, next map,
 * Discord queue rows, auto-completion) happens in ONE transaction.
 *
 * Concurrency: the transaction first locks the match row (`SELECT ... FOR UPDATE`), so the web UI and a Discord winner
 * vote scoring the same game (or two maps of a match finishing together) are serialised. The "already scored?" check and
 * the "all games complete -> complete the match" check both happen under that lock, so exactly one scorer performs the
 * first score and runs the next-map / completion side effects; the other gets GameAlreadyScoredError.
 *
 * Re-scoring (`result.rescore`) replaces the placements and recomputes a complete match's winner_team without
 * re-firing notification / completion side effects. Activity-feed writes (still SQLite) run after the commit.
 */
export async function saveMatchResult(ex: Executor, matchGameId: string, result: MatchResult, outerAfter?: AfterCommit): Promise<void> {
  // A caller that already holds the transaction passes its own AfterCommit and runs it once ITS transaction commits: the
  // feed writes must not run inside it (they need a lock on the match row that the open transaction holds).
  const after = outerAfter ?? new AfterCommit();
  try {
    await ex.transaction(async (tx) => {
      await lockMatch(tx, result.matchId);
      await ensureMatchGameExists(tx, matchGameId, result.matchId);

      const [prior] = await tx.select({ status: matchGames.status, round: matchGames.round }).from(matchGames).where(eq(matchGames.id, matchGameId)).for('update');
      const alreadyScored = prior?.status === 'completed';
      if (alreadyScored && !result.rescore) throw new GameAlreadyScoredError(matchGameId);

      await saveScoringModeResult(tx, matchGameId, result);
      if (alreadyScored) {
        await recomputeWinnerAfterRescore(tx, result.matchId);
        return;
      }

      const [info] = await tx.select({ name: matches.name, stats_enabled: matches.stats_enabled }).from(matches).where(eq(matches.id, result.matchId));
      after.add(() => logFeedEvent({
        eventType: 'map_scored', priority: 3, title: 'Map Scored',
        description: `Map ${prior?.round ?? ''} of "${info?.name ?? matchGameId}" completed`,
        matchId: result.matchId, metadata: { matchGameId, round: prior?.round },
      }));

      // Stats-enabled matches hold the Discord map notification until the stats are in.
      if (info?.stats_enabled) {
        logger.debug(`Stats-enabled match - holding Discord map notification for game ${matchGameId}`);
      } else {
        await bestEffort(tx, 'Error queueing score notification', (sp) => queueScoreNotification(sp, matchGameId, result), undefined);
        await tx.update(matchGames).set({ discord_notified: true }).where(eq(matchGames.id, matchGameId));
      }
      after.add(() => deleteFeedEvents(result.matchId, ['match_scoring_required']));

      const nextMap = await setNextMapToOngoing(tx, result.matchId);
      if (nextMap) {
        after.add(() => logFeedEvent({
          eventType: 'match_scoring_required', priority: 3, title: 'Map Scoring Required',
          description: `"${info?.name ?? result.matchId}" - Map ${nextMap.round}: ${nextMap.mapName ?? 'Unknown Map'}`,
          matchId: result.matchId, metadata: { matchGameId: nextMap.id, round: nextMap.round, mapName: nextMap.mapName },
        }));
      }

      const completed = await autoCompleteMatch(tx, result.matchId, after);
      await bestEffort(tx, 'Error queuing voice announcement for score', (sp) => queueVoiceAnnouncementForScore(sp, result.matchId, nextMap !== null, completed), undefined);
    });
  } catch (error) {
    if (!(error instanceof GameAlreadyScoredError)) logger.error('Error in saveMatchResult:', error);
    throw error;
  }
  if (!outerAfter) await after.run();
}

/**
 * Complete the match when every game is scored. The status flip is a compare-and-set (plus the caller's match row lock)
 * so completion side effects fire exactly once. Returns whether this call completed the match.
 */
export async function autoCompleteMatch(ex: Executor, matchId: string, after: AfterCommit): Promise<boolean> {
  if (!(await areAllGamesCompleted(ex, matchId))) return false;
  const [current] = await ex.select({ status: matches.status }).from(matches).where(eq(matches.id, matchId));
  if (!current || current.status === 'complete' || current.status === 'cancelled') return false;

  const winnerTeam = await determineMatchWinner(ex, matchId);
  if (!(await casMatchStatus(ex, matchId, current.status, 'complete', winnerTeam))) return false;
  logger.debug(`Match ${matchId} marked as complete with winner: ${winnerTeam || 'tie/none'}`);
  await runMatchCompletionSideEffects(ex, matchId, after);
  return true;
}

// ─── Reading a game's result ─────────────────────────────────────────────────

/** The result of a scored game as a MatchResult (from placements), or null when it has none. */
export async function getMatchResult(ex: Executor, matchGameId: string): Promise<MatchResult | null> {
  const [game] = await ex.select({ match_id: matchGames.match_id, completed_at: matchGames.completed_at }).from(matchGames).where(eq(matchGames.id, matchGameId));
  if (!game) return null;
  const placements = await listPlacements(ex, matchGameId);
  if (placements.length === 0) return null;

  // Prefer the mode's declared scoring_type; only trust it when rows of the matching kind exist.
  const declared = await getScoringTypeForGame(ex, matchGameId);
  const hasParticipantRows = placements.some((p) => p.entity_type === 'participant');
  const hasTeamRows = placements.some((p) => p.entity_type === 'team');
  const declaredType = declared && (declared === 'Normal' ? hasTeamRows : hasParticipantRows) ? declared : null;
  const scoringType = declaredType ?? (hasParticipantRows
    ? (placements.filter((p) => p.entity_type === 'participant' && p.position != null).length > 1 ? 'Position' : 'FFA')
    : 'Normal');
  const completedAt = game.completed_at ?? new Date(0);
  const base = { matchId: game.match_id, gameId: matchGameId, completedAt };

  if (scoringType === 'Normal') {
    const teamPlacements = placements.filter((p) => p.entity_type === 'team');
    const winner = teamPlacements.find((p) => p.is_winner);
    if (!winner) {
      // A draw: every team recorded at position 1 with no winner.
      const isDraw = teamPlacements.length > 0 && teamPlacements.every((p) => p.position === 1);
      return isDraw ? { ...base, winner: 'tie', draw: true, isFfaMode: false } : null;
    }
    const [teamRow] = await ex.select({ team_order: matchTeams.team_order }).from(matchTeams).where(eq(matchTeams.id, winner.entity_id));
    return { ...base, winner: teamLabelForOrder(teamRow?.team_order ?? 0), winnerTeamId: winner.entity_id, isFfaMode: false };
  }

  const participantPlacements = placements.filter((p) => p.entity_type === 'participant');
  if (scoringType === 'Position') {
    const positionResults: Record<string, number> = {};
    for (const p of participantPlacements.filter((x) => x.position != null).sort((a, b) => (a.position ?? 99) - (b.position ?? 99))) {
      positionResults[p.entity_id] = p.position!;
    }
    return { ...base, winner: 'team1', isFfaMode: false, isPositionMode: true, positionResults };
  }
  const ffaWinner = participantPlacements.find((p) => p.is_winner);
  return ffaWinner ? { ...base, winner: 'team1', participantWinnerId: ffaWinner.entity_id, isFfaMode: true } : null;
}

/** A typed GameResult discriminated union for a scored game; null when it has no placements. */
export async function getGameResult(ex: Executor, matchGameId: string): Promise<GameResult | null> {
  const [game] = await ex.select({ match_id: matchGames.match_id }).from(matchGames).where(eq(matchGames.id, matchGameId));
  if (!game) return null;
  const placements = await listPlacements(ex, matchGameId);
  if (placements.length === 0) return null;

  const declared = await getScoringTypeForGame(ex, matchGameId);
  const hasTeamRows = placements.some((p) => p.entity_type === 'team');
  const hasParticipantRows = placements.some((p) => p.entity_type === 'participant');
  const declaredType = declared && (declared === 'Normal' ? hasTeamRows : hasParticipantRows) ? declared : null;
  const scoringType = declaredType ?? (hasTeamRows ? 'Normal' : 'FFA');

  if (scoringType === 'Normal') {
    const teamPlacements = placements.filter((p) => p.entity_type === 'team');
    const teamRows = await ex.select({ id: matchTeams.id, team_name: matchTeams.team_name, team_color: matchTeams.team_color }).from(matchTeams).where(eq(matchTeams.match_id, game.match_id));
    const teamMap = new Map(teamRows.map((t) => [t.id, t]));
    const typed: TeamPlacement[] = teamPlacements.map((p) => ({
      entityType: 'team', entityId: p.entity_id, teamName: teamMap.get(p.entity_id)?.team_name ?? p.entity_id,
      teamColor: teamMap.get(p.entity_id)?.team_color ?? undefined, position: p.position ?? 99, score: p.score ?? undefined, isWinner: p.is_winner,
    }));
    return { type: 'Normal', matchGameId, matchId: game.match_id, placements: typed };
  }

  const participantPlacements = placements.filter((p) => p.entity_type === 'participant');
  if (participantPlacements.length === 0) return null;
  const participants = await ex.select({ id: matchParticipants.id, username: matchParticipants.username }).from(matchParticipants).where(eq(matchParticipants.match_id, game.match_id));
  const names = new Map(participants.map((p) => [p.id, p.username]));
  const typed: ParticipantPlacement[] = participantPlacements.map((p) => ({
    entityType: 'participant', entityId: p.entity_id, username: names.get(p.entity_id), position: p.position ?? undefined,
    score: p.score ?? undefined, pointsAwarded: p.points_awarded ?? undefined, isWinner: p.is_winner,
  }));
  return scoringType === 'Position'
    ? { type: 'Position', matchGameId, matchId: game.match_id, placements: typed }
    : { type: 'FFA', matchGameId, matchId: game.match_id, placements: typed };
}
