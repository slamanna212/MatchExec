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

import { seedBasicTestData, createMatch, createMatchParticipant, createGameMode } from '../utils/fixtures';
import { getTestDb } from '../utils/test-db';
import {
  saveMatchResult,
  getMatchResult,
  getGameResult,
  determineMatchWinner,
  resolveWinnerEntity,
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
      await saveMatchResult(gid, normalResult(match.id, gid, { ...base, positionResults: { [b.id]: 1, [a.id]: 2 } }));

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
      await saveMatchResult(gid, normalResult(match.id, gid, { winner: 'team2', winnerTeamId: t1 }));

      const rows = await all(`SELECT entity_id, is_winner FROM match_game_placements WHERE match_game_id = ?`, [gid]);
      expect(rows).toHaveLength(2);
      expect(rows.filter(r => r.is_winner).map(r => r.entity_id)).toEqual([t1]);
      const legacy = await getTestDb().get<Row>(`SELECT winner_id FROM match_games WHERE id = ?`, [gid]);
      expect(legacy?.winner_id).toBe('team2');
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
});
