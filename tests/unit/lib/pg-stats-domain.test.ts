// @vitest-environment node
/** Stats domain (src/lib/stats): aggregation, scorecard submissions / player rows / prompts, stats settings. */
import { describe, it, expect, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { addMatchGame, addParticipant, addPlayerStat, addSubmission, seedStatsMatch } from '../../utils/pg-stats-fixtures';
import { createMatch } from '../../utils/pg-fixtures';
import { matchPlayerStats, scorecardPlayerStats, scorecardSubmissions, statsSettings } from '../../../lib/db/schema';
import { db } from '../../../lib/db';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

import {
  aggregateMatchStats, appendProcessingLog, assignByExtractedName, assignPlayerStats, countApprovedSubmissions, countUnassignedForMatch,
  countUnassignedForSubmission, countUnfinalizedSubmissions, createSubmission, deleteSubmission, findScorecardDm, findSubmissionByDiscordMessage,
  getMatchOverviewCounts, getStatsSettings, getSubmission, getSubmissionWithStats, getSuggestedPositions, hasSubmissionForGame, insertPlayerStats,
  isStatsEnabled, listCarryOverAssignments, listConfiguredProviders, listMatchPlayerStats, listPerMapStats, listScorecardDmGameIds,
  listStatImageRows, listSubmissionsWithStats, listUnsentStatReportRows, markStatsDmSent, parseProvidersConfig, providerApiKey,
  recordScorecardDm, resetFailedSubmission, saveStatsSettings, setExtractionStatus, setReviewStatus, setSuggestedPositions,
} from '@/lib/stats';

setupPgTestFile();
const pg = () => getPgTestDb();

/** An approved-by-default submission with one assigned player row. */
async function approvedRow(matchId: string, gameId: string, participantId: string | null, stats: Record<string, unknown>, review: 'approved' | 'auto_approved' | 'pending' | 'rejected' = 'approved') {
  const sub = await addSubmission(matchId, gameId, { review_status: review });
  const stat = await addPlayerStat(sub.id, matchId, gameId, { participant_id: participantId, stats_json: stats as Record<string, number> });
  return { sub, stat };
}

describe('aggregateMatchStats', () => {
  it('returns 0 and writes nothing when no approved submissions exist', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, { kills: 5 }, 'pending');
    expect(await aggregateMatchStats(db, match.id)).toBe(0);
    expect(await pg().select().from(matchPlayerStats)).toHaveLength(0);
  });

  it('returns 0 when the approved row has no participant assigned', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    await approvedRow(match.id, matchGameId, null, { kills: 3 });
    expect(await aggregateMatchStats(db, match.id)).toBe(0);
  });

  it('returns 0 for a match with no submissions at all', async () => {
    const { match } = await seedStatsMatch();
    expect(await aggregateMatchStats(db, match.id)).toBe(0);
  });

  it('aggregates one participant across two maps (approved + auto_approved)', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const map2 = await addMatchGame(match.id, 2);
    const p = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, { kills: 10, deaths: 2 }, 'approved');
    await approvedRow(match.id, map2, p.id, { kills: 8, deaths: 3 }, 'auto_approved');

    expect(await aggregateMatchStats(db, match.id)).toBe(1);
    const [row] = await listMatchPlayerStats(db, match.id);
    expect(row.maps_played).toBe(2);
    expect(row.total_stats_json).toEqual({ kills: 18, deaths: 5 });
  });

  it('returns one row per participant', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p1 = await addParticipant(match.id);
    const p2 = await addParticipant(match.id);
    const sub = await addSubmission(match.id, matchGameId, { review_status: 'approved' });
    await addPlayerStat(sub.id, match.id, matchGameId, { participant_id: p1.id, stats_json: { kills: 5 } });
    await addPlayerStat(sub.id, match.id, matchGameId, { participant_id: p2.id, stats_json: { kills: 7 } });

    expect(await aggregateMatchStats(db, match.id)).toBe(2);
    expect((await listMatchPlayerStats(db, match.id)).map((r) => r.participant_id).sort()).toEqual([p1.id, p2.id].sort());
  });

  it('updates the existing row on a second call (ON CONFLICT) and bumps updated_at', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, { kills: 4 });
    await aggregateMatchStats(db, match.id);
    const [first] = await listMatchPlayerStats(db, match.id);
    await new Promise((r) => setTimeout(r, 5));
    await aggregateMatchStats(db, match.id);
    const rows = await listMatchPlayerStats(db, match.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].total_stats_json).toEqual({ kills: 4 });
    expect(rows[0].updated_at.getTime()).toBeGreaterThan(first.updated_at.getTime());
  });

  it('re-aggregating keeps stat_image_url and stats_dm_sent of an existing row', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, { kills: 4 });
    await aggregateMatchStats(db, match.id);
    await pg().update(matchPlayerStats).set({ stat_image_url: '/uploads/stats/x.png', stats_dm_sent: true });
    await aggregateMatchStats(db, match.id);
    const [row] = await listMatchPlayerStats(db, match.id);
    expect(row.stat_image_url).toBe('/uploads/stats/x.png');
    expect(row.stats_dm_sent).toBe(true);
  });

  it('skips non-numeric stat values', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, { kills: 6, hero: 'Tracer', winRate: null });
    expect(await aggregateMatchStats(db, match.id)).toBe(1);
    expect((await listMatchPlayerStats(db, match.id))[0].total_stats_json).toEqual({ kills: 6 });
  });

  it('treats stats_json that is not an object of numbers as empty instead of throwing', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, 'this is not an object' as unknown as Record<string, unknown>);
    await expect(aggregateMatchStats(db, match.id)).resolves.toBe(1);
    expect((await listMatchPlayerStats(db, match.id))[0].total_stats_json).toEqual({});
  });

  it('one non-object row among valid rows for the same participant contributes nothing', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const map2 = await addMatchGame(match.id, 2);
    const p = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, { kills: 9 });
    await approvedRow(match.id, map2, p.id, ['not', 'an', 'object'] as unknown as Record<string, unknown>);
    expect(await aggregateMatchStats(db, match.id)).toBe(1);
    expect((await listMatchPlayerStats(db, match.id))[0].total_stats_json).toEqual({ kills: 9 });
  });

  it('includes auto_approved but excludes pending and rejected', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const maps = [matchGameId, await addMatchGame(match.id, 2), await addMatchGame(match.id, 3), await addMatchGame(match.id, 4)];
    const p = await addParticipant(match.id);
    await approvedRow(match.id, maps[0], p.id, { kills: 3 }, 'approved');
    await approvedRow(match.id, maps[1], p.id, { kills: 5 }, 'auto_approved');
    await approvedRow(match.id, maps[2], p.id, { kills: 10 }, 'rejected');
    await approvedRow(match.id, maps[3], p.id, { kills: 20 }, 'pending');
    await aggregateMatchStats(db, match.id);
    const [row] = await listMatchPlayerStats(db, match.id);
    expect(row.total_stats_json).toEqual({ kills: 8 });
    expect(row.maps_played).toBe(2);
  });

  it('returns 0 when every submission is pending or rejected', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const map2 = await addMatchGame(match.id, 2);
    const p = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, { kills: 99 }, 'pending');
    await approvedRow(match.id, map2, p.id, { kills: 99 }, 'rejected');
    expect(await aggregateMatchStats(db, match.id)).toBe(0);
  });

  it('accumulates zero-value stats and stores {} for empty stats', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const map2 = await addMatchGame(match.id, 2);
    const p = await addParticipant(match.id);
    const q = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, { kills: 0, assists: 0, deaths: 5 });
    await approvedRow(match.id, map2, q.id, {});
    expect(await aggregateMatchStats(db, match.id)).toBe(2);
    const rows = await listMatchPlayerStats(db, match.id);
    expect(rows.find((r) => r.participant_id === p.id)?.total_stats_json).toEqual({ kills: 0, assists: 0, deaths: 5 });
    expect(rows.find((r) => r.participant_id === q.id)?.total_stats_json).toEqual({});
  });

  it('sums the same stat key across 5 maps', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p = await addParticipant(match.id);
    const maps = [matchGameId];
    for (let i = 2; i <= 5; i++) maps.push(await addMatchGame(match.id, i));
    for (const g of maps) await approvedRow(match.id, g, p.id, { kills: 10, deaths: 2 });
    await aggregateMatchStats(db, match.id);
    const [row] = await listMatchPlayerStats(db, match.id);
    expect(row.total_stats_json).toEqual({ kills: 50, deaths: 10 });
    expect(row.maps_played).toBe(5);
  });

  it('tracks maps_played independently per participant', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const maps = [matchGameId, await addMatchGame(match.id, 2), await addMatchGame(match.id, 3)];
    const p1 = await addParticipant(match.id);
    const p2 = await addParticipant(match.id);
    const subs = [];
    for (const g of maps) {
      const sub = await addSubmission(match.id, g, { review_status: 'approved' });
      subs.push(sub);
      await addPlayerStat(sub.id, match.id, g, { participant_id: p1.id, stats_json: { score: 100 } });
    }
    await addPlayerStat(subs[0].id, match.id, maps[0], { participant_id: p2.id, stats_json: { score: 200 } });
    await aggregateMatchStats(db, match.id);
    const rows = await listMatchPlayerStats(db, match.id);
    expect(rows.find((r) => r.participant_id === p1.id)?.maps_played).toBe(3);
    expect(rows.find((r) => r.participant_id === p2.id)?.maps_played).toBe(1);
  });

  it('does not mix stats between two matches', async () => {
    const a = await seedStatsMatch();
    const b = await createMatch(a.game.id, a.mode.id, { status: 'battle' });
    const bGame = await addMatchGame(b.id, 1);
    const pa = await addParticipant(a.match.id);
    const pb = await addParticipant(b.id);
    await approvedRow(a.match.id, a.matchGameId, pa.id, { kills: 7 });
    await approvedRow(b.id, bGame, pb.id, { kills: 13 });
    await aggregateMatchStats(db, a.match.id);
    await aggregateMatchStats(db, b.id);
    expect((await listMatchPlayerStats(db, a.match.id))[0].total_stats_json).toEqual({ kills: 7 });
    expect((await listMatchPlayerStats(db, b.id))[0].total_stats_json).toEqual({ kills: 13 });
  });

  it('listPerMapStats returns approved assigned rows with the stored JSON object', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p = await addParticipant(match.id);
    await approvedRow(match.id, matchGameId, p.id, { kills: 5 });
    await approvedRow(match.id, matchGameId, null, { kills: 1 });
    await approvedRow(match.id, matchGameId, p.id, { kills: 100 }, 'pending');
    expect(await listPerMapStats(db, match.id)).toEqual([{ match_game_id: matchGameId, participant_id: p.id, stats_json: { kills: 5 } }]);
  });
});

