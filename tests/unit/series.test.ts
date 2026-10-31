import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(async () => {
    const { getTestDb } = await import('./../utils/test-db');
    return getTestDb();
  }),
}));

import { getTestDb } from '../utils/test-db';
import { seedBasicTestData, createMatch } from '../utils/fixtures';
import {
  createSeries,
  getSeriesById,
  updateSeries,
  deleteSeries,
  addSeriesEvent,
  getSeriesStandings,
  validatePointsMultiplier,
  validateEventOrder,
  validateScoringConfig,
  checkSeriesEventTarget,
} from '@/lib/series';

let counter = 0;
const uid = (p: string): string => `${p}_${Date.now()}_${counter++}`;

describe('series standings & validation', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  async function makeTournament(format: string, status = 'complete'): Promise<string> {
    const db = getTestDb();
    const id = uid('t');
    await db.run(
      `INSERT INTO tournaments (id, name, game_id, format, status, rounds_per_match) VALUES (?, 'T', ?, ?, ?, 1)`,
      [id, game.id, format, status]
    );
    return id;
  }

  async function makeTeam(tournamentId: string, name: string, username: string): Promise<string> {
    const db = getTestDb();
    const id = uid('tt');
    await db.run(`INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, ?)`, [id, tournamentId, name]);
    await db.run(
      `INSERT INTO tournament_team_members (id, team_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
      [uid('ttm'), id, `u_${username}`, `d_${username}`, username]
    );
    return id;
  }

  async function makeBracketMatch(
    tournamentId: string, round: number, bracket: string, t1: string, t2: string, winner: string | null, status = 'complete'
  ): Promise<string> {
    const db = getTestDb();
    const id = uid('bm');
    await db.run(
      `INSERT INTO matches (id, name, status, match_format, game_id, mode_id, tournament_id, tournament_round, tournament_bracket_type, winner_team, blue_team_id, red_team_id, start_date, start_time)
       VALUES (?, 'bm', ?, 'competitive', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, '18:00')`,
      [id, status, game.id, mode.id, tournamentId, round, bracket, winner, t1, t2]
    );
    await db.run(
      `INSERT INTO tournament_matches (match_id, tournament_id, round, bracket_type, team1_id, team2_id, match_order) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [id, tournamentId, round, bracket, t1, t2]
    );
    return id;
  }

  describe('validators', () => {
    it('validatePointsMultiplier accepts (0, 10] and rejects others', () => {
      expect(validatePointsMultiplier(1)).toBeNull();
      expect(validatePointsMultiplier(0.1)).toBeNull();
      expect(validatePointsMultiplier(10)).toBeNull();
      for (const bad of [0, -1, 10.1, NaN, Infinity, '2', null, undefined]) {
        expect(validatePointsMultiplier(bad)).not.toBeNull();
      }
    });

    it('validateEventOrder requires a positive integer', () => {
      expect(validateEventOrder(1)).toBeNull();
      for (const bad of [0, -2, 1.5, '3', NaN]) expect(validateEventOrder(bad)).not.toBeNull();
    });

    it('validateScoringConfig rejects bad shapes', () => {
      expect(validateScoringConfig({})).toBeNull();
      expect(validateScoringConfig({ match_win_points: 3, tournament_position_points: [5, 3], position_event_use_event_spread: false })).toBeNull();
      expect(validateScoringConfig(null)).not.toBeNull();
      expect(validateScoringConfig([])).not.toBeNull();
      expect(validateScoringConfig({ match_win_points: 'x' })).not.toBeNull();
      expect(validateScoringConfig({ tournament_position_points: [1, 'a'] })).not.toBeNull();
      expect(validateScoringConfig({ tournament_position_points: 5 })).not.toBeNull();
    });
  });

  describe('updateSeries / deleteSeries', () => {
    it('clears fields when given an explicit null and leaves undefined untouched', async () => {
      const id = await createSeries({ name: 'N', description: 'desc', livestream_link: 'http://x' });
      await updateSeries(id, { description: null, livestream_link: null, scoring_config: null });
      const s = await getSeriesById(id);
      expect(s!.description).toBeNull();
      expect(s!.livestream_link).toBeNull();
      expect(s!.name).toBe('N');
    });

    it('deleteSeries removes its series_events', async () => {
      const db = getTestDb();
      const id = await createSeries({ name: 'D' });
      const m = await createMatch(game.id, mode.id, { status: 'complete' });
      await addSeriesEvent(id, { event_type: 'match', match_id: String(m.id) });
      await deleteSeries(id);
      const rows = await db.all(`SELECT * FROM series_events WHERE series_id = ?`, [id]);
      expect(rows).toHaveLength(0);
      expect(await getSeriesById(id)).toBeNull();
    });
  });

  describe('checkSeriesEventTarget', () => {
    it('flags missing targets (400) and duplicates (409)', async () => {
      const id = await createSeries({ name: 'C' });
      expect(await checkSeriesEventTarget(id, { event_type: 'match', match_id: 'nope' })).toMatchObject({ status: 400 });
      expect(await checkSeriesEventTarget(id, { event_type: 'tournament', tournament_id: 'nope' })).toMatchObject({ status: 400 });
      const m = await createMatch(game.id, mode.id, { status: 'complete' });
      expect(await checkSeriesEventTarget(id, { event_type: 'match', match_id: String(m.id) })).toBeNull();
      await addSeriesEvent(id, { event_type: 'match', match_id: String(m.id) });
      expect(await checkSeriesEventTarget(id, { event_type: 'match', match_id: String(m.id) })).toMatchObject({ status: 409 });
    });
  });

  describe('tournament events', () => {
    it('single-elim: champion, runner-up and semifinal losers (shared 3rd) get placement points', async () => {
      const t = await makeTournament('single-elimination');
      const a = await makeTeam(t, 'A', 'Alice');
      const b = await makeTeam(t, 'B', 'Bob');
      const c = await makeTeam(t, 'C', 'Cara');
      const d = await makeTeam(t, 'D', 'Dan');
      await makeBracketMatch(t, 1, 'winners', a, d, a);
      await makeBracketMatch(t, 1, 'winners', b, c, b);
      await makeBracketMatch(t, 2, 'winners', a, b, a);

      const sid = await createSeries({ name: 'S', scoring_config: { tournament_position_points: [25, 18, 15] } });
      await addSeriesEvent(sid, { event_type: 'tournament', tournament_id: t, points_multiplier: 2 });
      const st = await getSeriesStandings(sid);
      const pts = (n: string) => st.find(r => r.username === n)?.total_points;
      expect(pts('Alice')).toBe(50);
      expect(pts('Bob')).toBe(36);
      expect(pts('Cara')).toBe(30);
      expect(pts('Dan')).toBe(30);
    });

    it('double-elim: uses the final bracket match for the champion', async () => {
      const t = await makeTournament('double-elimination');
      const a = await makeTeam(t, 'A', 'Alice');
      const b = await makeTeam(t, 'B', 'Bob');
      await makeBracketMatch(t, 1, 'final', a, b, b);
      const sid = await createSeries({ name: 'S', scoring_config: { tournament_position_points: [10, 6] } });
      await addSeriesEvent(sid, { event_type: 'tournament', tournament_id: t });
      const st = await getSeriesStandings(sid);
      expect(st.find(r => r.username === 'Bob')?.total_points).toBe(10);
      expect(st.find(r => r.username === 'Alice')?.total_points).toBe(6);
    });

    it('ignores tournaments that are not complete', async () => {
      const t = await makeTournament('single-elimination', 'battle');
      const a = await makeTeam(t, 'A', 'Alice');
      const b = await makeTeam(t, 'B', 'Bob');
      await makeBracketMatch(t, 1, 'winners', a, b, a);
      const sid = await createSeries({ name: 'S', scoring_config: { tournament_position_points: [10, 6] } });
      await addSeriesEvent(sid, { event_type: 'tournament', tournament_id: t });
      expect(await getSeriesStandings(sid)).toHaveLength(0);
    });

    it('cumulative: groups by stable id and tied players share the higher placing points', async () => {
      const db = getTestDb();
      const ffa = uid('gm_ffa');
      await db.run(`INSERT INTO game_modes (id, game_id, name, scoring_type) VALUES (?, ?, 'FFA', 'FFA')`, [ffa, game.id]);
      const t = await makeTournament('cumulative-points');
      const scores: Array<[string, number]> = [['P1', 10], ['P2', 10], ['P3', 4]];
      const matchIds: string[] = [];
      for (let i = 0; i < 2; i++) {
        const mid = uid('cm');
        matchIds.push(mid);
        await db.run(
          `INSERT INTO matches (id, name, status, match_format, game_id, mode_id, tournament_id, start_date, start_time)
           VALUES (?, 'cm', 'complete', 'casual', ?, ?, ?, CURRENT_TIMESTAMP, '18:00')`,
          [mid, game.id, ffa, t]
        );
        const gid = uid('mg');
        await db.run(`INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`, [gid, mid]);
        for (const [name, total] of scores) {
          const pid = uid('mp');
          // Same player across matches: stable discord id, different usernames/user ids per match
          await db.run(
            `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
            [pid, mid, `${name}_u${i}`, `d_${name}`, `${name}${i === 0 ? '' : '_renamed'}`]
          );
          await db.run(
            `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner)
             VALUES (?, ?, 'participant', ?, 1, ?, 0)`,
            [uid('pl'), gid, pid, total / 2]
          );
        }
      }
      const sid = await createSeries({ name: 'S', scoring_config: { tournament_position_points: [25, 18, 15] } });
      await addSeriesEvent(sid, { event_type: 'tournament', tournament_id: t });
      const st = await getSeriesStandings(sid);
      expect(st).toHaveLength(3);
      const byId = new Map(st.map(r => [r.user_id, r.total_points]));
      expect(byId.get('d_P1')).toBe(25);
      expect(byId.get('d_P2')).toBe(25); // tied for 1st, both get 1st-place points
      expect(byId.get('d_P3')).toBe(15); // rank index 2 (3rd place)
    });
  });

  describe('match events', () => {
    it('credits players of a tournament match through tournament team membership', async () => {
      const t = await makeTournament('single-elimination', 'battle');
      const a = await makeTeam(t, 'A', 'Alice');
      const b = await makeTeam(t, 'B', 'Bob');
      const mid = await makeBracketMatch(t, 1, 'winners', a, b, a);
      const db = getTestDb();
      await db.run(`INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, 'u_Alice', 'd_Alice', 'Alice')`, [uid('mp'), mid]);
      await db.run(`INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, 'u_Bob', 'd_Bob', 'Bob')`, [uid('mp'), mid]);

      const sid = await createSeries({ name: 'S', scoring_config: { match_win_points: 3, match_loss_points: 1 } });
      await addSeriesEvent(sid, { event_type: 'match', match_id: mid });
      const st = await getSeriesStandings(sid);
      expect(st.find(r => r.username === 'Alice')?.total_points).toBe(3);
      expect(st.find(r => r.username === 'Bob')?.total_points).toBe(1);
    });

    it('ignores cancelled and in-progress matches (no points, no events_played)', async () => {
      const db = getTestDb();
      const sid = await createSeries({ name: 'S', scoring_config: { match_win_points: 3, match_loss_points: 1 } });
      for (const status of ['cancelled', 'battle']) {
        const m = await createMatch(game.id, mode.id, { status });
        await db.run(`INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username) VALUES (?, ?, 'u1', 'd1', 'One')`, [uid('mp'), String(m.id)]);
        await addSeriesEvent(sid, { event_type: 'match', match_id: String(m.id) });
      }
      expect(await getSeriesStandings(sid)).toHaveLength(0);
    });

    it('does not give loss points to reserves or unassigned players', async () => {
      const db = getTestDb();
      const m = await createMatch(game.id, mode.id, { status: 'complete' });
      const mid = String(m.id);
      const t1 = uid('mt'); const t2 = uid('mt'); const tr = uid('mt');
      await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, 'Blue', 0, 0)`, [t1, mid]);
      await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, 'Red', 1, 0)`, [t2, mid]);
      await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, 'Reserve', 99, 1)`, [tr, mid]);
      const add = (name: string, team: string | null, assignment: string | null) =>
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, team_id, team_assignment) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uid('mp'), mid, `u_${name}`, `d_${name}`, name, team, assignment]
        );
      await add('Win', t1, 'blue');
      await add('Lose', t2, 'red');
      await add('Bench', tr, 'reserve');
      await add('Nobody', null, null);

      // game result: team 1 wins
      const gid = uid('mg');
      await db.run(`INSERT INTO match_games (id, match_id, round, status, winner_id) VALUES (?, ?, 1, 'completed', 'team1')`, [gid, mid]);
      await db.run(
        `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner) VALUES (?, ?, 'team', ?, 1, 1, 1)`,
        [uid('pl'), gid, t1]
      );
      await db.run(
        `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner) VALUES (?, ?, 'team', ?, 2, 0, 0)`,
        [uid('pl'), gid, t2]
      );

      const sid = await createSeries({ name: 'S', scoring_config: { match_win_points: 3, match_loss_points: 1 } });
      await addSeriesEvent(sid, { event_type: 'match', match_id: mid });
      const st = await getSeriesStandings(sid);
      expect(st.find(r => r.username === 'Win')?.total_points).toBe(3);
      expect(st.find(r => r.username === 'Lose')?.total_points).toBe(1);
      expect(st.find(r => r.username === 'Bench')).toBeUndefined();
      expect(st.find(r => r.username === 'Nobody')).toBeUndefined();
    });
  });
});
