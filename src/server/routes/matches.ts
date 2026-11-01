/** `/api/matches/**` (matches, teams, participants, games, results, transitions, reminders, setup). Thin handlers over `src/lib/matches`. */
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { db } from '../../../lib/db';
import { discordMatchMessages } from '../../../lib/db/schema';
import { logger } from '@/lib/logger';
import { MATCH_FLOW_STEPS } from '@/shared/types';
import { enqueueDeletion, enqueueMatchEdit } from '@/lib/discord-queues';
import { processMatchAnnouncements } from '@/lib/reminder-helpers';
import { validateMaxLength, validateNumberRange, validateEnum } from '@/lib/utils/validation';
import { logFeedEvent, deleteFeedEvents } from '@/lib/feed-helpers';
import {
  AssignTeamsError, GameAlreadyScoredError, MatchTransitionError, ResultError, SetupStatusError, assignTeams, createMatchFromRequest,
  createMatchTeams, deleteMatch, getGameResult, getMapCodes, getMapNotes, getMatch, getMatchDetail, getMatchEditContext,
  getMatchGameInMatch, getMatchGames, getMatchGamesWithResults, getMatchResult, getMatchScoringType, getMatchTeams, getMatchWithGame,
  getSuggestedPositions, initializeMatchGames, listMatches, listParticipantDtos, listParticipantIds, listSetupParticipants,
  matchExists, saveMapNote, saveSetup, setMapCodes, submitGameResult, transitionMatch, updateMatchDetails, validateMatchRequest,
  getOverallMatchScore, resolveWinnerEntity, isKnownStatus, type MatchRequestBody,
} from '@/lib/matches';
import { jsonError } from '../http';

const RULES_VALUES = ['casual', 'competitive'] as const;

function validId(id: string | undefined): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

async function body(c: Context): Promise<any> {
  return c.req.json();
}

/** The match fields the dashboards read, plus the derived booleans. */
function matchDto<T extends { map_codes_supported?: boolean | null; maps?: unknown; map_codes?: unknown }>(m: T) {
  return { ...m, maps: m.maps ?? [], map_codes: m.map_codes ?? {}, map_codes_supported: Boolean(m.map_codes_supported) };
}