describe('submissions', () => {
  it('create / get / list (newest first, with player rows ordered by side then name) / delete cascades rows', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const map2 = await addMatchGame(match.id, 2);
    const s1 = await createSubmission(db, { id: 's1', matchId: match.id, matchGameId, teamSide: 'blue', screenshotUrl: '/uploads/a.png' });
    await new Promise((r) => setTimeout(r, 5));
    await createSubmission(db, { id: 's2', matchId: match.id, matchGameId: map2, teamSide: 'red', screenshotUrl: '/uploads/b.png', discordMessageId: 'dm-1' });
    await addPlayerStat(s1.id, match.id, matchGameId, { extracted_player_name: 'Zed', team_side: 'blue' });
    await addPlayerStat(s1.id, match.id, matchGameId, { extracted_player_name: 'Amy', team_side: 'red' });
    await addPlayerStat(s1.id, match.id, matchGameId, { extracted_player_name: 'Bob', team_side: 'blue' });
    await addPlayerStat(s1.id, match.id, matchGameId, { extracted_player_name: 'Nobody', team_side: null });

    const all = await listSubmissionsWithStats(db, match.id);
    expect(all.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(all[1].playerStats.map((p) => p.extracted_player_name)).toEqual(['Nobody', 'Bob', 'Zed', 'Amy']);
    expect((await listSubmissionsWithStats(db, match.id, map2)).map((s) => s.id)).toEqual(['s2']);
    expect((await getSubmissionWithStats(db, match.id, 's1'))?.playerStats).toHaveLength(4);
    expect(await getSubmission(db, 'other-match', 's1')).toBeUndefined();
    expect((await findSubmissionByDiscordMessage(db, 'dm-1'))?.id).toBe('s2');
    expect(await hasSubmissionForGame(db, matchGameId)).toBe(true);

    const deleted = await deleteSubmission(db, 's1');
    expect(deleted?.screenshot_url).toBe('/uploads/a.png');
    expect(await pg().select().from(scorecardPlayerStats)).toHaveLength(0);
    expect(await deleteSubmission(db, 's1')).toBeUndefined();
  });

  it('review and extraction status helpers', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const sub = await addSubmission(match.id, matchGameId);
    expect(await countUnfinalizedSubmissions(db, match.id)).toBe(1);
    expect(await countApprovedSubmissions(db, match.id)).toBe(0);
    await setReviewStatus(db, sub.id, 'approved');
    const after = await getSubmission(db, match.id, sub.id);
    expect(after?.review_status).toBe('approved');
    expect(after?.reviewed_at).toBeInstanceOf(Date);
    expect(await countUnfinalizedSubmissions(db, match.id)).toBe(0);
    expect(await countApprovedSubmissions(db, match.id)).toBe(1);

    await setExtractionStatus(db, sub.id, 'retrying', 'boom');
    expect(await getSubmission(db, match.id, sub.id)).toMatchObject({ ai_extraction_status: 'retrying', ai_error_message: 'boom' });
    await setExtractionStatus(db, sub.id, 'processing');
    expect((await getSubmission(db, match.id, sub.id))?.ai_error_message).toBe('boom'); // not passed: left alone
  });

  it('resetFailedSubmission is a compare-and-set (only a failed submission resets, once)', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const sub = await addSubmission(match.id, matchGameId, { ai_extraction_status: 'failed', ai_error_message: 'x' });
    expect(await resetFailedSubmission(db, sub.id)).toBe(true);
    expect(await resetFailedSubmission(db, sub.id)).toBe(false);
    expect(await getSubmission(db, match.id, sub.id)).toMatchObject({ ai_extraction_status: 'pending', ai_error_message: null });
  });

  it('appendProcessingLog appends atomically and keeps order', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const sub = await addSubmission(match.id, matchGameId);
    await appendProcessingLog(db, sub.id, 'first');
    await Promise.all([appendProcessingLog(db, sub.id, 'second'), appendProcessingLog(db, sub.id, 'third')]);
    const log = (await getSubmission(db, match.id, sub.id))!.ai_processing_log!;
    expect(log).toHaveLength(3);
    expect(log[0].message).toBe('first');
    expect(log.map((l) => l.message).sort()).toEqual(['first', 'second', 'third']);
    expect(Date.parse(log[0].ts)).not.toBeNaN();
  });

  it('suggested positions: latest approved submission wins and the stored JSON is re-validated', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const pending = await addSubmission(match.id, matchGameId, { review_status: 'pending' });
    await setSuggestedPositions(db, pending.id, { p1: 1 });
    expect(await getSuggestedPositions(db, match.id, matchGameId)).toBeNull();

    const old = await addSubmission(match.id, matchGameId, { review_status: 'approved' });
    await setSuggestedPositions(db, old.id, { p1: 2 });
    await new Promise((r) => setTimeout(r, 5));
    const recent = await addSubmission(match.id, matchGameId, { review_status: 'auto_approved' });
    await pg().update(scorecardSubmissions).set({ suggested_positions: { p1: 1, p2: 0, p3: 'x', p4: 1.5, p5: 3 } as never }).where(eq(scorecardSubmissions.id, recent.id));
    expect(await getSuggestedPositions(db, match.id, matchGameId)).toEqual({ p1: 1, p5: 3 });

    await pg().update(scorecardSubmissions).set({ suggested_positions: [1, 2] as never }).where(eq(scorecardSubmissions.id, recent.id));
    expect(await getSuggestedPositions(db, match.id, matchGameId)).toEqual({ p1: 2 }); // falls back to the older valid one
  });
});

