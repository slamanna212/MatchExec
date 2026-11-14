/**
 * `/api/series/:id/entrants|stages` and `/api/series/players/search`: entrants, rosters, copying from a previous season,
 * CSV import, stages and the player search used by the roster editor. Thin handlers over `src/lib/series`.
 * Mounted from `series.ts` BEFORE the `/:seriesId` routes.
 */
import { Hono, type Context } from 'hono';
import { db } from '../../../lib/db';
import {
  ENTRANT_IMPORT_MAX_CHARS, SeriesError, addEntrantMember, copyEntrants, createEntrant, createStage, deleteEntrant, deleteStage, getEntrant, getSeriesById,
  getStage, importEntrants, listEntrants, previewEntrantImport, listStages, removeEntrantMember, searchPlayers, updateEntrant, updateEntrantMember, updateStage,
  validateEntrantBody, validateMemberBody, validateStageBody,
  type UpdateEntrantInput, type UpdateStageInput,
} from '@/lib/series';
import type { CopySeriesEntrantsInput, CreateSeriesEntrantInput, SeriesMemberRole, SeriesStageStatus } from '../../../shared/series-types';
import { DiscordBotService } from '../../../lib/discord-bot-service';
import { logger } from '@/lib/logger';
import { jsonError } from '../http';
import { guard, readJsonObject } from './series-helpers';

async function requireSeries(seriesId: string): Promise<void> {
  if (!(await getSeriesById(db, seriesId))) throw new SeriesError('Series not found', 404);
}

const str = (v: unknown): string | null | undefined => (v === undefined ? undefined : (v as string | null));

/** `{ csv: string }` body of the import routes; returns the CSV text or the error response. */
async function readCsvBody(c: Context): Promise<string | Response> {
  const body = await readJsonObject(c);
  if (!body) return jsonError(c, 'Invalid JSON body', 400);
  if (typeof body.csv !== 'string' || body.csv.trim() === '') return jsonError(c, 'csv must be a non-empty string', 400);
  if (body.csv.length > ENTRANT_IMPORT_MAX_CHARS) return jsonError(c, 'The file is too large (at most 1 MB)', 400);
  return body.csv;
}

