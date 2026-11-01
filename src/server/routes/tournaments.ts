/** `/api/tournaments/**` (tournaments, teams, participants, bracket generation / progression, standings). Thin handlers over `src/lib/tournaments`. */
import { Hono, type Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { tournamentTeams } from '../../../lib/db/schema';
import type { PositionScoringConfig } from '../../../lib/db/schema/types';
import { logger } from '@/lib/logger';
import { enqueueDeletion } from '@/lib/discord-queues';
import { MATCH_ACTION_EVENTS, logFeedEvent, removeFeedEvents } from '@/lib/feed-helpers';
import { getMode, getModeScoringType } from '@/lib/games';
import { validateEnum, validateMaxLength, validateNumberRange, validatePositionScoringOverrideJson } from '@/lib/utils/validation';
import {
  TournamentError, assignTeamMembers, createTeam, createTournament, deleteTeam, deleteTournament, generateTournamentMatches, getBracketStandings,
  getCumulativeStandings, getLeaderboardBreakdown, getTournament, getTournamentDetail, getTournamentEventImage, getTournamentWithGame,
  hasActiveMatches, listBracketMatches, listParticipants, listTeamsWithMembers, listTournamentMatchesIds, listTournaments, lockTournament,
  progressTournament, transitionTournament, updateTournamentDetails, type BracketAssignment, type CreateTournamentInput, type TeamAssignmentInput,
  type UpdateTournamentInput,
} from '@/lib/tournaments';
import { deleteBlob, deleteBlobsFor } from '../../../lib/storage';
import { jsonError } from '../http';

const RULESET_VALUES = ['casual', 'competitive'] as const;
const FORMATS = ['single-elimination', 'double-elimination', 'cumulative-points'] as const;

function validId(id: string | undefined): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

/** Run a handler; domain errors keep their status, malformed JSON is a 400, everything else is logged and answered with `failure`. */
async function guard(c: Context, label: string, failure: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TournamentError) return jsonError(c, error.message, error.status);
    if (error instanceof SyntaxError) return jsonError(c, 'Invalid JSON body', 400);
    logger.error(`${label}:`, error);
    return jsonError(c, failure);
  }
}

/** `positionScoringOverride` arrives as a JSON string (old contract) or an object. */
function overrideToString(raw: unknown): unknown {
  return raw !== null && typeof raw === 'object' ? JSON.stringify(raw) : raw;
}
function parseOverride(raw: unknown): PositionScoringConfig | null {
  const s = overrideToString(raw);
  return typeof s === 'string' && s !== '' ? (JSON.parse(s) as PositionScoringConfig) : null;
}

function parseDate(value: unknown, field: string): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) throw new TournamentError(`${field} must be a valid date`, 400);
  return d;
}

interface TournamentBody {
  name: string;
  description?: string;
  gameId: string;
  gameModeId: string;
  format: string;
  startDate?: string;
  startTime?: string;
  roundsPerMatch: number;
  ruleset?: string;
  maxParticipants?: number;
  eventImageUrl?: string;
  allowPlayerTeamSelection?: boolean;
  allowMatchEditing?: boolean;
  statsEnabled?: boolean;
  announcements?: CreateTournamentInput['announcements'];
  playerNotifications?: boolean;
  livestreamLink?: string;
  positionScoringOverride?: unknown;
}

function validateTournamentBody(body: Partial<TournamentBody>): string | null {
  if (!body.name || !body.gameId || !body.gameModeId || !body.format || !body.roundsPerMatch) {
    return 'Missing required fields: name, gameId, gameModeId, format, and roundsPerMatch';
  }
  if (!(FORMATS as readonly string[]).includes(body.format)) {
    return 'Invalid format. Must be single-elimination, double-elimination, or cumulative-points';
  }
  for (const check of [
    validateMaxLength(body.name, 255, 'name'),
    validateMaxLength(body.description, 1000, 'description'),
    validateEnum(body.ruleset, RULESET_VALUES, 'ruleset'),
    validateNumberRange(body.roundsPerMatch, 1, 9, 'roundsPerMatch'),
    validateNumberRange(body.maxParticipants, 4, 256, 'maxParticipants'),
  ]) {
    if (!check.valid) return check.error ?? 'Invalid request';
  }
  return validatePositionScoringOverrideJson(overrideToString(body.positionScoringOverride));
}

async function validateGameModeId(gameId: string, gameModeId: string): Promise<string | null> {
  if (gameId === 'overwatch2' && gameModeId.startsWith('ow2-')) {
    return gameModeId === 'ow2-5v5' || gameModeId === 'ow2-6v6' ? null : 'Invalid Overwatch 2 team size option';
  }
  const mode = await getMode(db, gameId, gameModeId);
  return mode ? null : 'Invalid game mode ID or game mode does not belong to the selected game';
}