describe('extracted player rows', () => {
  it('insertPlayerStats stores jsonb stats, confidence and team', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const sub = await addSubmission(match.id, matchGameId);
    await insertPlayerStats(db, []);
    await insertPlayerStats(db, [
      { submissionId: sub.id, matchId: match.id, matchGameId, playerName: 'Alice', teamSide: 'blue', teamId: null, stats: { kills: 3 }, confidence: 0.9 },
    ]);
    const [row] = await pg().select().from(scorecardPlayerStats);
    expect(row).toMatchObject({ extracted_player_name: 'Alice', team_side: 'blue', stats_json: { kills: 3 }, confidence_score: 0.9, assignment_status: 'unassigned' });
  });

  it('assignPlayerStats only touches rows of the given submission and counts changes', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p = await addParticipant(match.id);
    const a = await addSubmission(match.id, matchGameId);
    const b = await addSubmission(match.id, matchGameId);
    const rowA = await addPlayerStat(a.id, match.id, matchGameId);
    const rowB = await addPlayerStat(b.id, match.id, matchGameId);
    expect(await assignPlayerStats(db, a.id, [{ playerStatId: rowA.id, participantId: p.id }, { playerStatId: rowB.id, participantId: p.id }])).toBe(1);
    expect(await countUnassignedForSubmission(db, a.id)).toBe(0);
    expect(await countUnassignedForMatch(db, match.id)).toBe(1);
  });

  it('assignByExtractedName fills only still-unassigned rows', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const p1 = await addParticipant(match.id);
    const p2 = await addParticipant(match.id);
    const sub = await addSubmission(match.id, matchGameId);
    const open = await addPlayerStat(sub.id, match.id, matchGameId, { extracted_player_name: 'Same' });
    const taken = await addPlayerStat(sub.id, match.id, matchGameId, { extracted_player_name: 'Same', participant_id: p2.id, assignment_status: 'assigned' });
    await assignByExtractedName(db, sub.id, 'Same', p1.id);
    const rows = await pg().select().from(scorecardPlayerStats).where(and(eq(scorecardPlayerStats.submission_id, sub.id)));
    expect(rows.find((r) => r.id === open.id)).toMatchObject({ participant_id: p1.id, assignment_status: 'assigned' });
    expect(rows.find((r) => r.id === taken.id)?.participant_id).toBe(p2.id);
  });

  it('listCarryOverAssignments: latest assignment per name from OTHER maps only', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const map2 = await addMatchGame(match.id, 2);
    const map3 = await addMatchGame(match.id, 3);
    const p1 = await addParticipant(match.id);
    const p2 = await addParticipant(match.id);
    const early = await addSubmission(match.id, matchGameId, { created_at: new Date('2026-01-01T00:00:00Z') });
    const late = await addSubmission(match.id, map2, { created_at: new Date('2026-01-02T00:00:00Z') });
    await addPlayerStat(early.id, match.id, matchGameId, { extracted_player_name: 'Ace', participant_id: p1.id });
    await addPlayerStat(late.id, match.id, map2, { extracted_player_name: 'Ace', participant_id: p2.id });
    await addPlayerStat(early.id, match.id, matchGameId, { extracted_player_name: 'Unassigned' });

    expect(await listCarryOverAssignments(db, match.id, map3)).toEqual([{ extracted_player_name: 'Ace', participant_id: p2.id }]);
    // excluding map 2: only the earlier map's assignment remains
    expect(await listCarryOverAssignments(db, match.id, map2)).toEqual([{ extracted_player_name: 'Ace', participant_id: p1.id }]);
  });
});

