import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch, createMatchParticipant, createGameMode } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as submitResult } from '@/app/api/matches/[matchId]/games/[gameId]/result/route';

type Row = Record<string, any>;

describe('Match result API validation', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  async function setup(status = 'battle', modeId = mode.id) {
    const db = getTestDb();
    const match = await createMatch(game.id, modeId, { status });
    const t0 = `${match.id}_t0`;
    const t1 = `${match.id}_t1`;
    await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, 'Alpha', 0, 0)`, [t0, match.id]);
    await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, 'Beta', 1, 0)`, [t1, match.id]);
    const reserve = `${match.id}_res`;
    await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, 'Reserve', 99, 1)`, [reserve, match.id]);
    const gameId = `${match.id}_game_1`;
    await db.run(`INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'ongoing')`, [gameId, match.id]);
    await db.run(`INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 2, 'pending')`, [`${match.id}_game_2`, match.id]);
    return { matchId: match.id, gameId, t0, t1, reserve };
  }

  async function post(matchId: string, gameId: string, body: unknown) {
    const req = createMockRequest('POST', `/api/matches/${matchId}/games/${gameId}/result`, body as any);
    return parseResponse(await submitResult(req, createRouteParams({ matchId, gameId })));
  }

  it('returns 400 for invalid JSON', async () => {
    const { matchId, gameId } = await setup();
    const req = new Request('http://localhost', { method: 'POST', body: '{not json' }) as any;
    const res = await submitResult(req, createRouteParams({ matchId, gameId }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the game does not belong to the match', async () => {
    const a = await setup();
    const b = await setup();
    const { status } = await post(a.matchId, b.gameId, { type: 'Normal', matchId: a.matchId, gameId: b.gameId, winnerTeamId: a.t0 });
    expect(status).toBe(404);
  });

  it('returns 404 for an unknown game and creates no row', async () => {
    const { matchId } = await setup();
    const { status } = await post(matchId, 'bogus-game', { matchId, gameId: 'bogus-game', winner: 'team1' });
    expect(status).toBe(404);
    expect(await getTestDb().get(`SELECT id FROM match_games WHERE id = 'bogus-game'`)).toBeUndefined();
  });

  it('returns 400 when the match is cancelled or not yet in battle', async () => {
    for (const st of ['cancelled', 'created', 'assign']) {
      const { matchId, gameId } = await setup(st);
      const { status } = await post(matchId, gameId, { matchId, gameId, winner: 'team1' });
      expect(status).toBe(400);
    }
  });

  it('rejects a completed match unless rescore is set', async () => {
    const { matchId, gameId, t0 } = await setup('complete');
    const denied = await post(matchId, gameId, { type: 'Normal', matchId, gameId, winnerTeamId: t0 });
    expect(denied.status).toBe(400);
    const ok = await post(matchId, gameId, { type: 'Normal', matchId, gameId, winnerTeamId: t0, rescore: true });
    expect(ok.status).toBe(200);
  });

  it('rejects a winnerTeamId from another match, an unknown team, and the reserve team', async () => {
    const a = await setup();
    const b = await setup();
    for (const teamId of [b.t0, 'nope', a.reserve]) {
      const { status } = await post(a.matchId, a.gameId, { type: 'Normal', matchId: a.matchId, gameId: a.gameId, winnerTeamId: teamId });
      expect(status).toBe(400);
    }
  });

  it('derives the legacy winner from team_order and uses the real team name', async () => {
    const { matchId, gameId, t1 } = await setup();
    const { status, data } = await post(matchId, gameId, { type: 'Normal', matchId, gameId, winnerTeamId: t1 });
    expect(status).toBe(200);
    expect(data.message).toBe('Beta wins!');
    const row = await getTestDb().get<Row>(`SELECT winner_id FROM match_games WHERE id = ?`, [gameId]);
    expect(row?.winner_id).toBe('team2');
  });

  it('a 3rd-team winner is not recorded as team1', async () => {
    const { matchId, gameId } = await setup();
    const t2 = `${matchId}_t2`;
    await getTestDb().run(`INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, 'Gamma', 2, 0)`, [t2, matchId]);
    const { status } = await post(matchId, gameId, { type: 'Normal', matchId, gameId, winnerTeamId: t2 });
    expect(status).toBe(200);
    const row = await getTestDb().get<Row>(`SELECT winner_id FROM match_games WHERE id = ?`, [gameId]);
    expect(row?.winner_id).toBeNull();
    const q = await getTestDb().get<Row>(`SELECT winner, winning_team_name FROM discord_score_notification_queue WHERE match_id = ?`, [matchId]);
    expect(q).toMatchObject({ winner: 'team', winning_team_name: 'Gamma' });
  });

  it('accepts a draw and leaves no winner row', async () => {
    const { matchId, gameId } = await setup();
    const { status } = await post(matchId, gameId, { type: 'Normal', matchId, gameId, draw: true });
    expect(status).toBe(200);
    const winners = await getTestDb().all<Row>(`SELECT * FROM match_game_placements WHERE match_game_id = ? AND is_winner = 1`, [gameId]);
    expect(winners).toHaveLength(0);
  });

  describe('FFA / Position', () => {
    it('rejects an FFA winner that is not a participant of this match', async () => {
      const ffa = await createGameMode(game.id, { scoring_type: 'FFA', name: 'FFA Mode' });
      const a = await setup('battle', ffa.id);
      const b = await setup('battle', ffa.id);
      const outsider = await createMatchParticipant(b.matchId, 'x', 'Outsider');
      const { status } = await post(a.matchId, a.gameId, { type: 'FFA', matchId: a.matchId, gameId: a.gameId, winnerParticipantId: outsider.id });
      expect(status).toBe(400);
    });

    it('rejects Position results with foreign ids, non-positive or duplicate positions', async () => {
      const pos = await createGameMode(game.id, { scoring_type: 'Position', name: 'Race' });
      const a = await setup('battle', pos.id);
      const b = await setup('battle', pos.id);
      const p1 = await createMatchParticipant(a.matchId, 'u1', 'One');
      const p2 = await createMatchParticipant(a.matchId, 'u2', 'Two');
      const foreign = await createMatchParticipant(b.matchId, 'u3', 'Foreign');
      const send = (positionResults: Record<string, number>) =>
        post(a.matchId, a.gameId, { type: 'Position', matchId: a.matchId, gameId: a.gameId, positionResults });

      expect((await send({ [p1.id]: 1, [foreign.id]: 2 })).status).toBe(400);
      expect((await send({ [p1.id]: 0, [p2.id]: 1 })).status).toBe(400);
      expect((await send({ [p1.id]: 1.5, [p2.id]: 2 })).status).toBe(400);
      expect((await send({ [p1.id]: 1, [p2.id]: 1 })).status).toBe(400);
      expect((await send({ [p1.id]: 1, [p2.id]: 2 })).status).toBe(200);
    });

    it('rejects a result type that does not match the game mode', async () => {
      const { matchId, gameId } = await setup();
      const p = await createMatchParticipant(matchId, 'u1', 'One');
      const { status } = await post(matchId, gameId, { type: 'FFA', matchId, gameId, winnerParticipantId: p.id });
      expect(status).toBe(400);
    });
  });
});