export const seriesEntrantsRoutes = new Hono()
  // ── player search (registered before any /:seriesId route) ────────────────
  .get('/players/search', (c) => guard(c, 'Error searching players', 'Failed to search players', async () => {
    const q = c.req.query('q') ?? '';
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return jsonError(c, 'limit must be an integer between 1 and 100', 400);
    const known = await searchPlayers(db, q, limit);
    // Server members come from the bot; any failure just leaves the locally known players.
    let members: Awaited<ReturnType<DiscordBotService['searchGuildMembers']>> = [];
    if (q.trim() !== '' && c.req.query('guild') !== 'false') {
      try { members = await new DiscordBotService(db).searchGuildMembers(q.trim(), Math.min(limit, 25)); }
      catch (error) { logger.warning('Guild member search failed:', error); }
    }
    const seen = new Set(known.map((p) => p.discord_user_id ?? p.user_id));
    const guildPlayers = members
      .filter((m) => !seen.has(m.id))
      .map((m) => ({ user_id: m.id, discord_user_id: m.id, username: m.username, avatar_url: m.avatar_url }));
    const players = [...known, ...guildPlayers]
      .sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }))
      .slice(0, limit);
    return c.json({ players });
  }))

  // ── entrants ──────────────────────────────────────────────────────────────
  .get('/:seriesId/entrants', (c) => guard(c, 'Error listing entrants', 'Failed to list entrants', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    return c.json({ entrants: await listEntrants(db, seriesId, { includeLeft: c.req.query('include_left') === 'true' }) });
  }))

  // before /:seriesId/entrants/:entrantId so "copy" is never read as an entrant id
  .post('/:seriesId/entrants/copy', (c) => guard(c, 'Error copying entrants', 'Failed to copy entrants', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    if (typeof body.from_series_id !== 'string' || body.from_series_id === '') return jsonError(c, 'from_series_id is required', 400);
    if (body.entrant_ids !== undefined && (!Array.isArray(body.entrant_ids) || !body.entrant_ids.every((i) => typeof i === 'string'))) {
      return jsonError(c, 'entrant_ids must be an array of ids', 400);
    }
    if (body.include_members !== undefined && typeof body.include_members !== 'boolean') return jsonError(c, 'include_members must be a boolean', 400);
    const result = await copyEntrants(db, seriesId, body as unknown as CopySeriesEntrantsInput);
    return c.json({ entrants: result.entrants, skipped: result.skipped }, 201);
  }))

  // CSV import: body { csv }. Preview is read-only; import applies everything or nothing (400 + preview on errors).
  .post('/:seriesId/entrants/import/preview', (c) => guard(c, 'Error previewing entrant import', 'Failed to read the CSV', async () => {
    const csv = await readCsvBody(c);
    if (typeof csv !== 'string') return csv;
    return c.json({ preview: await previewEntrantImport(db, c.req.param('seriesId'), csv) });
  }))

  .post('/:seriesId/entrants/import', (c) => guard(c, 'Error importing entrants', 'Failed to import entrants', async () => {
    const csv = await readCsvBody(c);
    if (typeof csv !== 'string') return csv;
    const outcome = await importEntrants(db, c.req.param('seriesId'), csv);
    if (!outcome.ok) {
      const first = outcome.preview.issues.find((i) => i.level === 'error');
      return c.json({ error: first ? `${first.line ? `Line ${first.line}: ` : ''}${first.message}` : 'The CSV has errors', preview: outcome.preview }, 400);
    }
    return c.json({ result: outcome.result, preview: outcome.preview }, 201);
  }))

  .post('/:seriesId/entrants', (c) => guard(c, 'Error creating entrant', 'Failed to create entrant', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const err = validateEntrantBody(body, false);
    if (err) return jsonError(c, err, 400);
    const id = await createEntrant(db, seriesId, body as unknown as CreateSeriesEntrantInput);
    return c.json({ entrant: await getEntrant(db, seriesId, id) }, 201);
  }))

  .patch('/:seriesId/entrants/:entrantId', (c) => guard(c, 'Error updating entrant', 'Failed to update entrant', async () => {
    const { seriesId, entrantId } = c.req.param();
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const err = validateEntrantBody(body, true);
    if (err) return jsonError(c, err, 400);
    const updates: UpdateEntrantInput = {
      name: body.name as string | undefined, tag: str(body.tag), color: str(body.color), logo_url: str(body.logo_url),
      division: str(body.division), seed: body.seed as number | null | undefined, status: body.status as UpdateEntrantInput['status'],
    };
    if (Object.values(updates).every((v) => v === undefined)) return jsonError(c, 'Nothing to update', 400);
    return c.json({ entrant: await updateEntrant(db, seriesId, entrantId, updates) });
  }))

  .delete('/:seriesId/entrants/:entrantId', (c) => guard(c, 'Error deleting entrant', 'Failed to delete entrant', async () => {
    const { seriesId, entrantId } = c.req.param();
    await requireSeries(seriesId);
    await deleteEntrant(db, seriesId, entrantId);
    return c.json({ success: true });
  }))

  // ── members ───────────────────────────────────────────────────────────────
  .post('/:seriesId/entrants/:entrantId/members', (c) => guard(c, 'Error adding entrant member', 'Failed to add member', async () => {
    const { seriesId, entrantId } = c.req.param();
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const err = validateMemberBody(body, false);
    if (err) return jsonError(c, err, 400);
    const member = await addEntrantMember(db, seriesId, entrantId, body as unknown as NonNullable<CreateSeriesEntrantInput['members']>[number]);
    return c.json({ member }, 201);
  }))

  .patch('/:seriesId/entrants/:entrantId/members/:memberId', (c) => guard(c, 'Error updating entrant member', 'Failed to update member', async () => {
    const { seriesId, entrantId, memberId } = c.req.param();
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const err = validateMemberBody(body, true);
    if (err) return jsonError(c, err, 400);
    if (body.role === undefined && body.username === undefined) return jsonError(c, 'Nothing to update: send role and/or username', 400);
    const member = await updateEntrantMember(db, seriesId, entrantId, memberId, {
      role: body.role as SeriesMemberRole | undefined, username: body.username as string | undefined,
    });
    return c.json({ member });
  }))

  .delete('/:seriesId/entrants/:entrantId/members/:memberId', (c) => guard(c, 'Error removing entrant member', 'Failed to remove member', async () => {
    const { seriesId, entrantId, memberId } = c.req.param();
    await requireSeries(seriesId);
    await removeEntrantMember(db, seriesId, entrantId, memberId);
    return c.json({ success: true });
  }))

  // ── stages ────────────────────────────────────────────────────────────────
  .get('/:seriesId/stages', (c) => guard(c, 'Error listing stages', 'Failed to list stages', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    return c.json({ stages: await listStages(db, seriesId) });
  }))

  .post('/:seriesId/stages', (c) => guard(c, 'Error creating stage', 'Failed to create stage', async () => {
    const seriesId = c.req.param('seriesId');
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const err = validateStageBody(body, false);
    if (err) return jsonError(c, err, 400);
    const stage = await createStage(db, seriesId, {
      name: body.name as string, stage_order: body.stage_order as number | undefined,
      counts_toward_season: body.counts_toward_season as boolean | undefined,
      scoring_config: body.scoring_config as UpdateStageInput['scoring_config'], status: body.status as SeriesStageStatus | undefined,
    });
    return c.json({ stage }, 201);
  }))

  .patch('/:seriesId/stages/:stageId', (c) => guard(c, 'Error updating stage', 'Failed to update stage', async () => {
    const { seriesId, stageId } = c.req.param();
    await requireSeries(seriesId);
    const body = await readJsonObject(c);
    if (!body) return jsonError(c, 'Invalid JSON body', 400);
    const err = validateStageBody(body, true);
    if (err) return jsonError(c, err, 400);
    const updates: UpdateStageInput = {
      name: body.name as string | undefined, stage_order: body.stage_order as number | undefined,
      counts_toward_season: body.counts_toward_season as boolean | undefined,
      scoring_config: body.scoring_config as UpdateStageInput['scoring_config'], status: body.status as SeriesStageStatus | undefined,
    };
    if (Object.values(updates).every((v) => v === undefined)) return jsonError(c, 'Nothing to update', 400);
    return c.json({ stage: await updateStage(db, seriesId, stageId, updates) });
  }))

  .delete('/:seriesId/stages/:stageId', (c) => guard(c, 'Error deleting stage', 'Failed to delete stage', async () => {
    const { seriesId, stageId } = c.req.param();
    await requireSeries(seriesId);
    if (!(await getStage(db, seriesId, stageId))) return jsonError(c, 'Stage not found in this series', 404);
    await deleteStage(db, seriesId, stageId);
    return c.json({ success: true });
  }));