describe('scorecard DM prompts', () => {
  it('records and finds the prompt a user replied to, and lists the maps asked', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const map2 = await addMatchGame(match.id, 2);
    const p = await addParticipant(match.id);
    await recordScorecardDm(db, { matchId: match.id, matchGameId, discordUserId: 'u1', discordMessageId: 'msg-1', participantId: p.id, teamSide: 'blue' });
    await recordScorecardDm(db, { matchId: match.id, matchGameId: map2, discordUserId: 'u1', discordMessageId: 'msg-2', participantId: null, teamSide: null });
    expect(await findScorecardDm(db, 'msg-1', 'u1')).toMatchObject({ match_id: match.id, match_game_id: matchGameId, participant_id: p.id, team_side: 'blue' });
    expect(await findScorecardDm(db, 'msg-1', 'someone-else')).toBeUndefined();
    expect((await listScorecardDmGameIds(db, 'u1')).sort()).toEqual([matchGameId, map2].sort());
    expect(await listScorecardDmGameIds(db, 'nobody')).toEqual([]);
  });
});

describe('stat image / report rows', () => {
  it('listStatImageRows joins the player and team; listUnsentStatReportRows skips sent rows and players without Discord', async () => {
    const { match, matchGameId } = await seedStatsMatch();
    const withDiscord = await addParticipant(match.id, { username: 'Alice', signup_data: { roles: 'Tank' } });
    const noDiscord = await addParticipant(match.id, { username: 'Ghost', discord_user_id: null });
    const sent = await addParticipant(match.id, { username: 'Sent' });
    for (const p of [withDiscord, noDiscord, sent]) await approvedRow(match.id, matchGameId, p.id, { kills: 1 });
    await aggregateMatchStats(db, match.id);
    await markStatsDmSent(db, match.id, sent.id);

    expect((await listStatImageRows(db, match.id)).map((r) => r.username).sort()).toEqual(['Alice', 'Ghost', 'Sent']);
    const unsent = await listUnsentStatReportRows(db, match.id);
    expect(unsent.map((r) => r.username)).toEqual(['Alice']);
    expect(unsent[0].signup_data).toEqual({ roles: 'Tank' });
    expect(unsent[0].discord_user_id).toBe(withDiscord.discord_user_id);
  });

  it('getMatchOverviewCounts counts matches and match sign-ups', async () => {
    expect(await getMatchOverviewCounts(db)).toEqual({ totalMatches: 0, matchParticipants: 0 });
    const { match } = await seedStatsMatch();
    await addParticipant(match.id);
    await addParticipant(match.id);
    expect(await getMatchOverviewCounts(db)).toEqual({ totalMatches: 1, matchParticipants: 2 });
  });
});

