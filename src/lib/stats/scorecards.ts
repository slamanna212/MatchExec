/**
 * Scorecard submissions (`scorecard_submissions`), the AI-extracted rows (`scorecard_player_stats`) and the DM prompts
 * that ask commanders for screenshots (`scorecard_dm_messages`). Used by the web routes, the bot and the stats-processor.
 *
 * Functions that need to be serialised per match (assigning players, reviewing, the "players need matching" feed event)
 * do not lock anything themselves: callers run them inside `db.transaction` after `lockMatch(tx, matchId)`.
 */
import { and, asc, count, desc, eq, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { scorecardDmMessages, scorecardPlayerStats, scorecardSubmissions } from '../../../lib/db/schema';

export type SubmissionRow = typeof scorecardSubmissions.$inferSelect;
export type PlayerStatRow = typeof scorecardPlayerStats.$inferSelect;
export type SubmissionWithStats = SubmissionRow & { playerStats: PlayerStatRow[] };
export type TeamSide = 'blue' | 'red';
export type ReviewStatus = SubmissionRow['review_status'];
export type ExtractionStatus = SubmissionRow['ai_extraction_status'];

/** Review states that count as "finished" for the stats-report trigger. */
const FINAL_REVIEW_STATUSES: ReviewStatus[] = ['approved', 'rejected', 'auto_approved'];
const APPROVED_STATUSES: ReviewStatus[] = ['approved', 'auto_approved'];

// ─── submissions ─────────────────────────────────────────────────────────────

export interface NewSubmission {
  id?: string;
  matchId: string;
  matchGameId: string;
  teamSide: TeamSide;
  screenshotUrl: string;
  submittedByParticipantId?: string | null;
  submittedByDiscordUserId?: string | null;
  discordMessageId?: string | null;
}

export async function createSubmission(ex: Executor, input: NewSubmission): Promise<SubmissionRow> {
  const [row] = await ex.insert(scorecardSubmissions).values({
    id: input.id ?? crypto.randomUUID(),
    match_id: input.matchId,
    match_game_id: input.matchGameId,
    team_side: input.teamSide,
    screenshot_url: input.screenshotUrl,
    submitted_by_participant_id: input.submittedByParticipantId ?? null,
    submitted_by_discord_user_id: input.submittedByDiscordUserId ?? null,
    discord_message_id: input.discordMessageId ?? null,
  }).returning();
  return row;
}

export async function getSubmission(ex: Executor, matchId: string, submissionId: string): Promise<SubmissionRow | undefined> {
  const [row] = await ex.select().from(scorecardSubmissions)
    .where(and(eq(scorecardSubmissions.id, submissionId), eq(scorecardSubmissions.match_id, matchId))).limit(1);
  return row;
}

export async function getSubmissionById(ex: Executor, submissionId: string): Promise<SubmissionRow | undefined> {
  const [row] = await ex.select().from(scorecardSubmissions).where(eq(scorecardSubmissions.id, submissionId)).limit(1);
  return row;
}

/** A submission created from this Discord message (a reply event can be delivered twice). */
export async function findSubmissionByDiscordMessage(ex: Executor, discordMessageId: string): Promise<SubmissionRow | undefined> {
  const [row] = await ex.select().from(scorecardSubmissions).where(eq(scorecardSubmissions.discord_message_id, discordMessageId)).limit(1);
  return row;
}

/** Player rows of a submission: by side (unknown side first, as before), then name. */
export async function listPlayerStats(ex: Executor, submissionId: string): Promise<PlayerStatRow[]> {
  return ex.select().from(scorecardPlayerStats).where(eq(scorecardPlayerStats.submission_id, submissionId))
    .orderBy(sql`${scorecardPlayerStats.team_side} asc nulls first`, asc(scorecardPlayerStats.extracted_player_name), asc(scorecardPlayerStats.id));
}

export async function getSubmissionWithStats(ex: Executor, matchId: string, submissionId: string): Promise<SubmissionWithStats | undefined> {
  const submission = await getSubmission(ex, matchId, submissionId);
  return submission ? { ...submission, playerStats: await listPlayerStats(ex, submissionId) } : undefined;
}

/** All submissions of a match (optionally one map), newest first, each with its player stats. */
export async function listSubmissionsWithStats(ex: Executor, matchId: string, matchGameId?: string): Promise<SubmissionWithStats[]> {
  const conditions = [eq(scorecardSubmissions.match_id, matchId)];
  if (matchGameId) conditions.push(eq(scorecardSubmissions.match_game_id, matchGameId));
  const submissions = await ex.select().from(scorecardSubmissions).where(and(...conditions))
    .orderBy(desc(scorecardSubmissions.created_at), desc(scorecardSubmissions.id));
  return Promise.all(submissions.map(async (s) => ({ ...s, playerStats: await listPlayerStats(ex, s.id) })));
}

/** Delete a submission; its player rows cascade. Returns the deleted row (for its screenshot path). */
export async function deleteSubmission(ex: Executor, submissionId: string): Promise<SubmissionRow | undefined> {
  const [row] = await ex.delete(scorecardSubmissions).where(eq(scorecardSubmissions.id, submissionId)).returning();
  return row;
}

export async function setReviewStatus(ex: Executor, submissionId: string, status: 'approved' | 'rejected'): Promise<void> {
  await ex.update(scorecardSubmissions).set({ review_status: status, reviewed_at: new Date() }).where(eq(scorecardSubmissions.id, submissionId));
}

/**
 * Failed -> pending, atomically (a double click re-queues once). Returns whether this call reset it.
 */
export async function resetFailedSubmission(ex: Executor, submissionId: string): Promise<boolean> {
  const rows = await ex.update(scorecardSubmissions).set({ ai_extraction_status: 'pending', ai_error_message: null })
    .where(and(eq(scorecardSubmissions.id, submissionId), eq(scorecardSubmissions.ai_extraction_status, 'failed')))
    .returning({ id: scorecardSubmissions.id });
  return rows.length > 0;
}

export async function setExtractionStatus(
  ex: Executor, submissionId: string, status: ExtractionStatus, errorMessage?: string | null,
): Promise<void> {
  await ex.update(scorecardSubmissions)
    .set({ ai_extraction_status: status, ...(errorMessage !== undefined ? { ai_error_message: errorMessage } : {}) })
    .where(eq(scorecardSubmissions.id, submissionId));
}

export async function setRawResponse(ex: Executor, submissionId: string, rawResponse: string): Promise<void> {
  await ex.update(scorecardSubmissions).set({ ai_raw_response: rawResponse }).where(eq(scorecardSubmissions.id, submissionId));
}

/** Append a `{ message, ts }` entry to the submission's processing log (atomic JSONB append). */
export async function appendProcessingLog(ex: Executor, submissionId: string, message: string): Promise<void> {
  const entry = JSON.stringify({ message, ts: new Date().toISOString() });
  await ex.update(scorecardSubmissions)
    .set({ ai_processing_log: sql`coalesce(${scorecardSubmissions.ai_processing_log}, '[]'::jsonb) || jsonb_build_array(${entry}::jsonb)` })
    .where(eq(scorecardSubmissions.id, submissionId));
}

export async function setSuggestedPositions(ex: Executor, submissionId: string, positions: Record<string, number>): Promise<void> {
  await ex.update(scorecardSubmissions).set({ suggested_positions: positions }).where(eq(scorecardSubmissions.id, submissionId));
}

// ─── queries used by the matches domain ──────────────────────────────────────

/** Whether any scorecard exists for this map. */
export async function hasSubmissionForGame(ex: Executor, matchGameId: string): Promise<boolean> {
  const [row] = await ex.select({ id: scorecardSubmissions.id }).from(scorecardSubmissions)
    .where(eq(scorecardSubmissions.match_game_id, matchGameId)).limit(1);
  return !!row;
}

export async function countApprovedSubmissions(ex: Executor, matchId: string): Promise<number> {
  const [row] = await ex.select({ cnt: count() }).from(scorecardSubmissions)
    .where(and(eq(scorecardSubmissions.match_id, matchId), inArray(scorecardSubmissions.review_status, APPROVED_STATUSES)));
  return row?.cnt ?? 0;
}

/** Submissions that are not approved / rejected yet (the stats report waits for these). */
export async function countUnfinalizedSubmissions(ex: Executor, matchId: string): Promise<number> {
  const [row] = await ex.select({ cnt: count() }).from(scorecardSubmissions)
    .where(and(eq(scorecardSubmissions.match_id, matchId), notInArray(scorecardSubmissions.review_status, FINAL_REVIEW_STATUSES)));
  return row?.cnt ?? 0;
}

/** Latest approved submission's AI-suggested finishing order for a map, re-validated (it came from AI output). */
export async function getSuggestedPositions(ex: Executor, matchId: string, matchGameId: string): Promise<Record<string, number> | null> {
  const rows = await ex.select({ suggested_positions: scorecardSubmissions.suggested_positions }).from(scorecardSubmissions)
    .where(and(
      eq(scorecardSubmissions.match_id, matchId), eq(scorecardSubmissions.match_game_id, matchGameId),
      inArray(scorecardSubmissions.review_status, APPROVED_STATUSES), isNotNull(scorecardSubmissions.suggested_positions),
    ))
    .orderBy(desc(scorecardSubmissions.created_at), desc(scorecardSubmissions.id));
  for (const row of rows) {
    const parsed = row.suggested_positions;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const out: Record<string, number> = {};
    for (const [participantId, position] of Object.entries(parsed)) {
      if (typeof position === 'number' && Number.isInteger(position) && position >= 1) out[participantId] = position;
    }
    if (Object.keys(out).length > 0) return out;
  }
  return null;
}

// ─── extracted player rows ───────────────────────────────────────────────────

export interface NewPlayerStat {
  submissionId: string;
  matchId: string;
  matchGameId: string;
  playerName: string;
  teamSide: TeamSide | null;
  teamId: string | null;
  stats: Record<string, number>;
  confidence: number;
}

export async function insertPlayerStats(ex: Executor, rows: readonly NewPlayerStat[]): Promise<void> {
  if (rows.length === 0) return;
  await ex.insert(scorecardPlayerStats).values(rows.map((r) => ({
    id: crypto.randomUUID(),
    submission_id: r.submissionId,
    match_id: r.matchId,
    match_game_id: r.matchGameId,
    extracted_player_name: r.playerName,
    team_side: r.teamSide,
    team_id: r.teamId,
    stats_json: r.stats,
    confidence_score: r.confidence,
  })));
}

/** Assign participants to extracted rows of one submission. Returns how many rows changed. */
export async function assignPlayerStats(
  ex: Executor, submissionId: string, assignments: ReadonlyArray<{ playerStatId: string; participantId: string }>,
): Promise<number> {
  let changed = 0;
  for (const a of assignments) {
    const rows = await ex.update(scorecardPlayerStats).set({ participant_id: a.participantId, assignment_status: 'assigned' })
      .where(and(eq(scorecardPlayerStats.id, a.playerStatId), eq(scorecardPlayerStats.submission_id, submissionId)))
      .returning({ id: scorecardPlayerStats.id });
    changed += rows.length;
  }
  return changed;
}

/** Auto-assign: only still-unassigned rows with this extracted name. */
export async function assignByExtractedName(ex: Executor, submissionId: string, extractedName: string, participantId: string): Promise<void> {
  await ex.update(scorecardPlayerStats).set({ participant_id: participantId, assignment_status: 'assigned' })
    .where(and(
      eq(scorecardPlayerStats.submission_id, submissionId), eq(scorecardPlayerStats.extracted_player_name, extractedName),
      eq(scorecardPlayerStats.assignment_status, 'unassigned'),
    ));
}

export async function countUnassignedForSubmission(ex: Executor, submissionId: string): Promise<number> {
  const [row] = await ex.select({ cnt: count() }).from(scorecardPlayerStats)
    .where(and(eq(scorecardPlayerStats.submission_id, submissionId), eq(scorecardPlayerStats.assignment_status, 'unassigned')));
  return row?.cnt ?? 0;
}

export async function countUnassignedForMatch(ex: Executor, matchId: string): Promise<number> {
  const [row] = await ex.select({ cnt: count() }).from(scorecardPlayerStats)
    .innerJoin(scorecardSubmissions, eq(scorecardSubmissions.id, scorecardPlayerStats.submission_id))
    .where(and(eq(scorecardSubmissions.match_id, matchId), eq(scorecardPlayerStats.assignment_status, 'unassigned')));
  return row?.cnt ?? 0;
}

/**
 * For each extracted name, the participant assigned on the most recent earlier map of this match (carry-over source).
 */
export async function listCarryOverAssignments(
  ex: Executor, matchId: string, excludeMatchGameId: string,
): Promise<Array<{ extracted_player_name: string; participant_id: string }>> {
  const rows = await ex.selectDistinctOn([scorecardPlayerStats.extracted_player_name], {
    extracted_player_name: scorecardPlayerStats.extracted_player_name,
    participant_id: scorecardPlayerStats.participant_id,
  }).from(scorecardPlayerStats)
    .innerJoin(scorecardSubmissions, eq(scorecardSubmissions.id, scorecardPlayerStats.submission_id))
    .where(and(
      eq(scorecardPlayerStats.match_id, matchId), sql`${scorecardPlayerStats.match_game_id} <> ${excludeMatchGameId}`,
      isNotNull(scorecardPlayerStats.participant_id),
    ))
    .orderBy(asc(scorecardPlayerStats.extracted_player_name), desc(scorecardSubmissions.created_at), desc(scorecardSubmissions.id));
  return rows.flatMap((r) => (r.participant_id ? [{ extracted_player_name: r.extracted_player_name, participant_id: r.participant_id }] : []));
}

// ─── scorecard DM prompts ────────────────────────────────────────────────────

export type ScorecardDmRow = typeof scorecardDmMessages.$inferSelect;

export async function recordScorecardDm(
  ex: Executor,
  input: { matchId: string; matchGameId: string; discordUserId: string; discordMessageId: string; participantId: string | null; teamSide: TeamSide | null },
): Promise<void> {
  await ex.insert(scorecardDmMessages).values({
    id: crypto.randomUUID(), match_id: input.matchId, match_game_id: input.matchGameId, discord_user_id: input.discordUserId,
    discord_message_id: input.discordMessageId, participant_id: input.participantId, team_side: input.teamSide,
  });
}

/** The prompt a user replied to. */
export async function findScorecardDm(ex: Executor, discordMessageId: string, discordUserId: string): Promise<ScorecardDmRow | undefined> {
  const [row] = await ex.select().from(scorecardDmMessages)
    .where(and(eq(scorecardDmMessages.discord_message_id, discordMessageId), eq(scorecardDmMessages.discord_user_id, discordUserId))).limit(1);
  return row;
}

/** Distinct maps this user was asked for a scorecard on. */
export async function listScorecardDmGameIds(ex: Executor, discordUserId: string): Promise<string[]> {
  const rows = await ex.selectDistinct({ match_game_id: scorecardDmMessages.match_game_id }).from(scorecardDmMessages)
    .where(eq(scorecardDmMessages.discord_user_id, discordUserId));
  return rows.map((r) => r.match_game_id);
}