export const matches = new Hono()
  // ── list / create ─────────────────────────────────────────────────────────
  .get('/', async (c) => {
    try {
      // status may be repeated (?status=a&status=b) or comma-separated (?status=a,b)
      const statuses = (c.req.queries('status') ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
      const limitParam = c.req.query('limit');
      const limit = limitParam ? Number.parseInt(limitParam, 10) : null;
      const offset = Number.parseInt(c.req.query('offset') ?? '0', 10) || 0;
      const rows = await listMatches(db, { statuses, excludeTournament: c.req.query('exclude_tournament') === 'true', limit, offset });

      // ETag from count + latest updated_at + total participants (+ series links) for efficient polling.
      const maxUpdatedAt = rows.reduce((max, m) => Math.max(max, m.updated_at.getTime()), 0);
      const totalParticipants = rows.reduce((sum, m) => sum + (m.participant_count || 0), 0);
      const seriesLinks = rows.reduce((sum, m) => sum + m.series.length, 0);
      const etag = `"${rows.length}:${maxUpdatedAt}:${totalParticipants}:${seriesLinks}"`;
      if (limit === null && c.req.header('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
      c.header('ETag', etag);
      return c.json(rows);
    } catch (error) {
      logger.error('Error fetching matches:', error);
      return jsonError(c, 'Failed to fetch matches');
    }
  })
  .post('/', async (c) => {
    try {
      const input = (await body(c)) as MatchRequestBody;
      const validation = validateMatchRequest(input);
      if (!validation.valid) return jsonError(c, validation.error!, 400);

      const created = await createMatchFromRequest(db, input);
      if ('error' in created) return jsonError(c, created.error, 400);
      const { match } = created;
      logger.debug(`Match created in "created" status: ${input.name}`);
      await logFeedEvent({
        eventType: 'match_created', priority: 3, title: 'Match Created', description: `"${input.name}" is ready for setup`,
        matchId: match.id, metadata: { gameName: match.game_name },
      });
      return c.json(matchDto(match), 201);
    } catch (error) {
      logger.error('Error creating match:', error);
      return jsonError(c, 'Failed to create match');
    }
  })

  // ── one match ─────────────────────────────────────────────────────────────
  .get('/:matchId', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      if (!validId(matchId)) return jsonError(c, 'Invalid ID', 400);
      const match = await getMatchDetail(db, matchId);
      if (!match) return jsonError(c, 'Match not found', 404);
      return c.json({
        ...match,
        maps: match.maps ?? [],
        map_codes: match.map_codes ?? {},
        map_codes_supported: Boolean(match.map_codes_supported),
        // NULL (non-tournament match) -> true
        tournament_allow_match_editing: match.tournament_allow_match_editing !== false,
        scoring_type: match.scoring_type ?? 'Normal',
        setup_components: match.setup_components ?? null,
      });
    } catch (error) {
      logger.error('Error fetching match:', error);
      return jsonError(c, 'Failed to fetch match');
    }
  })
  .put('/:matchId', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      if (!validId(matchId)) return jsonError(c, 'Invalid ID', 400);
      const existing = await getMatchEditContext(db, matchId);
      if (!existing) return jsonError(c, 'Match not found', 404);
      if (['battle', 'complete', 'cancelled'].includes(existing.status)) return jsonError(c, 'Match cannot be edited once it has started', 403);
      if (existing.tournament_allow_match_editing === false) return jsonError(c, 'Match editing is disabled for this tournament', 403);

      const b = await body(c);
      const { name, description, startDate, rules, rounds, livestreamLink, maps, statsEnabled, playerNotifications } = b;
      if (!name || typeof name !== 'string' || name.trim() === '') return jsonError(c, 'Name is required', 400);
      for (const check of [
        validateMaxLength(name, 255, 'name'), validateMaxLength(description, 1000, 'description'),
        validateMaxLength(livestreamLink, 500, 'livestreamLink'), validateEnum(rules, RULES_VALUES, 'rules'), validateNumberRange(rounds, 1, 9, 'rounds'),
      ]) {
        if (!check.valid) return jsonError(c, check.error!, 400);
      }
      const start = startDate ? new Date(startDate) : null;
      if (start && Number.isNaN(start.getTime())) return jsonError(c, 'startDate must be a valid date', 400);

      const updated = await db.transaction(async (tx) => {
        const ok = await updateMatchDetails(tx, matchId, {
          name: name.trim(), description, startDate: start, rules, rounds, livestreamLink,
          maps: Array.isArray(maps) ? maps : null, statsEnabled: !!statsEnabled, playerNotifications: playerNotifications !== false,
        });
        if (!ok) return false;
        // Queue the Discord embed update in the same transaction when an announcement message exists.
        const [announcement] = await tx.select({ id: discordMatchMessages.id }).from(discordMatchMessages)
          .where(and(eq(discordMatchMessages.match_id, matchId), eq(discordMatchMessages.message_type, 'announcement'))).limit(1);
        if (announcement) await enqueueMatchEdit(tx, matchId);
        return true;
      });
      if (!updated) return jsonError(c, 'Match not found', 404);

      const match = await getMatchWithGame(db, matchId);
      if (!match) return jsonError(c, 'Failed to retrieve updated match');
      return c.json(matchDto(match));
    } catch (error) {
      logger.error('Error updating match:', error);
      return jsonError(c, 'Failed to update match');
    }
  })
  .delete('/:matchId', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      if (!validId(matchId)) return jsonError(c, 'Invalid ID', 400);
      const existing = await getMatch(db, matchId);
      if (!existing) return jsonError(c, 'Match not found', 404);

      // Queue Discord message deletion in the same transaction as the delete (the bot reads the message rows after the
      // match is gone). Child rows cascade; voice channels are cleaned up by the scheduler when it detects orphans.
      await db.transaction(async (tx) => {
        await enqueueDeletion(tx, matchId);
        await deleteMatch(tx, matchId);
      });

      if (existing.event_image_url) {
        try {
          const response = await fetch(`${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/upload/event-image?imageUrl=${encodeURIComponent(existing.event_image_url)}`, { method: 'DELETE' });
          if (response.ok) logger.debug(`Cleaned up event image for match: ${matchId}`);
        } catch (error) {
          logger.error('Error cleaning up event image:', error);
        }
      }
      await deleteFeedEvents(matchId, ['match_scoring_required']);
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error deleting match:', error);
      return jsonError(c, 'Failed to delete match');
    }
  })

  // ── transition / teams / setup ────────────────────────────────────────────
  .post('/:matchId/transition', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      if (!validId(matchId)) return jsonError(c, 'Invalid ID', 400);
      const { newStatus, force } = await body(c);
      if (!newStatus || !MATCH_FLOW_STEPS[newStatus as keyof typeof MATCH_FLOW_STEPS] || !isKnownStatus(newStatus)) {
        return jsonError(c, 'Invalid status provided', 400);
      }
      try {
        await transitionMatch(matchId, newStatus, { force: !!force });
      } catch (error) {
        if (error instanceof MatchTransitionError) return jsonError(c, error.message, error.status);
        throw error;
      }
      const updated = await getMatchDetail(db, matchId);
      const winnerEntity = await resolveWinnerEntity(db, matchId);
      return c.json({
        ...(updated ?? {}),
        winner_entity_type: winnerEntity.type,
        maps: updated?.maps ?? [],
        map_codes: updated?.map_codes ?? {},
        map_codes_supported: Boolean(updated?.map_codes_supported),
        tournament_allow_match_editing: updated?.tournament_allow_match_editing !== false,
      });
    } catch (error) {
      logger.error('Error transitioning match status:', error);
      return jsonError(c, 'Failed to transition match status');
    }
  })
  .post('/:matchId/assign-teams', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const b = await body(c);
      if (!b.teamAssignments || !Array.isArray(b.teamAssignments)) return jsonError(c, 'Invalid team assignments data', 400);
      try {
        await assignTeams(matchId, {
          teamAssignments: b.teamAssignments,
          teamVoiceChannels: 'teamVoiceChannels' in b && Array.isArray(b.teamVoiceChannels) ? b.teamVoiceChannels : undefined,
          blueTeamVoiceChannel: 'blueTeamVoiceChannel' in b ? b.blueTeamVoiceChannel : undefined,
          redTeamVoiceChannel: 'redTeamVoiceChannel' in b ? b.redTeamVoiceChannel : undefined,
        });
      } catch (error) {
        if (error instanceof AssignTeamsError) return jsonError(c, error.message, error.status);
        throw error;
      }
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error updating team assignments:', error);
      return jsonError(c, 'Failed to update team assignments');
    }
  })
  .get('/:matchId/teams', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      if (!validId(matchId)) return jsonError(c, 'Invalid ID', 400);
      let teams = await getMatchTeams(db, matchId);
      // Safety net: a match in assign/battle with no real teams (or a Normal match missing its Reserve row) gets its
      // teams created lazily (createMatchTeams is idempotent).
      const hasActive = teams.some((t) => !t.is_reserve);
      const hasReserve = teams.some((t) => t.is_reserve);
      if (!hasActive || !hasReserve) {
        const match = await getMatch(db, matchId);
        if (match && (match.status === 'assign' || match.status === 'battle')) {
          const isNormal = (await getMatchScoringType(db, matchId)) === 'Normal';
          if (!hasActive || isNormal) {
            await createMatchTeams(db, matchId);
            teams = await getMatchTeams(db, matchId);
          }
        }
      }
      return c.json({ teams });
    } catch (error) {
      logger.error('Error fetching match teams:', error);
      return jsonError(c, 'Failed to fetch match teams');
    }
  })
  .get('/:matchId/setup', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      if (!(await matchExists(db, matchId))) return jsonError(c, 'Match not found', 404);
      return c.json({ participants: await listSetupParticipants(db, matchId) });
    } catch (error) {
      logger.error('Error fetching setup data:', error);
      return jsonError(c, 'Failed to fetch setup data');
    }
  })
  .put('/:matchId/setup', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const { gridOrder, qualifyingTimes } = (await body(c)) ?? {};
      if (gridOrder === undefined && qualifyingTimes === undefined) return jsonError(c, 'Nothing to save', 400);
      const match = await getMatch(db, matchId);
      if (!match) return jsonError(c, 'Match not found', 404);
      if (match.status !== 'gather' && match.status !== 'assign') {
        return jsonError(c, `Setup can only be changed while the match is in gather or assign (current: ${match.status})`, 409);
      }
      const valid = await listParticipantIds(db, matchId);
      if (gridOrder !== undefined) {
        if (!Array.isArray(gridOrder) || gridOrder.some((id) => typeof id !== 'string')) return jsonError(c, 'gridOrder must be an array of participant ids', 400);
        if (new Set(gridOrder).size !== gridOrder.length) return jsonError(c, 'gridOrder contains duplicate participant ids', 400);
        if (gridOrder.some((id: string) => !valid.has(id))) return jsonError(c, 'gridOrder contains participants that do not belong to this match', 400);
      }
      if (qualifyingTimes !== undefined) {
        if (qualifyingTimes === null || typeof qualifyingTimes !== 'object' || Array.isArray(qualifyingTimes)) {
          return jsonError(c, 'qualifyingTimes must be an object keyed by participant id', 400);
        }
        for (const [id, ms] of Object.entries(qualifyingTimes as Record<string, unknown>)) {
          if (!valid.has(id)) return jsonError(c, 'qualifyingTimes contains participants that do not belong to this match', 400);
          if (ms !== null && (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0)) return jsonError(c, 'qualifyingTimes values must be non-negative numbers or null', 400);
        }
      }
      try {
        await saveSetup(db, matchId, { gridOrder, qualifyingTimes });
      } catch (error) {
        if (error instanceof SetupStatusError) return jsonError(c, error.message, 409);
        throw error;
      }
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error saving setup data:', error);
      return jsonError(c, 'Failed to save setup data');
    }
  })

  // ── participants / reminders ──────────────────────────────────────────────
  .get('/:matchId/participants', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const match = await getMatch(db, matchId);
      if (!match) return jsonError(c, 'Match not found', 404);
      const participants = await listParticipantDtos(db, matchId);

      let signupConfig = null;
      try {
        if (/^[a-z0-9_-]+$/i.test(match.game_id)) { // prevent path traversal
          const signupPath = path.join(process.cwd(), 'data', 'games', match.game_id, 'signup.json');
          if (await access(signupPath).then(() => true).catch(() => false)) signupConfig = JSON.parse(await readFile(signupPath, 'utf8'));
        }
      } catch {
        logger.debug('No signup form config found for game:', match.game_id);
      }
      return c.json({ participants, signupConfig });
    } catch (error) {
      logger.error('Error fetching match participants:', error);
      return jsonError(c, 'Failed to fetch participants');
    }
  })
  .get('/:matchId/reminders', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const match = await getMatch(db, matchId);
      if (!match) return jsonError(c, 'Match not found', 404);
      let reminders: Awaited<ReturnType<typeof processMatchAnnouncements>> = [];
      if (match.start_date && match.announcements) {
        try {
          reminders = await processMatchAnnouncements(db, matchId, match.announcements, match.start_date.toISOString(), new Date().toISOString());
        } catch (parseError) {
          logger.error('Error parsing match announcements:', parseError);
        }
      }
      reminders.sort((a, b) => new Date(b.reminder_time).getTime() - new Date(a.reminder_time).getTime()); // newest first
      return c.json({
        match: { id: match.id, name: match.name, start_date: match.start_date, player_notifications: Boolean(match.player_notifications), status: match.status },
        reminders,
        reminderCount: reminders.length,
      });
    } catch (error) {
      logger.error('Error fetching match reminders:', error);
      return jsonError(c, 'Failed to fetch match reminders');
    }
  })

  // ── maps ──────────────────────────────────────────────────────────────────
  .post('/:matchId/map-codes', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const { mapCodes } = await body(c);
      if (!mapCodes || typeof mapCodes !== 'object') return jsonError(c, 'Invalid map codes data', 400);
      for (const [mapId, code] of Object.entries(mapCodes)) {
        if (typeof code !== 'string' || [...code].length > 24) return jsonError(c, `Map code for ${mapId} must be a string with max 24 characters`, 400);
      }
      if (!(await setMapCodes(db, matchId, mapCodes as Record<string, string>))) return jsonError(c, 'Match not found', 404);
      return c.json({ success: true, mapCodes });
    } catch (error) {
      logger.error('Error saving map codes:', error);
      return jsonError(c, 'Failed to save map codes');
    }
  })
  .get('/:matchId/map-codes', async (c) => {
    try {
      const mapCodes = await getMapCodes(db, c.req.param('matchId'));
      if (!mapCodes) return jsonError(c, 'Match not found', 404);
      return c.json({ mapCodes });
    } catch (error) {
      logger.error('Error retrieving map codes:', error);
      return jsonError(c, 'Failed to retrieve map codes');
    }
  })
  .post('/:matchId/map-notes', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const { mapId, note } = await body(c);
      if (!mapId) return jsonError(c, 'Map ID is required', 400);
      if (note !== undefined && note !== null && typeof note === 'string' && note.length > 64) return jsonError(c, 'note must be 64 characters or fewer', 400);
      if (!(await matchExists(db, matchId))) return jsonError(c, 'Match not found', 404);
      await saveMapNote(db, matchId, mapId, note || '');
      return c.json({ success: true, note });
    } catch (error) {
      logger.error('Error saving map note:', error);
      return jsonError(c, 'Failed to save map note');
    }
  })
  .get('/:matchId/map-notes', async (c) => {
    try {
      return c.json({ notes: await getMapNotes(db, c.req.param('matchId')) });
    } catch (error) {
      logger.error('Error fetching map notes:', error);
      return jsonError(c, 'Failed to fetch map notes');
    }
  })

  // ── games / results / scores ──────────────────────────────────────────────
  .get('/:matchId/games', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      let games = await getMatchGames(db, matchId);
      if (games.length === 0) {
        // No games yet: try to initialise them automatically (never fails the request).
        try {
          await initializeMatchGames(db, matchId);
          games = await getMatchGames(db, matchId);
        } catch (initError) {
          logger.warning(`Could not initialize match games for ${matchId}:`, initError);
        }
      }
      return c.json({ success: true, games });
    } catch (error) {
      logger.error('Error getting match games:', error);
      return jsonError(c, error instanceof Error ? error.message : 'Failed to get match games');
    }
  })
  .get('/:matchId/games-with-results', async (c) => {
    try {
      return c.json({ games: await getMatchGamesWithResults(db, c.req.param('matchId')) });
    } catch (error) {
      logger.error('Error fetching match games with results:', error);
      return jsonError(c, 'Failed to fetch match games with results');
    }
  })
  .get('/:matchId/overall-score', async (c) => {
    try {
      return c.json(await getOverallMatchScore(db, c.req.param('matchId')));
    } catch (error) {
      logger.error('Error fetching overall match score:', error);
      return jsonError(c, 'Failed to fetch overall match score');
    }
  })
  .get('/:matchId/games/:gameId/result', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const gameId = c.req.param('gameId');
      if (!(await getMatchGameInMatch(db, matchId, gameId))) return jsonError(c, 'Game not found for this match', 404);
      // Typed GameResult from the placements; the MatchResult shape is the fallback for legacy callers.
      const typed = await getGameResult(db, gameId);
      if (typed) return c.json(typed);
      const result = await getMatchResult(db, gameId);
      if (!result) return jsonError(c, 'No result found for this game', 404);
      return c.json(result);
    } catch (error) {
      logger.error('Error getting match result:', error);
      return jsonError(c, error instanceof Error ? error.message : 'Failed to get match result');
    }
  })
  .post('/:matchId/games/:gameId/result', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const gameId = c.req.param('gameId');
      let b: Record<string, unknown>;
      try {
        b = await c.req.json();
      } catch {
        return jsonError(c, 'Invalid JSON body', 400);
      }
      if (!b || typeof b !== 'object' || Array.isArray(b)) return jsonError(c, 'Request body must be a JSON object', 400);
      // Cheap body-vs-route ID checks first (before any DB access).
      if (b.matchId !== undefined && b.matchId !== matchId) return jsonError(c, 'Match ID mismatch', 400);
      if (b.gameId !== undefined && b.gameId !== gameId) return jsonError(c, 'Game ID mismatch', 400);
      const message = await submitGameResult(matchId, gameId, b as never);
      return c.json({ success: true, message });
    } catch (error) {
      if (error instanceof ResultError) return jsonError(c, error.message, error.status);
      if (error instanceof GameAlreadyScoredError) {
        return jsonError(c, 'This map was scored by someone else just now; pass rescore: true to correct its result', 409);
      }
      logger.error('Error saving match result:', error);
      return jsonError(c, error instanceof Error ? error.message : 'Failed to save match result');
    }
  })
  .get('/:matchId/games/:gameId/suggested-positions', async (c) => {
    try {
      const matchId = c.req.param('matchId');
      const gameId = c.req.param('gameId');
      if (!(await getMatchGameInMatch(db, matchId, gameId))) return jsonError(c, 'Game not found for this match', 404);
      return c.json({ suggestions: await getSuggestedPositions(db, matchId, gameId) });
    } catch (error) {
      logger.error('Error getting suggested positions:', error);
      return jsonError(c, error instanceof Error ? error.message : 'Failed to get suggested positions');
    }
  });

