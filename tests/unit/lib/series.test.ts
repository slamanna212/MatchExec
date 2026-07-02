import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));

vi.mock('@/lib/database-init', () => ({
  getDbInstance: vi.fn(async () => {
    const { getTestDb } = await import('../../utils/test-db');
    return getTestDb();
  }),
}));

import { getTestDb } from '../../utils/test-db';
import { seedBasicTestData, createMatch } from '../../utils/fixtures';
import {
  createSeries,
  getSeriesById,
  listSeries,
  updateSeries,
  validateSeriesStatusTransition,
  deleteSeries,
  addSeriesEvent,
  listSeriesEvents,
  removeSeriesEvent,
  getSeriesStandings,
} from '@/lib/series';

describe('series lib', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });
  describe('createSeries', () => {
    it('creates a series and returns its ID', async () => {
      const id = await createSeries({ name: 'Spring Championship' });
      expect(typeof id).toBe('string');
      expect(id.startsWith('series_')).toBe(true);
    });

    it('series is retrievable after creation with status=created', async () => {
      const id = await createSeries({ name: 'My Series', description: 'Test desc' });
      const series = await getSeriesById(id);
      expect(series).not.toBeNull();
      expect(series!.name).toBe('My Series');
      expect(series!.description).toBe('Test desc');
      expect(series!.status).toBe('created');
    });

    it('announcements default to true', async () => {
      const id = await createSeries({ name: 'Defaults Series' });
      const series = await getSeriesById(id);
      expect(series!.announcements).toBe(true);
      expect(series!.player_notifications).toBe(true);
    });

    it('respects announcements=false', async () => {
      const id = await createSeries({ name: 'Silent Series', announcements: false, player_notifications: false });
      const series = await getSeriesById(id);
      expect(series!.announcements).toBe(false);
      expect(series!.player_notifications).toBe(false);
    });

    it('persists scoring_config as serialized JSON', async () => {
      const config = { match_win_points: 10, tournament_position_points: [25, 18, 15] };
      const id = await createSeries({ name: 'Config Series', scoring_config: config });
      const series = await getSeriesById(id);
      expect(series!.scoring_config).toBe(JSON.stringify(config));
    });
  });

  describe('getSeriesById', () => {
    it('returns null for non-existent ID', async () => {
      const series = await getSeriesById('does-not-exist');
      expect(series).toBeNull();
    });
  });

  describe('listSeries', () => {
    it('returns all series when no status filter', async () => {
      await createSeries({ name: 'Series A' });
      await createSeries({ name: 'Series B' });
      const all = await listSeries();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by status', async () => {
      const id = await createSeries({ name: 'Active Series' });
      await updateSeries(id, { status: 'active' });

      const active = await listSeries('active');
      expect(active.some(s => s.id === id)).toBe(true);
      expect(active.every(s => s.status === 'active')).toBe(true);
    });
  });

  describe('updateSeries', () => {
    it('updates name and description', async () => {
      const id = await createSeries({ name: 'Original' });
      await updateSeries(id, { name: 'Updated', description: 'New desc' });
      const series = await getSeriesById(id);
      expect(series!.name).toBe('Updated');
      expect(series!.description).toBe('New desc');
    });

    it('updates status to active', async () => {
      const id = await createSeries({ name: 'To Activate' });
      await updateSeries(id, { status: 'active' });
      const series = await getSeriesById(id);
      expect(series!.status).toBe('active');
    });

    it('no-ops when no fields provided', async () => {
      const id = await createSeries({ name: 'Stable' });
      await updateSeries(id, {});
      const series = await getSeriesById(id);
      expect(series!.name).toBe('Stable');
    });
  });

  describe('deleteSeries', () => {
    it('removes the series from the database', async () => {
      const id = await createSeries({ name: 'To Delete' });
      await deleteSeries(id);
      const series = await getSeriesById(id);
      expect(series).toBeNull();
    });
  });

  describe('addSeriesEvent and listSeriesEvents', () => {
    let seriesId: string;
    let matchId: string;

    beforeEach(async () => {
      seriesId = await createSeries({ name: 'Event Series' });
      const match = await createMatch(game.id, mode.id, { name: 'Event Match', status: 'complete' });
      matchId = match.id.toString();
    });

    it('adds a match event and returns its ID', async () => {
      const id = await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId });
      expect(typeof id).toBe('string');
      expect(id.startsWith('sevt_')).toBe(true);
    });

    it('auto-assigns event_order starting at 1', async () => {
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId });
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId, event_order: 2 });

      const events = await listSeriesEvents(seriesId);
      expect(events).toHaveLength(2);
      expect(events[0].event_order).toBe(1);
      expect(events[1].event_order).toBe(2);
    });

    it('persists points_multiplier', async () => {
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId, points_multiplier: 2.5 });
      const events = await listSeriesEvents(seriesId);
      expect(events[0].points_multiplier).toBe(2.5);
    });

    it('defaults points_multiplier to 1.0', async () => {
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId });
      const events = await listSeriesEvents(seriesId);
      expect(events[0].points_multiplier).toBe(1.0);
    });

    it('returns events ordered by event_order', async () => {
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId, event_order: 3, points_multiplier: 3 });
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId, event_order: 1, points_multiplier: 1 });
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId, event_order: 2, points_multiplier: 2 });

      const events = await listSeriesEvents(seriesId);
      expect(events.map(e => e.event_order)).toEqual([1, 2, 3]);
    });

    it('listSeriesEvents returns empty array for series with no events', async () => {
      const newId = await createSeries({ name: 'Empty' });
      const events = await listSeriesEvents(newId);
      expect(events).toHaveLength(0);
    });

    it('handles concurrent auto-order inserts without an unhandled UNIQUE constraint error', async () => {
      // Two concurrent calls with no explicit event_order can both read the
      // same MAX(event_order) before either INSERT commits — the retry loop
      // must resolve this instead of letting one call reject.
      const results = await Promise.all([
        addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId }),
        addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId }),
        addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId }),
      ]);

      expect(results).toHaveLength(3);
      expect(new Set(results).size).toBe(3);

      const events = await listSeriesEvents(seriesId);
      expect(events).toHaveLength(3);
      expect(new Set(events.map(e => e.event_order)).size).toBe(3);
    });

    it('rejects (does not retry) a conflict on an explicitly-requested event_order', async () => {
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId, event_order: 5 });
      await expect(
        addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId, event_order: 5 })
      ).rejects.toThrow();
    });
  });

  describe('removeSeriesEvent', () => {
    it('removes the event from the list', async () => {
      const seriesId = await createSeries({ name: 'Remove Series' });
      const match = await createMatch(game.id, mode.id, { name: 'RM Match', status: 'complete' });
      const matchId = match.id.toString();

      const eventId = await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId });
      await removeSeriesEvent(eventId);

      const events = await listSeriesEvents(seriesId);
      expect(events.find(e => e.id === eventId)).toBeUndefined();
    });
  });

  describe('getSeriesStandings', () => {
    it('returns empty standings for series with no events', async () => {
      const id = await createSeries({ name: 'Empty Standings' });
      const standings = await getSeriesStandings(id);
      expect(standings).toHaveLength(0);
    });

    it('aggregates points from match_game_placements across match events', async () => {
      const db = getTestDb();
      const seriesId = await createSeries({ name: 'Points Series' });

      // Create a game mode (Position) to enable placements
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT OR IGNORE INTO games (id, name) VALUES ('game_standings', 'Test Game')`,
          (err) => err ? rej(err) : res()
        );
      });
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT OR IGNORE INTO game_modes (id, game_id, name, scoring_type) VALUES ('gm_pos_s', 'game_standings', 'Race', 'Position')`,
          (err) => err ? rej(err) : res()
        );
      });

      // Create two matches with participants
      const matchId1 = `m_s1_${Date.now()}`;
      const matchId2 = `m_s2_${Date.now() + 1}`;
      for (const [mid, name] of [[matchId1, 'Race 1'], [matchId2, 'Race 2']]) {
        await new Promise<void>((res, rej) => {
          db.run(
            `INSERT INTO matches (id, name, status, match_format, game_id, mode_id, start_date, start_time) VALUES (?, ?, 'complete', 'casual', 'game_standings', 'gm_pos_s', CURRENT_TIMESTAMP, '18:00')`,
            [mid, name], (err) => err ? rej(err) : res()
          );
        });
      }

      // Participant Alice in both matches
      const aliceId1 = `p_alice_s1_${Date.now()}`;
      const aliceId2 = `p_alice_s2_${Date.now() + 1}`;
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES (?, ?, 'alice', 'Alice', CURRENT_TIMESTAMP)`,
          [aliceId1, matchId1], (err) => err ? rej(err) : res()
        );
      });
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES (?, ?, 'alice', 'Alice', CURRENT_TIMESTAMP)`,
          [aliceId2, matchId2], (err) => err ? rej(err) : res()
        );
      });

      // Create match games and placements
      const mgId1 = `mg_s1_${Date.now()}`;
      const mgId2 = `mg_s2_${Date.now() + 1}`;
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`,
          [mgId1, matchId1], (err) => err ? rej(err) : res()
        );
      });
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`,
          [mgId2, matchId2], (err) => err ? rej(err) : res()
        );
      });

      // Alice gets 10 points in race 1, 8 points in race 2
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner)
           VALUES (?, ?, 'participant', ?, 1, 10, 1)`,
          [`mgp_s1_${Date.now()}`, mgId1, aliceId1], (err) => err ? rej(err) : res()
        );
      });
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner)
           VALUES (?, ?, 'participant', ?, 2, 8, 0)`,
          [`mgp_s2_${Date.now()}`, mgId2, aliceId2], (err) => err ? rej(err) : res()
        );
      });

      // Link both matches to series events (multiplier=1.0)
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId1, points_multiplier: 1.0 });
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId2, points_multiplier: 1.0 });

      const standings = await getSeriesStandings(seriesId);
      const alice = standings.find(s => s.username === 'Alice');
      expect(alice).toBeDefined();
      expect(alice!.total_points).toBe(18); // 10 + 8
      expect(alice!.rank).toBe(1);
    });

    it('applies points_multiplier to scores', async () => {
      const db = getTestDb();
      const seriesId = await createSeries({ name: 'Multiplier Series' });

      await new Promise<void>((res, rej) => {
        db.run(`INSERT OR IGNORE INTO games (id, name) VALUES ('game_mult', 'Mult Game')`, (err) => err ? rej(err) : res());
      });
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT OR IGNORE INTO game_modes (id, game_id, name, scoring_type) VALUES ('gm_mult', 'game_mult', 'Race', 'Position')`,
          (err) => err ? rej(err) : res()
        );
      });

      const matchId = `m_mult_${Date.now()}`;
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO matches (id, name, status, match_format, game_id, mode_id, start_date, start_time) VALUES (?, 'Finale', 'complete', 'casual', 'game_mult', 'gm_mult', CURRENT_TIMESTAMP, '18:00')`,
          [matchId], (err) => err ? rej(err) : res()
        );
      });

      const pId = `p_mult_${Date.now()}`;
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES (?, ?, 'bob', 'Bob', CURRENT_TIMESTAMP)`,
          [pId, matchId], (err) => err ? rej(err) : res()
        );
      });

      const mgId = `mg_mult_${Date.now()}`;
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`,
          [mgId, matchId], (err) => err ? rej(err) : res()
        );
      });

      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner)
           VALUES (?, ?, 'participant', ?, 1, 10, 1)`,
          [`mgp_mult_${Date.now()}`, mgId, pId], (err) => err ? rej(err) : res()
        );
      });

      // Finale has 2x multiplier
      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId, points_multiplier: 2.0 });

      const standings = await getSeriesStandings(seriesId);
      const bob = standings.find(s => s.username === 'Bob');
      expect(bob).toBeDefined();
      expect(bob!.total_points).toBe(20); // 10 * 2.0
    });

    it('ranks participants correctly (highest total_points = rank 1)', async () => {
      const db = getTestDb();
      const seriesId = await createSeries({ name: 'Rank Series' });

      await new Promise<void>((res, rej) => {
        db.run(`INSERT OR IGNORE INTO games (id, name) VALUES ('game_rank', 'Rank Game')`, (err) => err ? rej(err) : res());
      });
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT OR IGNORE INTO game_modes (id, game_id, name, scoring_type) VALUES ('gm_rank', 'game_rank', 'Race', 'Position')`,
          (err) => err ? rej(err) : res()
        );
      });

      const matchId = `m_rank_${Date.now()}`;
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO matches (id, name, status, match_format, game_id, mode_id, start_date, start_time) VALUES (?, 'Rank Match', 'complete', 'casual', 'game_rank', 'gm_rank', CURRENT_TIMESTAMP, '18:00')`,
          [matchId], (err) => err ? rej(err) : res()
        );
      });

      const [cP, dP] = [`p_c_${Date.now()}`, `p_d_${Date.now() + 1}`];
      for (const [pid, uname] of [[cP, 'Charlie'], [dP, 'Diana']]) {
        await new Promise<void>((res, rej) => {
          db.run(
            `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [pid, matchId, pid, uname], (err) => err ? rej(err) : res()
          );
        });
      }

      const mgId = `mg_rank_${Date.now()}`;
      await new Promise<void>((res, rej) => {
        db.run(`INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`, [mgId, matchId], (err) => err ? rej(err) : res());
      });

      // Charlie gets 5, Diana gets 15
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, points_awarded, is_winner) VALUES (?, ?, 'participant', ?, 5, 0)`,
          [`mgp_c_${Date.now()}`, mgId, cP], (err) => err ? rej(err) : res()
        );
      });
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, points_awarded, is_winner) VALUES (?, ?, 'participant', ?, 15, 1)`,
          [`mgp_d_${Date.now()}`, mgId, dP], (err) => err ? rej(err) : res()
        );
      });

      await addSeriesEvent(seriesId, { event_type: 'match', match_id: matchId });

      const standings = await getSeriesStandings(seriesId);
      expect(standings[0].username).toBe('Diana');
      expect(standings[0].rank).toBe(1);
      expect(standings[0].total_points).toBe(15);
      expect(standings[1].username).toBe('Charlie');
      expect(standings[1].rank).toBe(2);
      expect(standings[1].total_points).toBe(5);
    });

    it('scores a Normal match event via match_win_points/match_loss_points (regression: used to score 0)', async () => {
      const db = getTestDb();
      const seriesId = await createSeries({
        name: 'Normal Match Series',
        scoring_config: { match_win_points: 10, match_loss_points: 3 },
      });

      const match = await createMatch(game.id, mode.id, { status: 'complete' });

      const blueId = `mt_blue_${match.id}`;
      const redId = `mt_red_${match.id}`;
      await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, 'Blue', 0, 0)`, [blueId, match.id]);
      await db.run(`INSERT INTO match_teams (id, match_id, team_name, team_order, is_reserve) VALUES (?, ?, 'Red', 1, 0)`, [redId, match.id]);

      const winnerP = `p_win_${Date.now()}`;
      const loserP = `p_lose_${Date.now() + 1}`;
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, username, team_id, joined_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [winnerP, match.id, winnerP, 'Winner', blueId]
      );
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, username, team_id, joined_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [loserP, match.id, loserP, 'Loser', redId]
      );

      const mgId = `mg_${Date.now()}`;
      await db.run(`INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`, [mgId, match.id]);
      await db.run(
        `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, is_winner) VALUES (?, ?, 'team', ?, 1, 1)`,
        [`mgp_w_${Date.now()}`, mgId, blueId]
      );
      await db.run(
        `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, is_winner) VALUES (?, ?, 'team', ?, 2, 0)`,
        [`mgp_l_${Date.now()}`, mgId, redId]
      );

      await addSeriesEvent(seriesId, { event_type: 'match', match_id: match.id });

      const standings = await getSeriesStandings(seriesId);
      const winner = standings.find(s => s.username === 'Winner');
      const loser = standings.find(s => s.username === 'Loser');
      expect(winner?.total_points).toBe(10);
      expect(loser?.total_points).toBe(3);
    });

    it('scores an FFA match event via match_win_points/match_loss_points', async () => {
      const db = getTestDb();
      const ffaModeId = 'gm_ffa_series';
      await db.run(`INSERT OR IGNORE INTO game_modes (id, game_id, name, scoring_type) VALUES (?, ?, 'FFA Mode', 'FFA')`, [ffaModeId, game.id]);

      const seriesId = await createSeries({
        name: 'FFA Series',
        scoring_config: { match_win_points: 20, match_loss_points: 5 },
      });

      const match = await createMatch(game.id, ffaModeId, { status: 'complete' });
      const winnerP = `p_ffa_win_${Date.now()}`;
      const loserP = `p_ffa_lose_${Date.now() + 1}`;
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [winnerP, match.id, winnerP, 'FfaWinner']
      );
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [loserP, match.id, loserP, 'FfaLoser']
      );

      const mgId = `mg_ffa_${Date.now()}`;
      await db.run(`INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`, [mgId, match.id]);
      await db.run(
        `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, is_winner) VALUES (?, ?, 'participant', ?, 1, 1)`,
        [`mgp_fw_${Date.now()}`, mgId, winnerP]
      );

      await addSeriesEvent(seriesId, { event_type: 'match', match_id: match.id });

      const standings = await getSeriesStandings(seriesId);
      const winner = standings.find(s => s.username === 'FfaWinner');
      const loser = standings.find(s => s.username === 'FfaLoser');
      expect(winner?.total_points).toBe(20);
      expect(loser?.total_points).toBe(5);
    });

    it('scores a bracket tournament event: champion earns tournament_position_points[0], others earn 0', async () => {
      const db = getTestDb();
      const seriesId = await createSeries({
        name: 'Tournament Series',
        scoring_config: { tournament_position_points: [25, 18, 15] },
      });

      const tournamentId = `t_series_${Date.now()}`;
      await db.run(
        `INSERT INTO tournaments (id, name, game_id, format, status, rounds_per_match) VALUES (?, 'Bracket Cup', ?, 'single-elimination', 'complete', 1)`,
        [tournamentId, game.id]
      );

      const champTeamId = `tt_champ_${Date.now()}`;
      const runnerUpTeamId = `tt_runner_${Date.now()}`;
      await db.run(`INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Champions')`, [champTeamId, tournamentId]);
      await db.run(`INSERT INTO tournament_teams (id, tournament_id, team_name) VALUES (?, ?, 'Runners Up')`, [runnerUpTeamId, tournamentId]);

      await db.run(
        `INSERT INTO tournament_team_members (id, team_id, user_id, username, joined_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [`ttm_c_${Date.now()}`, champTeamId, 'champ_user', 'ChampPlayer']
      );
      await db.run(
        `INSERT INTO tournament_team_members (id, team_id, user_id, username, joined_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [`ttm_r_${Date.now()}`, runnerUpTeamId, 'runner_user', 'RunnerPlayer']
      );

      const finalMatchId = `m_final_${Date.now()}`;
      await db.run(
        `INSERT INTO matches (id, name, status, match_format, game_id, mode_id, tournament_id, tournament_round, tournament_bracket_type, winner_team, start_date, start_time)
         VALUES (?, 'Grand Final', 'complete', 'competitive', ?, ?, ?, 1, 'final', ?, CURRENT_TIMESTAMP, '18:00')`,
        [finalMatchId, game.id, mode.id, tournamentId, champTeamId]
      );

      await addSeriesEvent(seriesId, { event_type: 'tournament', tournament_id: tournamentId });

      const standings = await getSeriesStandings(seriesId);
      const champ = standings.find(s => s.username === 'ChampPlayer');
      expect(champ?.total_points).toBe(25);
      // Runner-up isn't awarded points by this simplified champion-only bracket scoring.
      const runner = standings.find(s => s.username === 'RunnerPlayer');
      expect(runner).toBeUndefined();
    });

    it('scores a cumulative-points tournament event by per-participant rank', async () => {
      const db = getTestDb();
      const ffaModeId = 'gm_ffa_tourney_series';
      await db.run(`INSERT OR IGNORE INTO game_modes (id, game_id, name, scoring_type) VALUES (?, ?, 'FFA Mode', 'FFA')`, [ffaModeId, game.id]);

      const seriesId = await createSeries({
        name: 'Cumulative Tournament Series',
        scoring_config: { tournament_position_points: [25, 18] },
      });

      const tournamentId = `t_cum_${Date.now()}`;
      await db.run(
        `INSERT INTO tournaments (id, name, game_id, format, status, rounds_per_match) VALUES (?, 'Cumulative Cup', ?, 'cumulative-points', 'complete', 1)`,
        [tournamentId, game.id]
      );

      const match = await createMatch(game.id, ffaModeId, { status: 'complete' });
      await db.run(`UPDATE matches SET tournament_id = ? WHERE id = ?`, [tournamentId, match.id]);

      const firstP = `p_first_${Date.now()}`;
      const secondP = `p_second_${Date.now() + 1}`;
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [firstP, match.id, firstP, 'First']
      );
      await db.run(
        `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [secondP, match.id, secondP, 'Second']
      );

      const mgId = `mg_cum_${Date.now()}`;
      await db.run(`INSERT INTO match_games (id, match_id, round, status) VALUES (?, ?, 1, 'completed')`, [mgId, match.id]);
      await db.run(
        `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner) VALUES (?, ?, 'participant', ?, 1, 25, 1)`,
        [`mgp_1_${Date.now()}`, mgId, firstP]
      );
      await db.run(
        `INSERT INTO match_game_placements (id, match_game_id, entity_type, entity_id, position, points_awarded, is_winner) VALUES (?, ?, 'participant', ?, 2, 18, 0)`,
        [`mgp_2_${Date.now()}`, mgId, secondP]
      );

      await addSeriesEvent(seriesId, { event_type: 'tournament', tournament_id: tournamentId });

      const standings = await getSeriesStandings(seriesId);
      const first = standings.find(s => s.username === 'First');
      const second = standings.find(s => s.username === 'Second');
      expect(first?.total_points).toBe(25);
      expect(second?.total_points).toBe(18);
    });
  });

  describe('validateSeriesStatusTransition', () => {
    it('allows the forward path created -> active -> complete', () => {
      expect(validateSeriesStatusTransition('created', 'active')).toBeNull();
      expect(validateSeriesStatusTransition('active', 'complete')).toBeNull();
    });

    it('rejects skipping a step (created -> complete)', () => {
      expect(validateSeriesStatusTransition('created', 'complete')).not.toBeNull();
    });

    it('rejects moving backwards (active -> created)', () => {
      expect(validateSeriesStatusTransition('active', 'created')).not.toBeNull();
    });

    it('rejects transitions out of a terminal complete state', () => {
      expect(validateSeriesStatusTransition('complete', 'active')).not.toBeNull();
      expect(validateSeriesStatusTransition('complete', 'created')).not.toBeNull();
    });

    it('allows cancelling from created or active', () => {
      expect(validateSeriesStatusTransition('created', 'cancelled')).toBeNull();
      expect(validateSeriesStatusTransition('active', 'cancelled')).toBeNull();
    });

    it('rejects cancelling a completed series', () => {
      expect(validateSeriesStatusTransition('complete', 'cancelled')).not.toBeNull();
    });

    it('allows re-requesting the same status as a no-op, even cancelled -> cancelled', () => {
      expect(validateSeriesStatusTransition('cancelled', 'cancelled')).toBeNull();
    });

    it('is a no-op (allowed) when current equals next', () => {
      expect(validateSeriesStatusTransition('active', 'active')).toBeNull();
    });

    it('rejects an unknown status value', () => {
      expect(validateSeriesStatusTransition('created', 'bogus')).not.toBeNull();
    });
  });
});
