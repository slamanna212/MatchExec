/**
 * `/api/matches/:matchId/scorecard/**` (screenshot submissions, review, player assignment, retry) and
 * `/api/matches/:matchId/stats/**` (aggregated stats). Mounted from app.ts next to the matches router.
 *
 * Everything that reads-then-writes per match (assign / review / aggregate) runs in one transaction under the match row
 * lock (`lockMatch`), so two concurrent requests for the same match are serialised and queue rows commit with the change.
 */
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import { BlobTooLargeError, UPLOADS_PREFIX, deleteBlob, putBlob } from '../../../lib/storage';
import { logger } from '@/lib/logger';
import { enqueueStatsImage, enqueueStatsProcessing, enqueueStatsReport, findStatsProcessingBySubmission, requeueJob } from '@/lib/discord-queues';
import { removeFeedEvents } from '@/lib/feed-helpers';
import { bestEffort, getMatchGameInMatch, lockMatch, releaseHeldScoreNotification } from '@/lib/matches';
import {
  aggregateMatchStats, assignPlayerStats, countUnassignedForMatch, countUnfinalizedSubmissions, createSubmission, deleteSubmission,
  getSubmission, getSubmissionWithStats, listMatchPlayerStats, listPerMapStats, listSubmissionsWithStats, resetFailedSubmission,
  setReviewStatus,
} from '@/lib/stats';
import { extensionForMime, isAllowedImageType, isValidImageBuffer, uniqueFileStem } from '@/lib/uploads';
import { jsonError } from '../http';

const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

