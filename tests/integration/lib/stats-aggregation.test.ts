import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aggregateMatchStats } from '../../../src/lib/stats-aggregation';
import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch, createMatchParticipant } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

describe('aggregateMatchStats', () => {
  let db: any;
  let game: any;
  let mode: any;

  beforeEach(async () => {
    db = getTestDb();
    const testData = await seedBasicTestData();
    game = testData.game;
    mode = testData.mode;
  });

  async function insertSubmission(id: string, matchId: string, matchGameId: string, reviewStatus: string) {
    await db.run(
      `INSERT INTO scorecard_submissions
         (id, match_id, match_game_id, team_side, screenshot_url, review_status)
       VALUES (?, ?, ?, 'blue', 'http://example.com/screenshot.png', ?)`,
      [id, matchId, matchGameId, reviewStatus]
    );
  }

  async function insertPlayerStats(
    id: string,
    submissionId: string,
    matchId: string,
    matchGameId: string,
    participantId: string,
    statsJson: string
  ) {
    await db.run(
      `INSERT INTO scorecard_player_stats
         (id, submission_id, match_id, match_game_id, participant_id, extracted_player_name, stats_json)
       VALUES (?, ?, ?, ?, ?, 'Test Player', ?)`,
      [id, submissionId, matchId, matchGameId, participantId, statsJson]
    );
  }

  it('returns 0 and writes nothing when no approved submissions exist', async () => {
    const match = await createMatch(game.id, mode.id);
    const participant = await createMatchParticipant(match.id, 'discord-1', 'Player1');
    await insertSubmission('sub-pending', match.id, 'game-1', 'pending');
    await insertPlayerStats('ps-pending', 'sub-pending', match.id, 'game-1', participant.id, '{"kills": 5}');

    const count = await aggregateMatchStats(db, match.id);

    expect(count).toBe(0);
    const rows = await db.all(`SELECT * FROM match_player_stats WHERE match_id = ?`, [match.id]);
    expect(rows).toHaveLength(0);
  });

  it('returns 0 when approved submission has no participant_id assigned', async () => {
    const match = await createMatch(game.id, mode.id);
    await insertSubmission('sub-unassigned', match.id, 'game-1', 'approved');
    await db.run(
      `INSERT INTO scorecard_player_stats
         (id, submission_id, match_id, match_game_id, participant_id, extracted_player_name, stats_json)
       VALUES ('ps-unassigned', 'sub-unassigned', ?, 'game-1', NULL, 'Unknown', '{"kills": 3}')`,
      [match.id]
    );

    const count = await aggregateMatchStats(db, match.id);
    expect(count).toBe(0);
  });

  it('aggregates stats for a single participant across two maps', async () => {
    const match = await createMatch(game.id, mode.id);
    const participant = await createMatchParticipant(match.id, 'discord-2', 'Player2');

    await insertSubmission('sub-map1', match.id, 'game-map1', 'approved');
    await insertSubmission('sub-map2', match.id, 'game-map2', 'auto_approved');

    await insertPlayerStats('ps-map1', 'sub-map1', match.id, 'game-map1', participant.id,
      JSON.stringify({ kills: 10, deaths: 2 }));
    await insertPlayerStats('ps-map2', 'sub-map2', match.id, 'game-map2', participant.id,
      JSON.stringify({ kills: 8, deaths: 3 }));

    const count = await aggregateMatchStats(db, match.id);

    expect(count).toBe(1);
    const row = await db.get(
      `SELECT * FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
      [match.id, participant.id]
    );
    expect(row).toBeTruthy();
    expect(row.maps_played).toBe(2);
    const stats = JSON.parse(row.total_stats_json);
    expect(stats.kills).toBe(18);
    expect(stats.deaths).toBe(5);
  });

  it('returns one row per participant for multiple participants', async () => {
    const match = await createMatch(game.id, mode.id);
    const p1 = await createMatchParticipant(match.id, 'discord-p1', 'PlayerA');
    const p2 = await createMatchParticipant(match.id, 'discord-p2', 'PlayerB');

    await insertSubmission('sub-multi', match.id, 'game-multi', 'approved');
    await insertPlayerStats('ps-p1', 'sub-multi', match.id, 'game-multi', p1.id,
      JSON.stringify({ kills: 5 }));
    await insertPlayerStats('ps-p2', 'sub-multi', match.id, 'game-multi', p2.id,
      JSON.stringify({ kills: 7 }));

    const count = await aggregateMatchStats(db, match.id);

    expect(count).toBe(2);
    const rows = await db.all(
      `SELECT participant_id FROM match_player_stats WHERE match_id = ?`,
      [match.id]
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.participant_id)).toContain(p1.id);
    expect(rows.map((r: any) => r.participant_id)).toContain(p2.id);
  });

  it('updates existing match_player_stats row on a second call (ON CONFLICT)', async () => {
    const match = await createMatch(game.id, mode.id);
    const participant = await createMatchParticipant(match.id, 'discord-oc', 'OCPlayer');

    await insertSubmission('sub-oc', match.id, 'game-oc', 'approved');
    await insertPlayerStats('ps-oc', 'sub-oc', match.id, 'game-oc', participant.id,
      JSON.stringify({ kills: 4 }));

    await aggregateMatchStats(db, match.id);
    await aggregateMatchStats(db, match.id);

    const rows = await db.all(
      `SELECT * FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
      [match.id, participant.id]
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].total_stats_json).kills).toBe(4);
  });

  it('skips non-numeric stat values gracefully', async () => {
    const match = await createMatch(game.id, mode.id);
    const participant = await createMatchParticipant(match.id, 'discord-nn', 'NNPlayer');

    await insertSubmission('sub-nn', match.id, 'game-nn', 'approved');
    await insertPlayerStats('ps-nn', 'sub-nn', match.id, 'game-nn', participant.id,
      JSON.stringify({ kills: 6, hero: 'Tracer', winRate: null }));

    const count = await aggregateMatchStats(db, match.id);

    expect(count).toBe(1);
    const row = await db.get(
      `SELECT total_stats_json FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
      [match.id, participant.id]
    );
    const stats = JSON.parse(row.total_stats_json);
    expect(stats.kills).toBe(6);
    expect(stats.hero).toBeUndefined();
    expect(stats.winRate).toBeUndefined();
  });

  it('skips rows with malformed stats_json without throwing', async () => {
    const match = await createMatch(game.id, mode.id);
    const participant = await createMatchParticipant(match.id, 'discord-bad', 'BadPlayer');

    await insertSubmission('sub-bad', match.id, 'game-bad', 'approved');
    await db.run(
      `INSERT INTO scorecard_player_stats
         (id, submission_id, match_id, match_game_id, participant_id, extracted_player_name, stats_json)
       VALUES ('ps-bad', 'sub-bad', ?, 'game-bad', ?, 'BadPlayer', 'this is not json')`,
      [match.id, participant.id]
    );

    await expect(aggregateMatchStats(db, match.id)).resolves.toBe(1);

    const row = await db.get(
      `SELECT total_stats_json FROM match_player_stats WHERE match_id = ?`,
      [match.id]
    );
    expect(JSON.parse(row.total_stats_json)).toEqual({});
  });

  it('includes auto_approved submissions but excludes pending and rejected', async () => {
    const match = await createMatch(game.id, mode.id);
    const participant = await createMatchParticipant(match.id, 'discord-status', 'StatusPlayer');

    await insertSubmission('sub-approved', match.id, 'game-status', 'approved');
    await insertSubmission('sub-auto', match.id, 'game-status-2', 'auto_approved');
    await insertSubmission('sub-rejected', match.id, 'game-status-3', 'rejected');
    await insertSubmission('sub-pend', match.id, 'game-status-4', 'pending');

    await insertPlayerStats('ps-a', 'sub-approved', match.id, 'game-status', participant.id,
      JSON.stringify({ kills: 3 }));
    await insertPlayerStats('ps-aa', 'sub-auto', match.id, 'game-status-2', participant.id,
      JSON.stringify({ kills: 5 }));
    await insertPlayerStats('ps-rej', 'sub-rejected', match.id, 'game-status-3', participant.id,
      JSON.stringify({ kills: 10 }));
    await insertPlayerStats('ps-pend', 'sub-pend', match.id, 'game-status-4', participant.id,
      JSON.stringify({ kills: 20 }));

    await aggregateMatchStats(db, match.id);

    const row = await db.get(
      `SELECT total_stats_json, maps_played FROM match_player_stats WHERE match_id = ? AND participant_id = ?`,
      [match.id, participant.id]
    );
    const stats = JSON.parse(row.total_stats_json);
    expect(stats.kills).toBe(8);
    expect(row.maps_played).toBe(2);
  });
});
