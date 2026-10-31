/**
 * Scoring lifecycle per scoring_type (Normal / FFA / Position).
 *
 * Drives matches through the REAL routes (create -> gather -> assign -> battle -> score)
 * with nothing mocked in the scoring path. These tests exist because match-level scoring
 * (winner, overall score, team setup) resolves the scoring type through matches.mode_id,
 * and POST /api/matches once left that NULL, silently turning every FFA/Position match
 * into a Normal one with no winner. Unit tests on the scoring functions could not see it
 * because they seed mode_id by hand.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { createGame, createGameMode } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as createMatch } from '@/app/api/matches/route';
import { POST as transitionMatch } from '@/app/api/matches/[matchId]/transition/route';
import { POST as assignTeams } from '@/app/api/matches/[matchId]/assign-teams/route';
import { POST as saveResult } from '@/app/api/matches/[matchId]/games/[gameId]/result/route';
import { GET as getOverallScore } from '@/app/api/matches/[matchId]/overall-score/route';

type ScoringType = 'Normal' | 'FFA' | 'Position';

interface Setup {
  matchId: string;
  gameIds: string[];
  participantIds: string[];
}

let gameId: string;
let db: ReturnType<typeof getTestDb>;
let seq = 0;

async function createModeWithMaps(scoringType: ScoringType, mapCount: number): Promise<{ modeId: string; mapIds: string[] }> {
  const mode = await createGameMode(gameId, {
    scoring_type: scoringType,
    name: `${scoringType} mode`,
    // team_size > 1 turns a Position mode into team-endurance; these tests cover individual racing.
    team_size: scoringType === 'Normal' ? 5 : 1,
  });
  const mapIds: string[] = [];
  for (let i = 0; i < mapCount; i++) {
    const id = `map-${scoringType.toLowerCase()}-${++seq}`;
    await db.run(`INSERT INTO game_maps (id, game_id, mode_id, name) VALUES (?, ?, ?, ?)`, [id, gameId, mode.id, `Map ${id}`]);
    mapIds.push(id);
  }
  return { modeId: mode.id, mapIds };
}

async function post(matchId: string, newStatus: string) {
  return parseResponse(await transitionMatch(
    createMockRequest('POST', `/api/matches/${matchId}/transition`, { newStatus }),
    createRouteParams({ matchId })
  ));
}

async function setupMatch(
  scoringType: ScoringType,
  opts: { maps?: number; players?: number; extra?: Record<string, unknown> } = {}
): Promise<Setup & { modeId: string }> {
  const { modeId, mapIds } = await createModeWithMaps(scoringType, opts.maps ?? 1);
  const created = await parseResponse(await createMatch(createMockRequest('POST', '/api/matches', {
    name: `${scoringType} match`,
    gameId,
    maps: mapIds,
    rounds: mapIds.length,
    startDate: new Date().toISOString(),
    ...opts.extra,
  })));
  expect(created.status).toBe(201);
  const matchId: string = created.data.id;

  const participantIds: string[] = [];
  for (let i = 0; i < (opts.players ?? 4); i++) {
    const id = `${matchId}-p${i}`;
    await db.run(
      `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
      [id, matchId, `user-${matchId}-${i}`, `d${i}`, `Player${i}`]
    );
    participantIds.push(id);
  }
  return { matchId, gameIds: [], participantIds, modeId };
}

async function toBattle(matchId: string, teamAssignments?: Array<{ participantId: string; teamId: string }>) {
  expect((await post(matchId, 'gather')).status).toBe(200);
  expect((await post(matchId, 'assign')).status).toBe(200);
  if (teamAssignments) {
    const res = await parseResponse(await assignTeams(
      createMockRequest('POST', `/api/matches/${matchId}/assign-teams`, { teamAssignments }),
      createRouteParams({ matchId })
    ));
    expect(res.status).toBe(200);
  }
  expect((await post(matchId, 'battle')).status).toBe(200);
  const games = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ? ORDER BY round`, [matchId]);
  return games.map(g => g.id);
}

async function score(matchId: string, gId: string, body: Record<string, unknown>) {
  return parseResponse(await saveResult(
    createMockRequest('POST', `/api/matches/${matchId}/games/${gId}/result`, body),
    createRouteParams({ matchId, gameId: gId })
  ));
}

const matchRow = (matchId: string) =>
  db.get<{ status: string; winner_team: string | null; mode_id: string | null }>(
    `SELECT status, winner_team, mode_id FROM matches WHERE id = ?`, [matchId]
  );

describe('Scoring lifecycle by scoring_type', () => {
  beforeEach(async () => {
    db = getTestDb();
    gameId = (await createGame()).id;
  });

  describe('POST /api/matches', () => {
    it('sets mode_id from the selected maps', async () => {
      const { matchId, modeId } = await setupMatch('Position');
      expect((await matchRow(matchId))?.mode_id).toBe(modeId);
    });

    it('resolves mode_id when map ids carry the UI timestamp/random suffix', async () => {
      const { modeId, mapIds } = await createModeWithMaps('FFA', 1);
      const res = await parseResponse(await createMatch(createMockRequest('POST', '/api/matches', {
        name: 'Suffixed', gameId, maps: [`${mapIds[0]}-1793410040191-umuprdq78`],
        startDate: new Date().toISOString(),
      })));
      expect(res.status).toBe(201);
      expect(res.data.mode_id).toBe(modeId);
    });

    it('rejects maps from different scoring types', async () => {
      const a = await createModeWithMaps('Normal', 1);
      const b = await createModeWithMaps('FFA', 1);
      const res = await parseResponse(await createMatch(createMockRequest('POST', '/api/matches', {
        name: 'Mixed', gameId, maps: [a.mapIds[0], b.mapIds[0]], startDate: new Date().toISOString(),
      })));
      expect(res.status).toBe(400);
    });

    it('returns 400 (not 500) when startDate is missing', async () => {
      const res = await parseResponse(await createMatch(createMockRequest('POST', '/api/matches', {
        name: 'No date', gameId,
      })));
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/startDate/);
    });

    it('returns 400 for a malformed positionScoringOverride', async () => {
      const res = await parseResponse(await createMatch(createMockRequest('POST', '/api/matches', {
        name: 'Bad spread', gameId, startDate: new Date().toISOString(), positionScoringOverride: { first: 'lots' },
      })));
      expect(res.status).toBe(400);
    });
  });

  describe('migration 027 (backfill mode_id)', () => {
    it('backfills mode_id for matches created before the fix', async () => {
      const { modeId, mapIds } = await createModeWithMaps('Position', 1);
      await db.run(
        `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, maps)
         VALUES ('legacy-1', ?, NULL, 'Legacy', datetime('now'), datetime('now'), 'created', ?)`,
        [gameId, JSON.stringify([`${mapIds[0]}-1793410040191-umuprdq78`])]
      );
      await db.run(
        `INSERT INTO matches (id, game_id, mode_id, name, start_date, start_time, status, maps)
         VALUES ('legacy-2', ?, NULL, 'Legacy no maps', datetime('now'), datetime('now'), 'created', NULL)`,
        [gameId]
      );
      const sql = fs.readFileSync(path.join(process.cwd(), 'migrations', 'legacy-sqlite', '027_backfill_match_mode_id.sql'), 'utf8');
      await db.exec(sql);
      expect((await matchRow('legacy-1'))?.mode_id).toBe(modeId);
      expect((await matchRow('legacy-2'))?.mode_id).toBeNull();
    });
  });

  describe('Normal', () => {
    async function normalMatch(maps = 3) {
      const s = await setupMatch('Normal', { maps, players: 4 });
      expect((await post(s.matchId, 'gather')).status).toBe(200);
      expect((await post(s.matchId, 'assign')).status).toBe(200);
      const teams = await db.all<{ id: string }>(
        `SELECT id FROM match_teams WHERE match_id = ? AND is_reserve = 0 ORDER BY team_order`, [s.matchId]
      );
      expect(teams).toHaveLength(2);
      const assignRes = await parseResponse(await assignTeams(
        createMockRequest('POST', `/api/matches/${s.matchId}/assign-teams`, {
          teamAssignments: s.participantIds.map((participantId, i) => ({ participantId, teamId: teams[i % 2].id })),
        }),
        createRouteParams({ matchId: s.matchId })
      ));
      expect(assignRes.status).toBe(200);
      expect((await post(s.matchId, 'battle')).status).toBe(200);
      const gameIds = (await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ? ORDER BY round`, [s.matchId])).map(g => g.id);
      return { ...s, gameIds, teams: teams.map(t => t.id) };
    }

    it('completes a best-of-3, stores both scores, and names the winning match_team', async () => {
      const m = await normalMatch(3);
      const first = await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0], winnerScore: 13, loserScore: 7 });
      expect(first.status).toBe(200);

      const g1 = await db.all<{ entity_id: string; score: number | null; is_winner: number }>(
        `SELECT entity_id, score, is_winner FROM match_game_placements WHERE match_game_id = ?`, [m.gameIds[0]]
      );
      expect(g1.find(p => p.entity_id === m.teams[0])).toMatchObject({ score: 13, is_winner: 1 });
      // loserScore without loserTeamId must still be attributed in a 2-team match
      expect(g1.find(p => p.entity_id === m.teams[1])).toMatchObject({ score: 7, is_winner: 0 });
      const legacy = await db.get<{ score_a: number; score_b: number }>(
        `SELECT score_a, score_b FROM match_games WHERE id = ?`, [m.gameIds[0]]
      );
      expect(legacy).toEqual({ score_a: 13, score_b: 7 });

      await score(m.matchId, m.gameIds[1], { winnerTeamId: m.teams[1], winnerScore: 13, loserScore: 11 });
      await score(m.matchId, m.gameIds[2], { winnerTeamId: m.teams[0], winnerScore: 13, loserScore: 2 });

      const row = await matchRow(m.matchId);
      expect(row?.status).toBe('complete');
      expect(row?.winner_team).toBe(m.teams[0]);

      const overall = await parseResponse(await getOverallScore(
        createMockRequest('GET', `/api/matches/${m.matchId}/overall-score`), createRouteParams({ matchId: m.matchId })
      ));
      expect(overall.data).toMatchObject({ scoringType: 'Normal', team1Wins: 2, team2Wins: 1, overallWinnerTeamId: m.teams[0] });
    });

    it('does not keep a loserScore it cannot attribute when 3+ teams exist', async () => {
      const s = await setupMatch('Normal', { maps: 1, players: 3, extra: { teamCount: 3 } });
      expect((await post(s.matchId, 'gather')).status).toBe(200);
      await post(s.matchId, 'assign');
      const teams = await db.all<{ id: string }>(
        `SELECT id FROM match_teams WHERE match_id = ? AND is_reserve = 0 ORDER BY team_order`, [s.matchId]
      );
      expect(teams).toHaveLength(3);
      await post(s.matchId, 'battle');
      const [g] = await db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ?`, [s.matchId]);
      expect((await score(s.matchId, g.id, { winnerTeamId: teams[0].id, winnerScore: 5, loserScore: 1 })).status).toBe(200);
      const rows = await db.all<{ score: number | null }>(
        `SELECT score FROM match_game_placements WHERE match_game_id = ? AND is_winner = 0`, [g.id]
      );
      expect(rows.every(r => r.score === null)).toBe(true);
    });

    it('refuses a second submission for a scored map unless rescore is set', async () => {
      const m = await normalMatch(2);
      expect((await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0] })).status).toBe(200);

      const dup = await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[1] });
      expect(dup.status).toBe(409);
      // the original result is untouched
      const winner = await db.get<{ entity_id: string }>(
        `SELECT entity_id FROM match_game_placements WHERE match_game_id = ? AND is_winner = 1`, [m.gameIds[0]]
      );
      expect(winner?.entity_id).toBe(m.teams[0]);

      const fixed = await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[1], rescore: true });
      expect(fixed.status).toBe(200);
      const after = await db.get<{ entity_id: string }>(
        `SELECT entity_id FROM match_game_placements WHERE match_game_id = ? AND is_winner = 1`, [m.gameIds[0]]
      );
      expect(after?.entity_id).toBe(m.teams[1]);
    });

    it('recomputes winner_team when a completed match is rescored', async () => {
      const m = await normalMatch(1);
      await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0] });
      expect((await matchRow(m.matchId))?.winner_team).toBe(m.teams[0]);
      await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[1], rescore: true });
      expect((await matchRow(m.matchId))?.winner_team).toBe(m.teams[1]);
    });

    it('cannot complete early, and rejects a team from another match', async () => {
      const m = await normalMatch(2);
      await score(m.matchId, m.gameIds[0], { winnerTeamId: m.teams[0] });
      expect((await post(m.matchId, 'complete')).status).toBe(400);
      expect((await score(m.matchId, m.gameIds[1], { winnerTeamId: 'nope' })).status).toBe(400);
    });
  });

  describe('FFA', () => {
    it('resolves as FFA at match level, builds per-participant teams, and crowns the top scorer', async () => {
      const s = await setupMatch('FFA', { maps: 2, players: 4 });
      const gameIds = await toBattle(s.matchId);

      // not a Blue/Red match
      const teams = await db.all<{ team_name: string }>(
        `SELECT team_name FROM match_teams WHERE match_id = ? AND is_reserve = 0`, [s.matchId]
      );
      expect(teams.map(t => t.team_name)).not.toContain('Blue');
      expect(teams).toHaveLength(s.participantIds.length);

      for (const g of gameIds) {
        const res = await score(s.matchId, g, { type: 'FFA', matchId: s.matchId, gameId: g, winnerParticipantId: s.participantIds[2] });
        expect(res.status).toBe(200);
      }

      const row = await matchRow(s.matchId);
      expect(row?.status).toBe('complete');
      expect(row?.winner_team).toBe(s.participantIds[2]);

      const overall = await parseResponse(await getOverallScore(
        createMockRequest('GET', `/api/matches/${s.matchId}/overall-score`), createRouteParams({ matchId: s.matchId })
      ));
      expect(overall.data.scoringType).toBe('FFA');
    });

    it('leaves winner_team null on a tied FFA match', async () => {
      const s = await setupMatch('FFA', { maps: 2, players: 3 });
      const [g1, g2] = await toBattle(s.matchId);
      await score(s.matchId, g1, { type: 'FFA', matchId: s.matchId, gameId: g1, winnerParticipantId: s.participantIds[0] });
      await score(s.matchId, g2, { type: 'FFA', matchId: s.matchId, gameId: g2, winnerParticipantId: s.participantIds[1] });
      const row = await matchRow(s.matchId);
      expect(row?.status).toBe('complete');
      expect(row?.winner_team).toBeNull();
    });

    it('rejects a Normal-style result for an FFA map', async () => {
      const s = await setupMatch('FFA', { maps: 1, players: 2 });
      const [g] = await toBattle(s.matchId);
      expect((await score(s.matchId, g, { winnerTeamId: 'x' })).status).toBe(400);
    });
  });

  describe('Position', () => {
    const positions = (ids: string[], order: number[]) =>
      Object.fromEntries(order.map((idx, k) => [ids[idx], k + 1]));

    async function race(s: Setup, gId: string, order: number[]) {
      return score(s.matchId, gId, {
        type: 'Position', matchId: s.matchId, gameId: gId, positionResults: positions(s.participantIds, order),
      });
    }

    it('awards points from the default spread when no spread is configured', async () => {
      const s = await setupMatch('Position', { maps: 2, players: 4 });
      const [g1, g2] = await toBattle(s.matchId);
      expect((await race(s, g1, [2, 0, 1, 3])).status).toBe(200);

      const pts = await db.all<{ entity_id: string; points_awarded: number }>(
        `SELECT entity_id, points_awarded FROM match_game_placements WHERE match_game_id = ? ORDER BY position`, [g1]
      );
      expect(pts.map(p => p.points_awarded)).toEqual([25, 18, 15, 12]);

      await race(s, g2, [2, 1, 0, 3]);
      const row = await matchRow(s.matchId);
      expect(row?.status).toBe('complete');
      // p2: 25+25 = 50 beats everyone
      expect(row?.winner_team).toBe(s.participantIds[2]);

      const overall = await parseResponse(await getOverallScore(
        createMockRequest('GET', `/api/matches/${s.matchId}/overall-score`), createRouteParams({ matchId: s.matchId })
      ));
      expect(overall.data.scoringType).toBe('Position');
    });

    it('honours the flat per-match override sent by the create form', async () => {
      const s = await setupMatch('Position', { maps: 1, players: 3, extra: { positionScoringOverride: { '1': 100, '2': 50, '3': 1 } } });
      const [g] = await toBattle(s.matchId);
      expect((await race(s, g, [1, 2, 0])).status).toBe(200);
      const pts = await db.all<{ points_awarded: number }>(
        `SELECT points_awarded FROM match_game_placements WHERE match_game_id = ? ORDER BY position`, [g]
      );
      expect(pts.map(p => p.points_awarded)).toEqual([100, 50, 1]);
    });

    it('honours the { type, pointsPerPosition } override form', async () => {
      const s = await setupMatch('Position', {
        maps: 1, players: 2,
        extra: { positionScoringOverride: { type: 'Position', pointsPerPosition: { '1': 7, '2': 3 } } },
      });
      const [g] = await toBattle(s.matchId);
      await race(s, g, [0, 1]);
      const pts = await db.all<{ points_awarded: number }>(
        `SELECT points_awarded FROM match_game_placements WHERE match_game_id = ? ORDER BY position`, [g]
      );
      expect(pts.map(p => p.points_awarded)).toEqual([7, 3]);
    });

    it('prefers the match override over the game scoring_config', async () => {
      await db.run(`UPDATE games SET scoring_config = ? WHERE id = ?`,
        [JSON.stringify({ type: 'Position', pointsPerPosition: { '1': 9, '2': 8 } }), gameId]);
      const s = await setupMatch('Position', { maps: 1, players: 2, extra: { positionScoringOverride: { '1': 2, '2': 1 } } });
      const [g] = await toBattle(s.matchId);
      await race(s, g, [0, 1]);
      const pts = await db.all<{ points_awarded: number }>(
        `SELECT points_awarded FROM match_game_placements WHERE match_game_id = ? ORDER BY position`, [g]
      );
      expect(pts.map(p => p.points_awarded)).toEqual([2, 1]);
    });

    it('uses the game scoring_config when there is no override', async () => {
      await db.run(`UPDATE games SET scoring_config = ? WHERE id = ?`,
        [JSON.stringify({ type: 'Position', pointsPerPosition: { '1': 9, '2': 8 } }), gameId]);
      const s = await setupMatch('Position', { maps: 1, players: 2 });
      const [g] = await toBattle(s.matchId);
      await race(s, g, [1, 0]);
      const pts = await db.all<{ points_awarded: number }>(
        `SELECT points_awarded FROM match_game_placements WHERE match_game_id = ? ORDER BY position`, [g]
      );
      expect(pts.map(p => p.points_awarded)).toEqual([9, 8]);
    });

    it('leaves winner_team null when the top two tie on points', async () => {
      const s = await setupMatch('Position', { maps: 2, players: 2 });
      const [g1, g2] = await toBattle(s.matchId);
      await race(s, g1, [0, 1]);
      await race(s, g2, [1, 0]);
      const row = await matchRow(s.matchId);
      expect(row?.status).toBe('complete');
      expect(row?.winner_team).toBeNull();
    });

    it('validates position input', async () => {
      const s = await setupMatch('Position', { maps: 1, players: 2 });
      const [g] = await toBattle(s.matchId);
      const dup = await score(s.matchId, g, {
        type: 'Position', matchId: s.matchId, gameId: g,
        positionResults: { [s.participantIds[0]]: 1, [s.participantIds[1]]: 1 },
      });
      expect(dup.status).toBe(400);
    });
  });
});