export const scorecards = new Hono()
  .post('/', async (c) => {
    try {
      const matchId = c.req.param('matchId') as string;
      const form = await c.req.formData();
      const file = form.get('screenshot');
      const matchGameId = form.get('matchGameId');
      const teamSide = form.get('teamSide');

      if (!file || typeof file === 'string') return jsonError(c, 'No screenshot file provided', 400);
      if (!matchGameId || typeof matchGameId !== 'string') return jsonError(c, 'matchGameId is required', 400);
      if (teamSide !== 'blue' && teamSide !== 'red') return jsonError(c, 'teamSide must be blue or red', 400);
      if (!isAllowedImageType(file.type)) return jsonError(c, 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.', 400);
      if (file.size > SCREENSHOT_MAX_BYTES) return jsonError(c, 'File too large. Maximum size is 10MB.', 400);

      const buffer = Buffer.from(await file.arrayBuffer());
      if (!isValidImageBuffer(buffer)) return jsonError(c, 'Invalid image file. File content does not match image format.', 400);

      if (!(await getMatchGameInMatch(db, matchId, matchGameId))) return jsonError(c, 'Match game not found', 404);

      const filename = `${uniqueFileStem()}${extensionForMime(file.type)}`;
      const screenshotUrl = `${UPLOADS_PREFIX}scorecards/${matchId}/${filename}`;
      const submissionId = crypto.randomUUID();

      // The screenshot, the submission and the extraction job commit together
      await db.transaction(async (tx) => {
        await putBlob(tx, { path: screenshotUrl, kind: 'scorecard', contentType: file.type, data: buffer, filename, owner: { type: 'match', id: matchId } });
        await createSubmission(tx, { id: submissionId, matchId, matchGameId, teamSide, screenshotUrl });
        await enqueueStatsProcessing(tx, { submissionId, matchId, matchGameId });
      });

      return c.json({ success: true, submissionId, screenshotUrl });
    } catch (error) {
      if (error instanceof BlobTooLargeError) return jsonError(c, error.message, 400);
      logger.error('Error uploading scorecard:', error);
      return jsonError(c, 'Failed to upload scorecard');
    }
  })

  .get('/', async (c) => {
    try {
      return c.json(await listSubmissionsWithStats(db, c.req.param('matchId') as string, c.req.query('matchGameId') || undefined));
    } catch (error) {
      logger.error('Error fetching scorecard submissions:', error);
      return jsonError(c, 'Failed to fetch submissions');
    }
  })

  .get('/:submissionId', async (c) => {
    try {
      const submission = await getSubmissionWithStats(db, c.req.param('matchId') as string, c.req.param('submissionId'));
      return submission ? c.json(submission) : jsonError(c, 'Submission not found', 404);
    } catch (error) {
      logger.error('Error fetching submission:', error);
      return jsonError(c, 'Failed to fetch submission');
    }
  })

  .delete('/:submissionId', async (c) => {
    try {
      const matchId = c.req.param('matchId') as string;
      const submissionId = c.req.param('submissionId');
      const found = await db.transaction(async (tx) => {
        if (!(await getSubmission(tx, matchId, submissionId))) return false;
        const deleted = await deleteSubmission(tx, submissionId);
        if (deleted) await deleteBlob(tx, deleted.screenshot_url);
        return true;
      });
      return found ? c.json({ success: true }) : jsonError(c, 'Submission not found', 404);
    } catch (error) {
      logger.error('Error deleting submission:', error);
      return jsonError(c, 'Failed to delete submission');
    }
  })

  .put('/:submissionId/assign', async (c) => {
    try {
      const matchId = c.req.param('matchId') as string;
      const submissionId = c.req.param('submissionId');
      const { assignments } = (await c.req.json()) as { assignments: Array<{ playerStatId: string; participantId: string }> };
      if (!Array.isArray(assignments) || assignments.length === 0) return jsonError(c, 'assignments array is required', 400);

      const result = await db.transaction(async (tx) => {
        await lockMatch(tx, matchId);
        const submission = await getSubmission(tx, matchId, submissionId);
        if (!submission) return null;

        await assignPlayerStats(tx, submissionId, assignments);

        // Clear the "players need matching" action item once nothing is unassigned across the match's submissions
        // (counted under the match lock, so two concurrent assignments cannot both see leftovers)
        if ((await countUnassignedForMatch(tx, matchId)) === 0) {
          await bestEffort(tx, 'Error clearing scorecard player matching feed event',
            (sp) => removeFeedEvents(sp, matchId, ['scorecard_player_matching_required']), undefined);
        }

        // Stats-enabled matches hold the Discord map notification until the scorecard players are matched
        const released = await bestEffort(tx, 'Error triggering held Discord notification after stats assignment',
          (sp) => releaseHeldScoreNotification(sp, submission.match_game_id), false);
        return { released, matchGameId: submission.match_game_id };
      });

      if (!result) return jsonError(c, 'Submission not found', 404);
      if (result.released) logger.info(`Queued held Discord notification for stats-enabled map: ${result.matchGameId}`);
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error assigning participants:', error);
      return jsonError(c, 'Failed to assign participants');
    }
  })

  .put('/:submissionId/review', async (c) => {
    try {
      const matchId = c.req.param('matchId') as string;
      const submissionId = c.req.param('submissionId');
      const { status } = (await c.req.json()) as { status: 'approved' | 'rejected' };
      if (!status || !['approved', 'rejected'].includes(status)) return jsonError(c, 'status must be approved or rejected', 400);

      const found = await db.transaction(async (tx) => {
        const match = await lockMatch(tx, matchId);
        if (!match || !(await getSubmission(tx, matchId, submissionId))) return false;

        await setReviewStatus(tx, submissionId, status);
        // Aggregate under the match lock: a concurrent review sees this one's committed status
        if (status === 'approved') await aggregateMatchStats(tx, matchId);

        // Stats report DMs go out once the match is complete and every submission is finalized
        if (match.status === 'complete' && (await countUnfinalizedSubmissions(tx, matchId)) === 0) {
          await bestEffort(tx, 'Error queuing stats report DM after review', (sp) => enqueueStatsReport(sp, matchId), null);
        }
        return true;
      });

      return found ? c.json({ success: true }) : jsonError(c, 'Submission not found', 404);
    } catch (error) {
      logger.error('Error reviewing submission:', error);
      return jsonError(c, 'Failed to review submission');
    }
  })

  .post('/:submissionId/retry', async (c) => {
    try {
      const matchId = c.req.param('matchId') as string;
      const submissionId = c.req.param('submissionId');

      const outcome = await db.transaction(async (tx) => {
        const submission = await getSubmission(tx, matchId, submissionId);
        if (!submission) return 'missing' as const;
        // Compare-and-set failed -> pending: a double click re-queues once
        if (submission.ai_extraction_status !== 'failed' || !(await resetFailedSubmission(tx, submissionId))) return 'not-failed' as const;

        const existing = await findStatsProcessingBySubmission(tx, submissionId);
        if (existing) await requeueJob(tx, 'statsProcessing', existing.id);
        else await enqueueStatsProcessing(tx, { submissionId, matchId, matchGameId: submission.match_game_id });
        return 'ok' as const;
      });

      if (outcome === 'missing') return jsonError(c, 'Submission not found', 404);
      if (outcome === 'not-failed') return jsonError(c, 'Only failed submissions can be retried', 400);
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error retrying submission:', error);
      return jsonError(c, 'Failed to retry submission');
    }
  });

export const matchStats = new Hono()
  .get('/', async (c) => {
    try {
      return c.json(await listMatchPlayerStats(db, c.req.param('matchId') as string));
    } catch (error) {
      logger.error('Error fetching match stats:', error);
      return jsonError(c, 'Failed to fetch match stats');
    }
  })

  .post('/', async (c) => {
    try {
      const matchId = c.req.param('matchId') as string;
      const count = await db.transaction(async (tx) => {
        await lockMatch(tx, matchId);
        return aggregateMatchStats(tx, matchId);
      });
      return count === 0 ? c.json({ message: 'No approved stats to aggregate' }) : c.json({ success: true, participantsAggregated: count });
    } catch (error) {
      logger.error('Error aggregating match stats:', error);
      return jsonError(c, 'Failed to aggregate match stats');
    }
  })

  .get('/per-map', async (c) => {
    try {
      return c.json(await listPerMapStats(db, c.req.param('matchId') as string));
    } catch (error) {
      logger.error('Error fetching per-map stats:', error);
      return jsonError(c, 'Failed to fetch per-map stats');
    }
  })

  .post('/generate-images', async (c) => {
    try {
      const queueId = await enqueueStatsImage(db, c.req.param('matchId') as string);
      return c.json({ success: true, queueId });
    } catch (error) {
      logger.error('Error queuing image generation:', error);
      return jsonError(c, 'Failed to queue image generation');
    }
  });
