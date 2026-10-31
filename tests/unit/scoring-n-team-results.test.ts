import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(async () => {
    const { getTestDb } = await import('../utils/test-db');
    return getTestDb();
  }),
}));

vi.mock('@/lib/voice-channel-manager', () => ({
  deleteMatchVoiceChannels: vi.fn().mockResolvedValue(undefined),
}));

import { seedBasicTestData, createMatch, createMatchParticipant, createGameMode, createGame } from '../utils/fixtures';
import { getTestDb } from '../utils/test-db';
import {
  saveMatchResult,
  getMatchResult,
  getGameResult,
  determineMatchWinner,
  resolveWinnerEntity,
  rankByPoints,
  getOverallPositionScore,
  getMatchGamesWithResults,
  GameAlreadyScoredError,
} from '@/lib/scoring-functions';
import type { MatchResult } from '@/shared/types';

type Row = Record<string, any>;

describe('N-team / FFA / Position result handling', () => {
  let game: any;
  let normalMode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    normalMode = data.mode;
  });

  async function addTeams(matchId: string, names: string[]): Promise<string[]> {
    const db = getTestDb();
    const ids: string[] = [];
    for (let i = 0; i < names.length; i++) {
      const id = `${matchId}_t${i}`;
      await db.run(
        `INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, ?, ?, 0)`,
        [id, matchId, names[i], i]
      );
      ids.push(id);
    }
    return ids;
  }

  async function addGames(matchId: string, count: number): Promise<string[]> {
    const db = getTestDb();
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
      const id = `${matchId}_game_${i}`;
      await db.run(
        `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, ?, ?)`,
        [id, matchId, i, i === 1 ? 'ongoing' : 'pending']
      );
      ids.push(id);
    }
    return ids;
  }

  const normalResult = (matchId: string, gameId: string, extra: Partial<MatchResult>): MatchResult => ({
    matchId, gameId, winner: 'team1', isFfaMode: false, completedAt: new Date(), ...extra,
  });

  const all = (sql: string, params: unknown[] = []) => getTestDb().all<Row>(sql, params);

  describe('rescoring replaces placements', () => {
    it('FFA rescore leaves exactly one winner row', async () => {
      const ffa = await createGameMode(game.id, { scoring_type: 'FFA', name: 'FFA Mode' });
      const match = await createMatch(game.id, ffa.id, { status: 'battle' });
      const [gid] = await addGames(match.id, 2);
      const p1 = await createMatchParticipant(match.id, 'u1', 'Alice');
      const p2 = await createMatchParticipant(match.id, 'u2', 'Bob');

      await saveMatchResult(gid, normalResult(match.id, gid, { isFfaMode: true, participantWinnerId: p1.id }));
      await saveMatchResult(gid, normalResult(match.id, gid, { isFfaMode: true, participantWinnerId: p2.id, rescore: true }));

      const rows = await all(`SELECT * FROM match_game_placements WHERE match_game_id = ?`, [gid]);
      expect(rows).toHaveLength(1);
      expect(rows[0].entity_id).toBe(p2.id);
      expect(rows.filter(r => r.is_winner)).toHaveLength(1);
    });

    it('Position rescore drops racers no longer present', async () => {
      const pos = await createGameMode(game.id, { scoring_type: 'Position', name: 'Race' });
      const match = await createMatch(game.id, pos.id, { status: 'battle' });
      const [gid] = await addGames(match.id, 2);
      const a = await createMatchParticipant(match.id, 'u1', 'A');
      const b = await createMatchParticipant(match.id, 'u2', 'B');
      const c = await createMatchParticipant(match.id, 'u3', 'C');

      const base = { isFfaMode: false, isPositionMode: true };
      await saveMatchResult(gid, normalResult(match.id, gid, { ...base, positionResults: { [a.id]: 1, [b.id]: 2, [c.id]: 3 } }));
      await saveMatchResult(gid, normalResult(match.id, gid, { ...base, positionResults: { [b.id]: 1, [a.id]: 2 }, rescore: true }));

      const rows = await all(`SELECT entity_id, position, is_winner FROM match_game_placements WHERE match_game_id = ?`, [gid]);
      expect(rows).toHaveLength(2);
      expect(rows.find(r => r.entity_id === b.id)?.position).toBe(1);
      expect(rows.find(r => r.entity_id === c.id)).toBeUndefined();
    });

    it('Normal rescore flips the single winner', async () => {
      const match = await createMatch(game.id, normalMode.id, { status: 'battle' });
      const [t0, t1] = await addTeams(match.id, ['Alpha', 'Beta']);
      const [gid] = await addGames(match.id, 2);

      await saveMatchResult(gid, normalResult(match.id, gid, { winnerTeamId: t0 }));
      await saveMatchResult(gid, normalResult(match.id, gid, { winner: 'team2', winnerTeamId: t1, rescore: true }));

      const rows = await all(`SELECT entity_id, is_winner FROM match_game_placements WHERE match_game_id = ?`, [gid]);
      expect(rows).toHaveLength(2);
      expect(rows.filter(r => r.is_winner).map(r => r.entity_id)).toEqual([t1]);
      const legacy = await getTestDb().get<Row>(`SELECT winner_id FROM match_games WHERE id = ?`, [gid]);
      expect(legacy?.winner_id).toBe('team2');
    });

    it('rejects re-saving a scored game without rescore and leaves the result intact', async () => {
      const match = await createMatch(game.id, normalMode.id, { status: 'battle' });
      const [t0, t1] = await addTeams(match.id, ['Alpha', 'Beta']);
      const [gid] = await addGames(match.id, 2);

      await saveMatchResult(gid, normalResult(match.id, gid, { winnerTeamId: t0 }));
      await expect(saveMatchResult(gid, normalResult(match.id, gid, { winner: 'team2', winnerTeamId: t1 })))
        .rejects.toBeInstanceOf(GameAlreadyScoredError);

      const rows = await all(`SELECT entity_id, is_winner FROM match_game_placements WHERE match_game_id = ?`, [gid]);
      expect(rows.filter(r => r.is_winner).map(r => r.entity_id)).toEqual([t0]);
      const ongoing = await all(`SELECT id FROM match_games WHERE match_id = ? AND status = 'ongoing'`, [match.id]);
      expect(ongoing).toHaveLength(1);
    });

    it('does not re-fire completion side effects but recomputes winner_team', async () => {
      const match = await createMatch(game.id, normalMode.id, { status: 'battle' });
      const [t0, t1] = await addTeams(match.id, ['Alpha', 'Beta']);
      const [gid] = await addGames(match.id, 1);

      await saveMatchResult(gid, normalResult(match.id, gid, { winnerTeamId: t0 }));
      const db = getTestDb();
      expect((await db.get<Row>(`SELECT status, winner_team FROM matches WHERE id = ?`, [match.id]))).toMatchObject({ status: 'complete', winner_team: t0 });
      const count = async (table: string) => (await db.get<Row>(`SELECT COUNT(*) c FROM ${table} WHERE match_id = ?`, [match.id]))!.c;
      expect(await count('discord_deletion_queue')).toBe(1);
      expect(await count('discord_match_winner_queue')).toBe(1);
      expect(await count('activity_feed')).toBeGreaterThan(0);
      const completedEvents = async () =>
        (await db.get<Row>(`SELECT COUNT(*) c FROM activity_feed WHERE match_id = ? AND event_type = 'match_completed'`, [match.id]))!.c;
      expect(await completedEvents()).toBe(1);
      const scoreNotifs = await count('discord_score_notification_queue');

      await saveMatchResult(gid, normalResult(match.id, gid, { winner: 'team2', winnerTeamId: t1, rescore: true }));

      expect(await count('discord_deletion_queue')).toBe(1);
      expect(await count('discord_match_winner_queue')).toBe(1);
      expect(await completedEvents()).toBe(1);
      expect(await count('discord_score_notification_queue')).toBe(scoreNotifs);
      expect((await db.get<Row>(`SELECT winner_team FROM matches WHERE id = ?`, [match.id]))?.winner_team).toBe(t1);
    });
  });

  describe('foreign game ids', () => {
    it('refuses to create a match_games row for an arbitrary id', async () => {
      const match = await createMatch(game.id, normalMode.id, { status: 'battle' });
      await expect(
        saveMatchResult('made-up-id', normalResult(match.id, 'made-up-id', {}))
      ).rejects.toThrow(/not found/i);
      const row = await getTestDb().get(`SELECT id FROM match_games WHERE id = 'made-up-id'`);
      expect(row).toBeUndefined();
    });

    it('refuses a game belonging to another match', async () => {
      const m1 = await createMatch(game.id, normalMode.id, { status: 'battle' });
      const m2 = await createMatch(game.id, normalMode.id, { status: 'battle' });
      const [g2] = await addGames(m2.id, 1);
      await expect(
        saveMatchResult(g2, normalResult(m1.id, g2, {}))
      ).rejects.toThrow(/does not belong/i);
    });
  });

  describe('winner notification', () => {
    it('names a 3rd team winner from match_teams and lists its players by team_id', async () => {
      const match = await createMatch(game.id, normalMode.id, { status: 'battle' });
      const [, , t2] = await addTeams(match.id, ['Alpha', 'Beta', 'Gamma Squad']);
      const [gid] = await addGames(match.id, 1);
      const p = await createMatchParticipant(match.id, 'discord-9', 'Zed');
      await getTestDb().run(`UPDATE match_participants SET team_id = ? WHERE id = ?`, [t2, p.id]);

      await saveMatchResult(gid, normalResult(match.id, gid, { winner: 'team' as any, winnerTeamId: t2 }));

      const q = await getTestDb().get<Row>(`SELECT * FROM discord_match_winner_queue WHERE match_id = ?`, [match.id]);
      expect(q?.winner).toBe('team');
      expect(q?.winning_team_name).toBe('Gamma Squad');
      expect(JSON.parse(q?.winning_players)).toEqual(['<@discord-9>']);

      const sn = await getTestDb().get<Row>(`SELECT * FROM discord_score_notification_queue WHERE match_id = ?`, [match.id]);
      expect(sn?.winner).toBe('team');
      expect(sn?.winning_team_name).toBe('Gamma Squad');
      const mg = await getTestDb().get<Row>(`SELECT winner_id FROM match_games WHERE id = ?`, [gid]);
      expect(mg?.winner_id).toBeNull();
      expect(await getMatchResult(gid)).toMatchObject({ winner: 'team', winnerTeamId: t2 });
    });

    it('queues a tie notification for a tied Normal match', async () => {
      const match = await createMatch(game.id, normalMode.id, { status: 'battle' });
      const [t0, t1] = await addTeams(match.id, ['Alpha', 'Beta']);
      const [g1, g2] = await addGames(match.id, 2);
      await saveMatchResult(g1, normalResult(match.id, g1, { winnerTeamId: t0 }));
      await saveMatchResult(g2, normalResult(match.id, g2, { winner: 'team2', winnerTeamId: t1 }));

      const q = await getTestDb().get<Row>(`SELECT * FROM discord_match_winner_queue WHERE match_id = ?`, [match.id]);
      expect(q?.winner).toBe('tie');
      expect(q?.winning_team_name).toBe('Match Tied');
      expect((await getTestDb().get<Row>(`SELECT winner_team FROM matches WHERE id = ?`, [match.id]))?.winner_team).toBeNull();
    });

    it('queues an FFA winner notification with the winner username', async () => {
      const ffa = await createGameMode(game.id, { scoring_type: 'FFA', name: 'FFA Mode' });
      const match = await createMatch(game.id, ffa.id, { status: 'battle' });
      const [g1, g2] = await addGames(match.id, 2);
      const a = await createMatchParticipant(match.id, 'disc-a', 'Alice');
      const b = await createMatchParticipant(match.id, 'disc-b', 'Bob');
      const ffaResult = (gid: string, pid: string) =>
        normalResult(match.id, gid, { isFfaMode: true, participantWinnerId: pid });

      await saveMatchResult(g1, ffaResult(g1, a.id));
      await saveMatchResult(g2, ffaResult(g2, a.id));

      const q = await getTestDb().get<Row>(`SELECT * FROM discord_match_winner_queue WHERE match_id = ?`, [match.id]);
      expect(q?.winner).toBe('participant');
      expect(q?.winning_team_name).toBe('Alice');
      expect(JSON.parse(q?.winning_players)).toEqual(['<@disc-a>']);
      expect(q?.total_maps).toBe(2);
      expect((await getTestDb().get<Row>(`SELECT winner_team FROM matches WHERE id = ?`, [match.id]))?.winner_team).toBe(a.id);
      expect(await resolveWinnerEntity(getTestDb() as any, match.id)).toEqual({ type: 'participant', id: a.id });
      expect(b.id).toBeTruthy();
    });

    it('queues a Position winner notification and handles tied totals as a tie', async () => {
      const pos = await createGameMode(game.id, { scoring_type: 'Position', name: 'Race' });
      const match = await createMatch(game.id, pos.id, { status: 'battle' });
      const [g1, g2] = await addGames(match.id, 2);
      const a = await createMatchParticipant(match.id, 'disc-a', 'Alice');
      const b = await createMatchParticipant(match.id, 'disc-b', 'Bob');
      const race = (gid: string, first: string, second: string) =>
        normalResult(match.id, gid, { isFfaMode: false, isPositionMode: true, positionResults: { [first]: 1, [second]: 2 } });

      await saveMatchResult(g1, race(g1, a.id, b.id));
      await saveMatchResult(g2, race(g2, b.id, a.id));

      expect(await determineMatchWinner(getTestDb() as any, match.id)).toBeNull();
      const q = await getTestDb().get<Row>(`SELECT * FROM discord_match_winner_queue WHERE match_id = ?`, [match.id]);
      expect(q?.winner).toBe('tie');
    });
  });

  describe('draws', () => {
    it('records a Normal draw as a completed result with no winner', async () => {
      const match = await createMatch(game.id, normalMode.id, { status: 'battle' });
      const [t0, t1] = await addTeams(match.id, ['Alpha', 'Beta']);
      const [gid] = await addGames(match.id, 2);

      await saveMatchResult(gid, normalResult(match.id, gid, { winner: 'tie', draw: true }));

      const rows = await all(`SELECT entity_id, position, is_winner FROM match_game_placements WHERE match_game_id = ?`, [gid]);
      expect(rows.map(r => r.entity_id).sort()).toEqual([t0, t1].sort());
      expect(rows.every(r => r.position === 1 && r.is_winner === 0)).toBe(true);
      expect((await getTestDb().get<Row>(`SELECT status FROM match_games WHERE id = ?`, [gid]))?.status).toBe('completed');

      expect(await getMatchResult(gid)).toMatchObject({ winner: 'tie', draw: true });
      const typed = await getGameResult(gid);
      expect(typed?.type).toBe('Normal');
      expect(typed?.placements.every(p => !p.isWinner)).toBe(true);
    });
  });

  describe('scoring_type from mode, not row counts', () => {
    it('reads a 1-racer Position game back as Position', async () => {
      const pos = await createGameMode(game.id, { scoring_type: 'Position', name: 'Race' });
      const match = await createMatch(game.id, pos.id, { status: 'battle' });
      const [gid] = await addGames(match.id, 2);
      const a = await createMatchParticipant(match.id, 'u1', 'Solo');

      await saveMatchResult(gid, normalResult(match.id, gid, { isFfaMode: false, isPositionMode: true, positionResults: { [a.id]: 1 } }));

      expect(await getMatchResult(gid)).toMatchObject({ isPositionMode: true, positionResults: { [a.id]: 1 } });
      expect((await getGameResult(gid))?.type).toBe('Position');
    });
  });

  describe('team Position ranking', () => {
    it('rankByPoints shares positions on ties and gives no winner for a top tie', () => {
      expect(rankByPoints(new Map([['a', 10], ['b', 10], ['c', 4]]))).toEqual([
        { teamId: 'a', points: 10, position: 1, isWinner: false },
        { teamId: 'b', points: 10, position: 1, isWinner: false },
        { teamId: 'c', points: 4, position: 3, isWinner: false },
      ]);
      expect(rankByPoints(new Map([['a', 3], ['b', 9], ['c', 3]]))).toEqual([
        { teamId: 'b', points: 9, position: 1, isWinner: true },
        { teamId: 'a', points: 3, position: 2, isWinner: false },
        { teamId: 'c', points: 3, position: 2, isWinner: false },
      ]);
    });

    it('writes tied team-endurance placements with no winner', async () => {
      const pos = await createGameMode(game.id, { scoring_type: 'Position', name: 'Endurance' });
      const match = await createMatch(game.id, pos.id, { status: 'battle' });
      const [t0, t1] = await addTeams(match.id, ['Alpha', 'Beta']);
      const [gid] = await addGames(match.id, 2);
      const ps = await Promise.all(['A1', 'A2', 'B1', 'B2'].map((n, i) => createMatchParticipant(match.id, `u${i}`, n)));
      const db = getTestDb();
      for (const [i, p] of ps.entries()) {
        await db.run(`UPDATE match_participants SET team_id = ? WHERE id = ?`, [i < 2 ? t0 : t1, p.id]);
      }
      // Spread 4/3/2/1: Alpha (1st+4th) = 5, Beta (2nd+3rd) = 5 → tie.
      await db.run(`UPDATE matches SET position_scoring_override = ? WHERE id = ?`, [JSON.stringify({ '1': 4, '2': 3, '3': 2, '4': 1 }), match.id]);
      await saveMatchResult(gid, normalResult(match.id, gid, {
        isPositionMode: true,
        positionResults: { [ps[0].id]: 1, [ps[1].id]: 4, [ps[2].id]: 2, [ps[3].id]: 3 },
      }));

      const teamRows = await all(
        `SELECT entity_id, position, points_awarded, is_winner FROM match_game_placements WHERE match_game_id = ? AND entity_type = 'team'`, [gid]
      );
      expect(teamRows).toHaveLength(2);
      expect(teamRows.every(r => r.position === 1 && r.points_awarded === 5 && r.is_winner === 0)).toBe(true);
    });
  });

  describe('getOverallPositionScore', () => {
    it('totals placements (not legacy JSON) and reports a top tie as no winner', async () => {
      const pos = await createGameMode(game.id, { scoring_type: 'Position', name: 'Race' });
      const match = await createMatch(game.id, pos.id, { status: 'battle' });
      const [g1, g2] = await addGames(match.id, 3);
      const a = await createMatchParticipant(match.id, 'u1', 'A');
      const b = await createMatchParticipant(match.id, 'u2', 'B');
      const base = { isPositionMode: true };
      await saveMatchResult(g1, normalResult(match.id, g1, { ...base, positionResults: { [a.id]: 1, [b.id]: 2 } }));
      await saveMatchResult(g2, normalResult(match.id, g2, { ...base, positionResults: { [b.id]: 1, [a.id]: 2 } }));
      // Wipe the legacy columns to prove they aren't read.
      await getTestDb().run(`UPDATE match_games SET points_awarded = NULL, position_results = NULL WHERE match_id = ?`, [match.id]);

      const score = await getOverallPositionScore(match.id);
      expect(score.participantScores[a.id]).toEqual({ username: 'A', totalPoints: 43, races: 2 });
      expect(score.participantScores[b.id]).toEqual({ username: 'B', totalPoints: 43, races: 2 });
      expect(score.winner).toBeNull();
    });
  });

  describe('ensureMatchGameExists (via saveMatchResult)', () => {
    it('creates a missing `_game_N` row with round N and the Nth map', async () => {
      const match = await createMatch(game.id, normalMode.id, { status: 'battle', maps: JSON.stringify(['m-one', 'm-two-1776547135395-abc']) });
      const [t0] = await addTeams(match.id, ['Alpha', 'Beta']);
      const gid = `${match.id}_game_2`;

      await saveMatchResult(gid, normalResult(match.id, gid, { winnerTeamId: t0 }));

      const row = await getTestDb().get<Row>(`SELECT round, map_id FROM match_games WHERE id = ?`, [gid]);
      expect(row).toMatchObject({ round: 2, map_id: 'm-two-1776547135395-abc' });
    });

    it('rejects ids that do not follow the `_game_N` convention', async () => {
      const match = await createMatch(game.id, normalMode.id, { status: 'battle' });
      await expect(saveMatchResult(`${match.id}_game_x`, normalResult(match.id, `${match.id}_game_x`, {})))
        .rejects.toThrow(/not found/);
      await expect(saveMatchResult(`${match.id}_game_0`, normalResult(match.id, `${match.id}_game_0`, {})))
        .rejects.toThrow(/not found/);
    });
  });

  describe('getMatchGamesWithResults', () => {
    it('scopes map lookups to the match game and resolves instance-suffixed map ids', async () => {
      const db = getTestDb();
      const other = await createGame({ name: 'Other Game' });
      const otherMode = await createGameMode(other.id, { scoring_type: 'FFA', name: 'Other FFA' });
      // Same map id in two games (like "midtown" in Overwatch 2 and Marvel Rivals).
      await db.run(`INSERT INTO game_maps (id, game_id, name, mode_id) VALUES ('midtown', ?, 'Midtown (ours)', ?)`, [game.id, normalMode.id]);
      await db.run(`INSERT INTO game_maps (id, game_id, name, mode_id) VALUES ('midtown', ?, 'Midtown (theirs)', ?)`, [other.id, otherMode.id]);

      const match = await createMatch(game.id, normalMode.id, { status: 'battle' });
      await db.run(`INSERT INTO match_games (id, match_id, round, map_id, status) VALUES (?, ?, 1, 'midtown', 'ongoing')`, [`${match.id}_game_1`, match.id]);
      await db.run(`INSERT INTO match_games (id, match_id, round, map_id, status) VALUES (?, ?, 2, 'midtown-1776547135395-abc', 'pending')`, [`${match.id}_game_2`, match.id]);

      const games = await getMatchGamesWithResults(match.id);
      expect(games).toHaveLength(2);
      expect(games.map(g => g.map_name)).toEqual(['Midtown (ours)', 'Midtown (ours)']);
      expect(games.every(g => g.mode_scoring_type === 'Normal')).toBe(true);
    });
  });
});