describe('stats settings', () => {
  it('saveStatsSettings creates the singleton row, keeps keys not mentioned and mirrors the first provider', async () => {
    expect(await getStatsSettings(db)).toBeUndefined();
    expect(await isStatsEnabled(db)).toBe(false);

    await saveStatsSettings(db, {
      enabled: true,
      providers: [
        { instanceId: 'g1', providerId: 'google', model: 'gemini', sortOrder: 1, apiKey: 'gkey' },
        { instanceId: 'a1', providerId: 'anthropic', model: 'sonnet', sortOrder: 0, apiKey: 'akey' },
      ],
    });
    let row = (await getStatsSettings(db))!;
    expect(row).toMatchObject({ enabled: true, ai_api_key: 'akey', google_api_key: 'gkey', ai_provider: 'anthropic', ai_model: 'sonnet' });
    expect(row.ai_providers_config).toEqual([
      { instanceId: 'g1', providerId: 'google', model: 'gemini', sortOrder: 1 },
      { instanceId: 'a1', providerId: 'anthropic', model: 'sonnet', sortOrder: 0 },
    ]);
    expect(await isStatsEnabled(db)).toBe(true);

    // apiKey undefined keeps the key, '' clears it
    await saveStatsSettings(db, { providers: [{ instanceId: 'a1', providerId: 'anthropic', model: 'opus', sortOrder: 0, apiKey: '' }] });
    row = (await getStatsSettings(db))!;
    expect(row.ai_api_key).toBeNull();
    expect(row.google_api_key).toBe('gkey');
    expect(row.ai_model).toBe('opus');

    await saveStatsSettings(db, { stats_report_dm_enabled: true });
    expect((await getStatsSettings(db))!.stats_report_dm_enabled).toBe(true);
    expect(await pg().select().from(statsSettings)).toHaveLength(1);
    await saveStatsSettings(db, {}); // no-op
  });

  it('parseProvidersConfig handles the current format, the legacy format and "not configured"', () => {
    expect(parseProvidersConfig(null)).toBeNull();
    expect(parseProvidersConfig('nope')).toBeNull();
    expect(parseProvidersConfig([])).toEqual([]);
    expect(parseProvidersConfig([{ instanceId: 'a', providerId: 'anthropic', model: 'm' }])).toEqual([{ instanceId: 'a', providerId: 'anthropic', model: 'm', sortOrder: 0 }]);
    expect(parseProvidersConfig([
      { id: 'google', model: 'g', enabled: true, sortOrder: 2 },
      { id: 'openrouter', model: 'o', enabled: false, sortOrder: 3 },
    ])).toEqual([{ instanceId: 'google-g', providerId: 'google', model: 'g', sortOrder: 2 }]);
  });

  it('listConfiguredProviders falls back to one Anthropic instance when only a key exists', () => {
    const base = { ai_providers_config: null, ai_api_key: null, ai_model: 'sonnet' };
    expect(listConfiguredProviders(base)).toEqual([]);
    expect(listConfiguredProviders({ ...base, ai_api_key: 'k' })).toEqual([{ instanceId: 'anthropic-sonnet', providerId: 'anthropic', model: 'sonnet', sortOrder: 0 }]);
    expect(listConfiguredProviders({ ...base, ai_api_key: 'k', ai_providers_config: [] })).toHaveLength(1);
    expect(listConfiguredProviders({ ...base, ai_providers_config: [{ instanceId: 'x', providerId: 'google', model: 'g', sortOrder: 0 }] })).toHaveLength(1);
  });

  it('providerApiKey picks the key by provider id', () => {
    const s = { ai_api_key: 'a', google_api_key: 'g', openrouter_api_key: 'o' };
    expect(providerApiKey(s, 'anthropic')).toBe('a');
    expect(providerApiKey(s, 'google')).toBe('g');
    expect(providerApiKey(s, 'openrouter')).toBe('o');
    expect(providerApiKey(undefined, 'anthropic')).toBeUndefined();
  });
});
