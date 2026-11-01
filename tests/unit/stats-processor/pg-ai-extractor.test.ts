// @vitest-environment node
/**
 * AIExtractor on Postgres. The pure prompt / validation / parsing tests are ported unchanged from the old DB-mock suite;
 * the DB-backed methods and the whole extraction flow now run against real tables (blob screenshot, stats settings,
 * scorecard rows, queue job, activity feed).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { PNG_BYTES, addMatchGame, addParticipant, addPlayerStat, addSubmission, seedStatsMatch, type StatsFixture } from '../../utils/pg-stats-fixtures';
import { activityFeed, gameModes, gameStatDefinitions, matchGamePlacements, matchParticipants, scorecardPlayerStats, scorecardSubmissions, statsProcessingQueue, statsSettings } from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import { putBlob } from '../../../lib/storage';
import { claimJobs, enqueueStatsProcessing } from '../../../src/lib/discord-queues';
import { createMatchTeams, getMatchTeams } from '../../../src/lib/matches';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));
vi.mock('../../../src/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

const providers = vi.hoisted(() => ({ anthropic: vi.fn(), google: vi.fn() } as Record<string, ReturnType<typeof vi.fn>>));
vi.mock('../../../processes/stats-processor/modules/providers', () => ({ AI_PROVIDER_CALLS: providers }));

import { AIExtractor } from '../../../processes/stats-processor/modules/ai-extractor';
import type { GameStatDefinition } from '../../../shared/types';

setupPgTestFile();
const pg = () => getPgTestDb();

function makeStatDef(name: string, displayName: string, statType = 'integer'): GameStatDefinition {
  return { id: `sd-${name}`, game_id: 'game-1', name, display_name: displayName, stat_type: statType, sort_order: 0, is_primary: true };
}

const OW_STATS: GameStatDefinition[] = [
  makeStatDef('kills', 'Kills'),
  makeStatDef('deaths', 'Deaths'),
  makeStatDef('assists', 'Assists'),
];

function makeValidResponse(players: unknown[] = [{ playerName: 'Alice', teamSide: 'blue', stats: { kills: 10, deaths: 2, assists: 5 }, confidence: 0.95 }]) {
  return JSON.stringify({
    players,
    mapName: 'Hanamura',
    gameResult: { team1Score: 2, team2Score: 1, winner: 'team1' },
  });
}

describe('AIExtractor', () => {
  const extractor = new AIExtractor();

  describe('buildPrompt', () => {
    it('includes game name in prompt', () => {
      expect(extractor.buildPrompt(OW_STATS, 'Overwatch 2', 'blue')).toContain('Overwatch 2');
    });

    it('includes each stat definition name', () => {
      const prompt = extractor.buildPrompt(OW_STATS, 'Overwatch 2');
      expect(prompt).toContain('kills');
      expect(prompt).toContain('deaths');
      expect(prompt).toContain('assists');
    });

    it('includes stat display names', () => {
      const prompt = extractor.buildPrompt(OW_STATS, 'Overwatch 2');
      expect(prompt).toContain('Kills');
      expect(prompt).toContain('Deaths');
    });

    it('includes team side when provided', () => {
      expect(extractor.buildPrompt(OW_STATS, 'Overwatch 2', 'red')).toContain('red');
    });

    it('does not mention team side when not provided', () => {
      expect(extractor.buildPrompt(OW_STATS, 'Overwatch 2', undefined)).not.toContain('submitter is on the');
    });

    it('includes ai notes when provided', () => {
      expect(extractor.buildPrompt(OW_STATS, 'Overwatch 2', undefined, 'Look for hero icons')).toContain('Look for hero icons');
    });

    it('produces different prompts for different games', () => {
      const owPrompt = extractor.buildPrompt([makeStatDef('kills', 'Kills')], 'Overwatch 2');
      const csPrompt = extractor.buildPrompt([makeStatDef('adr', 'ADR')], 'Counter-Strike 2');
      expect(owPrompt).not.toBe(csPrompt);
      expect(owPrompt).toContain('Overwatch 2');
      expect(csPrompt).toContain('Counter-Strike 2');
    });

    it('requests JSON-only output', () => {
      expect(extractor.buildPrompt(OW_STATS, 'Overwatch 2')).toContain('JSON');
    });
  });

  describe('validateExtractionResponse', () => {
    it('returns null for valid response', () => {
      expect(extractor.validateExtractionResponse(makeValidResponse())).toBeNull();
    });

    it('returns error for invalid JSON', () => {
      expect(extractor.validateExtractionResponse('not json {{{')).toBe('invalid JSON');
    });

    it('returns error when players is missing', () => {
      expect(extractor.validateExtractionResponse(JSON.stringify({ mapName: 'X' }))).toBe('players is not an array');
    });

    it('returns error when players array is empty', () => {
      expect(extractor.validateExtractionResponse(JSON.stringify({ players: [] }))).toBe('players array is empty');
    });

    it('returns error when player missing playerName', () => {
      expect(extractor.validateExtractionResponse(JSON.stringify({ players: [{ teamSide: 'blue', stats: { kills: 1 }, confidence: 0.9 }] }))).toBe('player missing playerName');
    });

    it('returns error when player missing stats', () => {
      expect(extractor.validateExtractionResponse(JSON.stringify({ players: [{ playerName: 'Alice', teamSide: 'blue', confidence: 0.9 }] }))).toBe('player missing stats object');
    });

    it('returns error for non-numeric stat value', () => {
      expect(extractor.validateExtractionResponse(JSON.stringify({ players: [{ playerName: 'Alice', teamSide: 'blue', stats: { kills: 'ten' }, confidence: 0.9 }] }))).toBe('non-numeric stat value');
    });

    it('returns error when confidence is missing', () => {
      expect(extractor.validateExtractionResponse(JSON.stringify({ players: [{ playerName: 'Alice', teamSide: 'blue', stats: { kills: 5 } }] }))).toBe('missing confidence');
    });

    it('strips markdown fences before parsing', () => {
      expect(extractor.validateExtractionResponse(`\`\`\`json\n${makeValidResponse()}\n\`\`\``)).toBeNull();
    });

    it('caps player count and name length', () => {
      const many = JSON.stringify({ players: Array.from({ length: 100 }, (_, i) => ({ playerName: `p${i}`, stats: {}, confidence: 1 })) });
      expect(extractor.validateExtractionResponse(many)).toBe('too many players');
      const longName = JSON.stringify({ players: [{ playerName: 'x'.repeat(500), stats: {}, confidence: 1 }] });
      expect(extractor.validateExtractionResponse(longName)).toBe('playerName too long');
    });
  });

  describe('parseExtractionResult', () => {
    it('parses valid response into structured object', () => {
      const result = extractor.parseExtractionResult(makeValidResponse());
      expect(result.players).toHaveLength(1);
      expect(result.players[0].playerName).toBe('Alice');
      expect(result.players[0].stats.kills).toBe(10);
    });

    it('strips markdown code fences', () => {
      expect(extractor.parseExtractionResult(`\`\`\`json\n${makeValidResponse()}\n\`\`\``).players[0].playerName).toBe('Alice');
    });

    it('preserves mapName and gameResult', () => {
      const result = extractor.parseExtractionResult(makeValidResponse());
      expect(result.mapName).toBe('Hanamura');
      expect(result.gameResult?.winner).toBe('team1');
    });
  });

  describe('buildSuggestedPositions', () => {
    const participants = [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Carol' }];

    it('maps extracted names to participant ids', () => {
      expect(extractor.buildSuggestedPositions({ alice: 2, 'BOB!': 1 }, participants)).toEqual({ p1: 2, p2: 1 });
    });

    it('ignores names that are not participants of the match', () => {
      expect(extractor.buildSuggestedPositions({ Alice: 1, Mallory: 2 }, participants)).toEqual({ p1: 1 });
      expect(extractor.buildSuggestedPositions({ Mallory: 1 }, participants)).toBeNull();
    });

    it('rejects non-integer, non-positive or duplicate positions', () => {
      expect(extractor.buildSuggestedPositions({ Alice: 1.5 }, participants)).toBeNull();
      expect(extractor.buildSuggestedPositions({ Alice: 0 }, participants)).toBeNull();
      expect(extractor.buildSuggestedPositions({ Alice: '1' }, participants)).toBeNull();
      expect(extractor.buildSuggestedPositions({ Alice: 1, Bob: 1 }, participants)).toBeNull();
    });

    it('rejects non-object input', () => {
      expect(extractor.buildSuggestedPositions(null, participants)).toBeNull();
      expect(extractor.buildSuggestedPositions([1, 2], participants)).toBeNull();
    });
  });
});

// ─── DB-backed methods ───────────────────────────────────────────────────────

let fx: StatsFixture;
beforeEach(async () => {
  fx = await seedStatsMatch();
  providers.anthropic.mockReset();
  providers.google.mockReset();
});

describe('autoAssignParticipants', () => {
  it('assigns the matching participant by normalized name', async () => {
    const alice = await addParticipant(fx.match.id, { username: 'Alice' });
    await addParticipant(fx.match.id, { username: 'Bob' });
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    const stat = await addPlayerStat(sub.id, fx.match.id, fx.matchGameId, { extracted_player_name: 'alice' });

    await new AIExtractor().autoAssignParticipants(sub.id, fx.match.id, [{ playerName: 'alice', teamSide: 'blue', stats: { kills: 5 }, confidence: 0.9 }]);

    const [row] = await pg().select().from(scorecardPlayerStats).where(eq(scorecardPlayerStats.id, stat.id));
    expect(row).toMatchObject({ participant_id: alice.id, assignment_status: 'assigned' });
  });

  it('does not assign when confidence is too low', async () => {
    await addParticipant(fx.match.id, { username: 'Alice' });
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    await addPlayerStat(sub.id, fx.match.id, fx.matchGameId, { extracted_player_name: 'alice' });
    await new AIExtractor().autoAssignParticipants(sub.id, fx.match.id, [{ playerName: 'alice', teamSide: 'blue', stats: {}, confidence: 0.5 }]);
    expect((await pg().select().from(scorecardPlayerStats))[0].assignment_status).toBe('unassigned');
  });

  it('does not assign when several participants share the normalized name', async () => {
    await addParticipant(fx.match.id, { username: 'Alice' });
    await addParticipant(fx.match.id, { username: 'alice' });
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    await addPlayerStat(sub.id, fx.match.id, fx.matchGameId, { extracted_player_name: 'alice' });
    await new AIExtractor().autoAssignParticipants(sub.id, fx.match.id, [{ playerName: 'alice', teamSide: 'blue', stats: {}, confidence: 0.95 }]);
    expect((await pg().select().from(scorecardPlayerStats))[0].participant_id).toBeNull();
  });

  it('does nothing when the match has no participants', async () => {
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    await addPlayerStat(sub.id, fx.match.id, fx.matchGameId, { extracted_player_name: 'Alice' });
    await new AIExtractor().autoAssignParticipants(sub.id, fx.match.id, [{ playerName: 'Alice', teamSide: 'blue', stats: {}, confidence: 0.95 }]);
    expect((await pg().select().from(scorecardPlayerStats))[0].assignment_status).toBe('unassigned');
  });
});

describe('resolveNormalTeamIds', () => {
  type Resolver = { resolveNormalTeamIds(matchId: string): Promise<Record<string, string>> };

  it('maps team_order 0 to blue and 1 to red, ignoring the reserve team', async () => {
    await createMatchTeams(db, fx.match.id);
    const teams = await getMatchTeams(db, fx.match.id);
    const result = await (new AIExtractor() as unknown as Resolver).resolveNormalTeamIds(fx.match.id);
    expect(result).toEqual({ blue: teams.find((t) => t.team_order === 0)!.id, red: teams.find((t) => t.team_order === 1)!.id });
  });

  it('returns an empty map when match_teams has not been created yet', async () => {
    expect(await (new AIExtractor() as unknown as Resolver).resolveNormalTeamIds(fx.match.id)).toEqual({});
  });
});

describe('storeSuggestedPositions', () => {
  it('stores a suggestion on the submission and never writes placements', async () => {
    const alice = await addParticipant(fx.match.id, { username: 'Alice' });
    const bob = await addParticipant(fx.match.id, { username: 'Bob' });
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    await (new AIExtractor() as any).storeSuggestedPositions(db, sub.id, fx.match.id, { Alice: 2, Bob: 1 });
    const [row] = await pg().select().from(scorecardSubmissions);
    expect(row.suggested_positions).toEqual({ [alice.id]: 2, [bob.id]: 1 });
    expect(await pg().select().from(matchGamePlacements)).toHaveLength(0);
  });

  it('stores nothing when the positions are unusable', async () => {
    await addParticipant(fx.match.id, { username: 'Alice' });
    const sub = await addSubmission(fx.match.id, fx.matchGameId);
    await (new AIExtractor() as any).storeSuggestedPositions(db, sub.id, fx.match.id, { Alice: 1, Mallory: 1 });
    expect((await pg().select().from(scorecardSubmissions))[0].suggested_positions).toBeNull();
  });
});

describe('applyCarryOverAssignments', () => {
  it('re-applies the participant assigned to the same extracted name on an earlier map', async () => {
    const map2 = await addMatchGame(fx.match.id, 2, 'ongoing');
    const p = await addParticipant(fx.match.id);
    const early = await addSubmission(fx.match.id, fx.matchGameId);
    await addPlayerStat(early.id, fx.match.id, fx.matchGameId, { extracted_player_name: 'Ace', participant_id: p.id, assignment_status: 'assigned' });
    const late = await addSubmission(fx.match.id, map2);
    const fresh = await addPlayerStat(late.id, fx.match.id, map2, { extracted_player_name: 'Ace' });
    const other = await addPlayerStat(late.id, fx.match.id, map2, { extracted_player_name: 'Stranger' });

    await new AIExtractor().applyCarryOverAssignments(late.id, fx.match.id, map2);

    const rows = await pg().select().from(scorecardPlayerStats);
    expect(rows.find((r) => r.id === fresh.id)).toMatchObject({ participant_id: p.id, assignment_status: 'assigned' });
    expect(rows.find((r) => r.id === other.id)?.assignment_status).toBe('unassigned');
  });
});

// ─── The whole extraction flow ───────────────────────────────────────────────

const STAT_DEFS = [
  { id: 'kills', name: 'kills', display_name: 'Kills' },
  { id: 'deaths', name: 'deaths', display_name: 'Deaths' },
];

async function extractionSetup(opts: { teams?: boolean; providersConfig?: unknown } = {}) {
  await pg().insert(gameStatDefinitions).values(STAT_DEFS.map((d) => ({ ...d, game_id: fx.game.id })));
  await pg().insert(statsSettings).values({
    id: 1, enabled: true, ai_api_key: 'ak', google_api_key: 'gk',
    ai_providers_config: (opts.providersConfig ?? [{ instanceId: 'a', providerId: 'anthropic', model: 'sonnet', sortOrder: 0 }]) as never,
  });
  if (opts.teams !== false) await createMatchTeams(db, fx.match.id);
  const url = `/uploads/scorecards/${fx.match.id}/shot.png`;
  await putBlob(db, { path: url, kind: 'scorecard', contentType: 'image/png', data: PNG_BYTES, owner: { type: 'match', id: fx.match.id } });
  const sub = await addSubmission(fx.match.id, fx.matchGameId, { screenshot_url: url, team_side: 'blue' });
  const queueId = await enqueueStatsProcessing(db, { submissionId: sub.id, matchId: fx.match.id, matchGameId: fx.matchGameId });
  await claimJobs(db, 'statsProcessing', { limit: 1, workerId: 'test' });
  return { sub, queueId, url };
}
const job = async (id: string) => (await pg().select().from(statsProcessingQueue).where(eq(statsProcessingQueue.id, id)))[0];
const submission = async (id: string) => (await pg().select().from(scorecardSubmissions).where(eq(scorecardSubmissions.id, id)))[0];
const goodResponse = (players: unknown[]) => makeValidResponse(players);

describe('processSubmission', () => {
  it('extracts, stores player rows with team ids, auto-assigns by name, completes the job and flags unmatched players in the feed', async () => {
    const { sub, queueId } = await extractionSetup();
    const alice = await addParticipant(fx.match.id, { username: 'Alice' });
    providers.anthropic.mockResolvedValue(goodResponse([
      { playerName: 'Alice', teamSide: 'blue', stats: { kills: 10, deaths: 2 }, confidence: 0.95 },
      { playerName: 'Zorg', teamSide: 'red', stats: { kills: 3, deaths: 7 }, confidence: 0.9 },
      { playerName: 'Nobody', teamSide: 'unknown', stats: {}, confidence: 0.9 },
    ]));

    await new AIExtractor().processSubmission(sub.id, queueId);

    expect(providers.anthropic).toHaveBeenCalledTimes(1);
    const [apiKey, model, imageBase64, mime, prompt] = providers.anthropic.mock.calls[0];
    expect(apiKey).toBe('ak');
    expect(model).toBeTruthy();
    expect(Buffer.from(imageBase64, 'base64').equals(PNG_BYTES)).toBe(true);
    expect(mime).toBe('image/png');
    expect(prompt).toContain('Kills');

    const teams = await getMatchTeams(db, fx.match.id);
    const rows = await pg().select().from(scorecardPlayerStats);
    expect(rows).toHaveLength(3);
    const byName = Object.fromEntries(rows.map((r) => [r.extracted_player_name, r]));
    expect(byName.Alice).toMatchObject({ team_side: 'blue', team_id: teams.find((t) => t.team_order === 0)!.id, participant_id: alice.id, assignment_status: 'assigned', stats_json: { kills: 10, deaths: 2 }, confidence_score: 0.95 });
    expect(byName.Zorg).toMatchObject({ team_side: 'red', team_id: teams.find((t) => t.team_order === 1)!.id, participant_id: null, assignment_status: 'unassigned' });
    expect(byName.Nobody).toMatchObject({ team_side: null, team_id: null });

    expect(await submission(sub.id)).toMatchObject({ ai_extraction_status: 'completed' });
    expect((await submission(sub.id)).ai_raw_response).toContain('Zorg');
    expect(await job(queueId)).toMatchObject({ status: 'completed' });

    const feed = await pg().select().from(activityFeed);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ event_type: 'scorecard_player_matching_required', match_id: fx.match.id });
    expect(feed[0].metadata).toMatchObject({ submissionId: sub.id, unassignedCount: 2 });
  });

  it('creates no feed event when every player is auto-assigned', async () => {
    const { sub, queueId } = await extractionSetup();
    await addParticipant(fx.match.id, { username: 'Alice' });
    providers.anthropic.mockResolvedValue(goodResponse([{ playerName: 'Alice', teamSide: 'blue', stats: { kills: 1 }, confidence: 0.95 }]));
    await new AIExtractor().processSubmission(sub.id, queueId);
    expect(await pg().select().from(activityFeed)).toHaveLength(0);
  });

  it('creates only one matching feed event per match, even for two submissions extracted at the same time', async () => {
    const a = await extractionSetup();
    const map2 = await addMatchGame(fx.match.id, 2, 'ongoing');
    const url2 = `/uploads/scorecards/${fx.match.id}/shot2.png`;
    await putBlob(db, { path: url2, kind: 'scorecard', contentType: 'image/png', data: PNG_BYTES });
    const subB = await addSubmission(fx.match.id, map2, { screenshot_url: url2 });
    const queueB = await enqueueStatsProcessing(db, { submissionId: subB.id, matchId: fx.match.id, matchGameId: map2 });
    await claimJobs(db, 'statsProcessing', { limit: 1, workerId: 'test' });
    providers.anthropic.mockResolvedValue(goodResponse([{ playerName: 'Zorg', teamSide: 'red', stats: { kills: 1 }, confidence: 0.95 }]));

    await Promise.all([new AIExtractor().processSubmission(a.sub.id, a.queueId), new AIExtractor().processSubmission(subB.id, queueB)]);

    expect((await pg().select().from(scorecardPlayerStats))).toHaveLength(2);
    expect(await pg().select().from(activityFeed)).toHaveLength(1);
  });

  it('carries earlier assignments over to the new map', async () => {
    const { sub, queueId } = await extractionSetup();
    const map0 = await addMatchGame(fx.match.id, 2);
    const p = await addParticipant(fx.match.id, { username: 'Someone Else' });
    const earlier = await addSubmission(fx.match.id, map0, { created_at: new Date(Date.now() - 60_000) });
    await addPlayerStat(earlier.id, fx.match.id, map0, { extracted_player_name: 'Zorg', participant_id: p.id, assignment_status: 'assigned' });
    providers.anthropic.mockResolvedValue(goodResponse([{ playerName: 'Zorg', teamSide: 'red', stats: { kills: 1 }, confidence: 0.95 }]));

    await new AIExtractor().processSubmission(sub.id, queueId);

    const row = (await pg().select().from(scorecardPlayerStats).where(eq(scorecardPlayerStats.submission_id, sub.id)))[0];
    expect(row).toMatchObject({ participant_id: p.id, assignment_status: 'assigned' });
    expect(await pg().select().from(activityFeed)).toHaveLength(0);
  });

  it('falls through to the next provider when the first returns unusable data and logs it on the submission', async () => {
    const { sub, queueId } = await extractionSetup({ providersConfig: [
      { instanceId: 'a', providerId: 'anthropic', model: 'sonnet', sortOrder: 0 },
      { instanceId: 'g', providerId: 'google', model: 'gemini', sortOrder: 1 },
    ] });
    providers.anthropic.mockResolvedValue('this is not json');
    providers.google.mockResolvedValue(goodResponse([{ playerName: 'Zorg', teamSide: 'red', stats: { kills: 1 }, confidence: 0.95 }]));

    await new AIExtractor().processSubmission(sub.id, queueId);

    expect(providers.google).toHaveBeenCalledTimes(1);
    expect((await submission(sub.id)).ai_extraction_status).toBe('completed');
    const log = (await submission(sub.id)).ai_processing_log!;
    expect(log.map((l) => l.message)).toEqual([expect.stringContaining('Provider a: unusable data (invalid JSON)')]);
  });

  it('uses the best low-confidence result when no provider reaches 0.8', async () => {
    const { sub, queueId } = await extractionSetup({ providersConfig: [
      { instanceId: 'a', providerId: 'anthropic', model: 'sonnet', sortOrder: 0 },
      { instanceId: 'g', providerId: 'google', model: 'gemini', sortOrder: 1 },
    ] });
    providers.anthropic.mockResolvedValue(goodResponse([{ playerName: 'Weak', teamSide: 'blue', stats: { kills: 1 }, confidence: 0.55 }]));
    providers.google.mockResolvedValue(goodResponse([{ playerName: 'Better', teamSide: 'blue', stats: { kills: 1 }, confidence: 0.7 }]));
    await new AIExtractor().processSubmission(sub.id, queueId);
    expect((await pg().select().from(scorecardPlayerStats))[0].extracted_player_name).toBe('Better');
    expect((await submission(sub.id)).ai_extraction_status).toBe('completed');
  });

  it('stores the position suggestion for Position modes instead of team ids', async () => {
    const position = await pg().update(gameModes).set({ scoring_type: 'Position' }).returning();
    expect(position).toHaveLength(1);
    const { sub, queueId } = await extractionSetup({ teams: false });
    const alice = await addParticipant(fx.match.id, { username: 'Alice' });
    providers.anthropic.mockResolvedValue(goodResponse([{ playerName: 'Alice', position: 1, stats: { kills: 1 }, confidence: 0.95 }]));

    await new AIExtractor().processSubmission(sub.id, queueId);

    const row = (await pg().select().from(scorecardPlayerStats))[0];
    expect(row).toMatchObject({ team_id: null, team_side: null, participant_id: alice.id });
    expect((await submission(sub.id)).suggested_positions).toEqual({ [alice.id]: 1 });
  });

  it('a failure schedules a retry (job back to pending, submission retrying) and leaves no partial rows', async () => {
    const { sub, queueId } = await extractionSetup();
    providers.anthropic.mockRejectedValue(new Error('provider down'));

    await new AIExtractor().processSubmission(sub.id, queueId);

    expect(await job(queueId)).toMatchObject({ status: 'pending' });
    expect((await job(queueId)).last_error).toMatch(/provider down/);
    expect(await submission(sub.id)).toMatchObject({ ai_extraction_status: 'retrying' });
    expect((await submission(sub.id)).ai_error_message).toMatch(/provider down/);
    expect(await pg().select().from(scorecardPlayerStats)).toHaveLength(0);
    expect(await pg().select().from(activityFeed)).toHaveLength(0);
  });

  it('marks the submission and job failed and logs an ai_error feed event once the attempts are used up', async () => {
    const { sub, queueId } = await extractionSetup();
    await pg().update(statsProcessingQueue).set({ max_attempts: 1 }).where(eq(statsProcessingQueue.id, queueId));
    providers.anthropic.mockRejectedValue(new Error('provider down'));

    await new AIExtractor().processSubmission(sub.id, queueId);

    expect(await job(queueId)).toMatchObject({ status: 'failed' });
    expect(await submission(sub.id)).toMatchObject({ ai_extraction_status: 'failed' });
    const [ev] = await pg().select().from(activityFeed);
    expect(ev).toMatchObject({ event_type: 'ai_error', match_id: fx.match.id });
    expect(ev.metadata).toMatchObject({ submissionId: sub.id, error: expect.stringContaining('provider down') });
  });

  it('fails when the screenshot blob is missing', async () => {
    const { sub, queueId } = await extractionSetup();
    await pg().update(scorecardSubmissions).set({ screenshot_url: '/uploads/scorecards/none.png' }).where(eq(scorecardSubmissions.id, sub.id));
    await new AIExtractor().processSubmission(sub.id, queueId);
    expect((await submission(sub.id)).ai_error_message).toMatch(/Screenshot not found/);
    expect(providers.anthropic).not.toHaveBeenCalled();
  });

  it('fails when the game has no stat definitions or no provider is enabled', async () => {
    await pg().insert(statsSettings).values({ id: 1, enabled: true, ai_providers_config: [] as never });
    const url = `/uploads/scorecards/${fx.match.id}/x.png`;
    await putBlob(db, { path: url, kind: 'scorecard', contentType: 'image/png', data: PNG_BYTES });
    const sub = await addSubmission(fx.match.id, fx.matchGameId, { screenshot_url: url });
    const q1 = await enqueueStatsProcessing(db, { submissionId: sub.id, matchId: fx.match.id, matchGameId: fx.matchGameId });
    await claimJobs(db, 'statsProcessing', { limit: 1, workerId: 'test' });
    await new AIExtractor().processSubmission(sub.id, q1);
    expect((await submission(sub.id)).ai_error_message).toMatch(/No stat definitions found/);

    await pg().insert(gameStatDefinitions).values(STAT_DEFS.map((d) => ({ ...d, game_id: fx.game.id })));
    await pg().update(statsProcessingQueue).set({ status: 'processing' }).where(eq(statsProcessingQueue.id, q1));
    await new AIExtractor().processSubmission(sub.id, q1);
    expect((await submission(sub.id)).ai_error_message).toBe('No AI providers enabled');
  });

  it('fails when the submission or match does not exist', async () => {
    await new AIExtractor().processSubmission('missing', 'also-missing'); // must not throw
    expect(await pg().select().from(matchParticipants)).toHaveLength(0);
  });
});