/**
 * Cross-check the chosen format against the mode's scoring_type: bracket formats only make sense for Normal (team vs
 * team) modes; FFA/Position modes only support cumulative-points.
 */
async function validateFormatMatchesScoringType(gameId: string, gameModeId: string, format: string): Promise<string | null> {
  const scoringType = gameId === 'overwatch2' && gameModeId.startsWith('ow2-') ? 'Normal' : ((await getModeScoringType(db, gameId, gameModeId)) ?? 'Normal');
  const isBracketFormat = format === 'single-elimination' || format === 'double-elimination';
  if (scoringType === 'Normal' && !isBracketFormat) return 'Normal (team vs team) modes require single-elimination or double-elimination format';
  if (scoringType !== 'Normal' && isBracketFormat) return `${scoringType} modes don't support brackets — use cumulative-points format`;
  return null;
}

export const tournaments = new Hono()
  // ── list / create ─────────────────────────────────────────────────────────
  .get('/', (c) => guard(c, 'Error fetching tournaments', 'Failed to fetch tournaments', async () => {
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : null;
    const offset = Number.parseInt(c.req.query('offset') ?? '0', 10) || 0;
    const rows = await listTournaments(db, { status: c.req.query('status'), limit: Number.isNaN(limit) ? null : limit, offset });

    // ETag for efficient polling; series membership doesn't touch tournaments.updated_at, so fold it in.
    const maxUpdatedAt = rows.reduce((max, t) => Math.max(max, t.updated_at.getTime()), 0);
    const seriesLinks = rows.reduce((sum, t) => sum + t.series.length, 0);
    const etag = `"${rows.length}:${maxUpdatedAt}:${seriesLinks}"`;
    if (limit === null && c.req.header('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
    c.header('ETag', etag);
    return c.json(rows);
  }))
  .post('/', (c) => guard(c, 'Error creating tournament', 'Failed to create tournament', async () => {
    const body = (await c.req.json()) as TournamentBody;
    const validationError = validateTournamentBody(body);
    if (validationError) return jsonError(c, validationError, 400);

    const gameModeError = await validateGameModeId(body.gameId, body.gameModeId);
    if (gameModeError) return jsonError(c, gameModeError, 400);
    const formatError = await validateFormatMatchesScoringType(body.gameId, body.gameModeId, body.format);
    if (formatError) return jsonError(c, formatError, 400);

    const created = await createTournament(db, {
      name: body.name,
      description: body.description,
      gameId: body.gameId,
      gameModeId: body.gameModeId,
      format: body.format as CreateTournamentInput['format'],
      roundsPerMatch: Number(body.roundsPerMatch),
      ruleset: body.ruleset,
      maxParticipants: body.maxParticipants ? Number(body.maxParticipants) : null,
      startDate: parseDate(body.startDate, 'startDate'),
      startTime: parseDate(body.startTime, 'startTime'),
      eventImageUrl: body.eventImageUrl,
      allowPlayerTeamSelection: body.allowPlayerTeamSelection,
      allowMatchEditing: body.allowMatchEditing,
      statsEnabled: body.statsEnabled,
      announcements: body.announcements,
      playerNotifications: body.playerNotifications,
      livestreamLink: body.livestreamLink,
      positionScoringOverride: parseOverride(body.positionScoringOverride),
    });
    logger.debug(`Tournament created in "created" status: ${body.name}`);
    await logFeedEvent({
      eventType: 'tournament_created', priority: 3, title: 'Tournament Created', description: `"${body.name}" is ready for setup`,
      tournamentId: created.id, metadata: { format: body.format },
    });
    return c.json(created, 201);
  }))

  // ── one tournament ────────────────────────────────────────────────────────
  .get('/:tournamentId', (c) => guard(c, 'Error fetching tournament', 'Failed to fetch tournament', async () => {
    const id = c.req.param('tournamentId');
    if (!validId(id)) return jsonError(c, 'Invalid ID', 400);
    const tournament = await getTournamentDetail(db, id);
    if (!tournament) return jsonError(c, 'Tournament not found', 404);
    const teams = await listTeamsWithMembers(db, id, { withAvatars: true });
    return c.json({ ...tournament, teams });
  }))
  .put('/:tournamentId', (c) => guard(c, 'Error updating tournament', 'Failed to update tournament', async () => {
    const id = c.req.param('tournamentId');
    if (!validId(id)) return jsonError(c, 'Invalid ID', 400);
    if (!(await getTournament(db, id))) return jsonError(c, 'Tournament not found', 404);

    const body = await c.req.json();
    for (const check of [
      validateMaxLength(body.name, 255, 'name'),
      validateMaxLength(body.description, 1000, 'description'),
      validateMaxLength(body.livestreamLink, 500, 'livestreamLink'),
    ]) {
      if (!check.valid) return jsonError(c, check.error ?? 'Invalid request', 400);
    }
    if (body.positionScoringOverride !== undefined) {
      const overrideError = validatePositionScoringOverrideJson(overrideToString(body.positionScoringOverride));
      if (overrideError) return jsonError(c, overrideError, 400);
    }

    const patch: UpdateTournamentInput = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.startDate !== undefined) patch.startDate = parseDate(body.startDate, 'startDate');
    if (body.startTime !== undefined) patch.startTime = parseDate(body.startTime, 'startTime');
    if (body.eventImageUrl !== undefined) patch.eventImageUrl = body.eventImageUrl;
    if (body.livestreamLink !== undefined) patch.livestreamLink = body.livestreamLink;
    if (body.announcements !== undefined) patch.announcements = body.announcements;
    if (body.playerNotifications !== undefined) patch.playerNotifications = body.playerNotifications !== false;
    if (body.allowMatchEditing !== undefined) patch.allowMatchEditing = body.allowMatchEditing !== false;
    if (body.positionScoringOverride !== undefined) patch.positionScoringOverride = parseOverride(body.positionScoringOverride);
    if (Object.keys(patch).length === 0) return jsonError(c, 'No valid fields to update', 400);

    if (!(await updateTournamentDetails(db, id, patch))) return jsonError(c, 'Tournament not found', 404);
    return c.json(await getTournamentWithGame(db, id));
  }))
  .delete('/:tournamentId', (c) => guard(c, 'Error deleting tournament', 'Failed to delete tournament', async () => {
    const id = c.req.param('tournamentId');
    if (!validId(id)) return jsonError(c, 'Invalid ID', 400);
    const existing = await getTournamentEventImage(db, id);
    if (!existing) return jsonError(c, 'Tournament not found', 404);

    // One transaction: Discord message deletions are queued together with the delete (the bot reads the message rows
    // after the rows are gone). Everything below the tournament cascades.
    await db.transaction(async (tx) => {
      if (!(await lockTournament(tx, id))) throw new TournamentError('Tournament not found', 404);
      if (await hasActiveMatches(tx, id)) throw new TournamentError('Cannot delete tournament with active matches', 400);
      const matchIds = await listTournamentMatchesIds(tx, id);
      for (const matchId of matchIds) {
        await enqueueDeletion(tx, matchId);
        await removeFeedEvents(tx, matchId, MATCH_ACTION_EVENTS); // before the cascade clears the feed's match_id
      }
      await enqueueDeletion(tx, id);
      await deleteTournament(tx, id);
      // Uploaded files go with it: the tournament's matches' scorecard / stat images and the event image
      for (const matchId of matchIds) await deleteBlobsFor(tx, { type: 'match', id: matchId });
      if (existing.event_image_url) await deleteBlob(tx, existing.event_image_url);
    });

    logger.debug(`Tournament deleted: ${id}`);
    return c.json({ success: true });
  }))

  // ── transition / bracket ──────────────────────────────────────────────────
  .post('/:tournamentId/transition', (c) => guard(c, 'Error transitioning tournament status', 'Failed to transition tournament status', async () => {
    const id = c.req.param('tournamentId');
    if (!validId(id)) return jsonError(c, 'Invalid ID', 400);
    const { newStatus } = await c.req.json();
    return c.json(await transitionTournament(db, id, newStatus));
  }))
  .post('/:tournamentId/bracket-assignments', (c) => guard(c, 'Error saving bracket assignments', 'Failed to save bracket assignments', async () => {
    const id = c.req.param('tournamentId');
    const { assignments }: { assignments: BracketAssignment[] } = await c.req.json();
    if (!assignments || !Array.isArray(assignments)) return jsonError(c, 'Invalid assignments data', 400);

    const tournament = await getTournament(db, id);
    if (!tournament || tournament.status !== 'assign') return jsonError(c, 'Tournament not found or not in assignment phase', 404);

    // The assignments themselves are applied by generate-matches; this validates the teams.
    for (const assignment of assignments) {
      const [team] = await db.select({ id: tournamentTeams.id }).from(tournamentTeams)
        .where(and(eq(tournamentTeams.id, String(assignment.teamId)), eq(tournamentTeams.tournament_id, id)));
      if (!team) return jsonError(c, `Team ${assignment.teamId} not found in tournament`, 400);
    }
    return c.json({ message: 'Bracket assignments saved successfully', assignments });
  }))
  .post('/:tournamentId/generate-matches', (c) => guard(c, 'Error generating tournament matches', 'Failed to generate tournament matches', async () => {
    const id = c.req.param('tournamentId');
    const body = await c.req.json().catch(() => ({}));
    return c.json(await generateTournamentMatches(db, id, body?.assignments));
  }))
  .post('/:tournamentId/progress', (c) => guard(c, 'Error progressing tournament', 'Failed to progress tournament', async () => {
    return c.json(await progressTournament(db, c.req.param('tournamentId')));
  }))
  .get('/:tournamentId/matches', (c) => guard(c, 'Error fetching tournament matches', 'Failed to fetch tournament matches', async () => {
    const list = await listBracketMatches(db, c.req.param('tournamentId'));
    return c.json({ matches: list, count: list.length });
  }))
  .get('/:tournamentId/standings', (c) => guard(c, 'Error fetching tournament standings', 'Failed to fetch tournament standings', async () => {
    const id = c.req.param('tournamentId');
    const tournament = await getTournament(db, id);
    if (!tournament) return jsonError(c, 'Tournament not found', 404);
    if (tournament.format === 'cumulative-points') return c.json({ standings: await getCumulativeStandings(db, id) });
    return c.json({ standings: await getBracketStandings(db, id) });
  }))
  .get('/:tournamentId/leaderboard', (c) => guard(c, 'Error fetching tournament leaderboard', 'Failed to fetch tournament leaderboard', async () => {
    const id = c.req.param('tournamentId');
    const tournament = await getTournament(db, id);
    if (!tournament) return jsonError(c, 'Tournament not found', 404);
    if (tournament.format !== 'cumulative-points') return jsonError(c, 'Leaderboard is only available for cumulative-points tournaments', 400);

    const leaderboard = (await getCumulativeStandings(db, id)).map((r) => ({
      rank: r.rank, participant_id: r.participant_id, player_key: r.player_key, username: r.username,
      total_points: r.total_points, matches_played: r.matches_played,
    }));
    return c.json({ tournament_id: id, tournament_name: tournament.name, leaderboard, match_breakdown: await getLeaderboardBreakdown(db, id) });
  }))

  // ── teams / participants ──────────────────────────────────────────────────
  .get('/:tournamentId/participants', (c) => guard(c, 'Error fetching tournament participants', 'Failed to fetch tournament participants', async () => {
    const id = c.req.param('tournamentId');
    const participants = (await listParticipants(db, id)).map((p) => ({
      id: p.id, user_id: p.user_id, discord_user_id: p.discord_user_id, username: p.username, joined_at: p.joined_at,
      team_assignment: p.team_assignment, signup_data: p.signup_data ?? null,
    }));
    // TODO(Stage 3): signup form configs were never stored in Postgres (no `signup_configs` table); the old route fell through to null as well.
    return c.json({ participants, signupConfig: null });
  }))
  .get('/:tournamentId/teams', (c) => guard(c, 'Error fetching tournament teams', 'Failed to fetch teams', async () => {
    const id = c.req.param('tournamentId');
    if (!(await getTournament(db, id))) return jsonError(c, 'Tournament not found', 404);
    return c.json(await listTeamsWithMembers(db, id));
  }))
  .post('/:tournamentId/teams', (c) => guard(c, 'Error creating team', 'Failed to create team', async () => {
    const id = c.req.param('tournamentId');
    const { teamName } = await c.req.json();
    if (typeof teamName !== 'string' || teamName.trim().length === 0) return jsonError(c, 'Team name is required', 400);
    if (teamName.length > 100) return jsonError(c, 'teamName must be 100 characters or fewer', 400);
    const team = await createTeam(db, id, teamName.trim());
    return c.json({ ...team, members: [] }, 201);
  }))
  .put('/:tournamentId/teams', (c) => guard(c, 'Error updating team assignments', 'Failed to update team assignments', async () => {
    const id = c.req.param('tournamentId');
    const { teams } = await c.req.json();
    if (!teams || !Array.isArray(teams)) return jsonError(c, 'Invalid team assignments data', 400);
    await assignTeamMembers(db, id, teams as TeamAssignmentInput[]);
    return c.json({ success: true });
  }))
  .delete('/:tournamentId/teams', (c) => guard(c, 'Error deleting team', 'Failed to delete team', async () => {
    const teamId = c.req.query('teamId');
    if (!teamId) return jsonError(c, 'Team ID is required', 400);
    await deleteTeam(db, c.req.param('tournamentId'), teamId);
    return c.json({ success: true });
  }));
