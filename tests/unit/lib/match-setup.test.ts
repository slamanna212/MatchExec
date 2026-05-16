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
  createMatchTeams,
  assignParticipantToTeam,
  getMatchTeams,
  setTeamVoiceChannel,
  MAX_VOICE_CHANNELS_PER_MATCH,
} from '@/lib/match-setup';

describe('match-setup', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  describe('MAX_VOICE_CHANNELS_PER_MATCH', () => {
    it('should be 8', () => {
      expect(MAX_VOICE_CHANNELS_PER_MATCH).toBe(8);
    });
  });

  describe('createMatchTeams — Normal mode', () => {
    it('creates Blue (order=0) and Red (order=1) teams for Normal matches', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString());

      const teams = await getMatchTeams(match.id.toString());
      const active = teams.filter(t => !t.is_reserve);

      expect(active).toHaveLength(2);
      expect(active[0].team_name).toBe('Blue');
      expect(active[0].team_order).toBe(0);
      expect(active[1].team_name).toBe('Red');
      expect(active[1].team_order).toBe(1);
    });

    it('creates a reserve slot for Normal matches', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString());

      const teams = await getMatchTeams(match.id.toString());
      const reserve = teams.filter(t => t.is_reserve);
      expect(reserve).toHaveLength(1);
      expect(reserve[0].team_name).toBe('Reserve');
    });

    it('creates N named teams when teamCount > 2', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString(), 4);

      const teams = await getMatchTeams(match.id.toString());
      const active = teams.filter(t => !t.is_reserve);

      expect(active).toHaveLength(4);
      expect(active.map(t => t.team_name)).toEqual(['Team 1', 'Team 2', 'Team 3', 'Team 4']);
    });

    it('is idempotent — calling twice does not duplicate teams', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString());
      await createMatchTeams(match.id.toString());

      const teams = await getMatchTeams(match.id.toString());
      const active = teams.filter(t => !t.is_reserve);
      expect(active).toHaveLength(2);
    });

    it('updates team_count on the match', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString());

      const db = getTestDb();
      const row = await new Promise<any>((resolve, reject) => {
        db.get(`SELECT team_count FROM matches WHERE id = ?`, [match.id], (err, r) => err ? reject(err) : resolve(r));
      });
      expect(row.team_count).toBe(2);
    });
  });

  describe('createMatchTeams — FFA mode', () => {
    it('creates one team per participant for FFA matches', async () => {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT OR IGNORE INTO game_modes (id, game_id, name, scoring_type) VALUES ('ffa-mode-ms', ?, 'FFA Mode', 'FFA')`,
          [game.id], (err) => err ? rej(err) : res()
        );
      });

      const match = await createMatch(game.id, 'ffa-mode-ms');

      // Insert participants
      for (const [id, username] of [['p_a', 'Alice'], ['p_b', 'Bob'], ['p_c', 'Carol']]) {
        await new Promise<void>((res, rej) => {
          db.run(
            `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [id, match.id, id, username], (err) => err ? rej(err) : res()
          );
        });
      }

      await createMatchTeams(match.id.toString());

      const teams = await getMatchTeams(match.id.toString());
      const active = teams.filter(t => !t.is_reserve);
      expect(active).toHaveLength(3);
      expect(active.map(t => t.team_name)).toEqual(expect.arrayContaining(['Alice', 'Bob', 'Carol']));
    });

    it('links each participant to their own team via team_id', async () => {
      const db = getTestDb();
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT OR IGNORE INTO game_modes (id, game_id, name, scoring_type) VALUES ('ffa-mode-ms2', ?, 'FFA Mode 2', 'FFA')`,
          [game.id], (err) => err ? rej(err) : res()
        );
      });

      const match = await createMatch(game.id, 'ffa-mode-ms2');
      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES ('p_x', ?, 'u_x', 'Xavier', CURRENT_TIMESTAMP)`,
          [match.id], (err) => err ? rej(err) : res()
        );
      });

      await createMatchTeams(match.id.toString());

      const participant = await new Promise<any>((res, rej) => {
        db.get(`SELECT team_id FROM match_participants WHERE id = 'p_x'`, (err, r) => err ? rej(err) : res(r));
      });
      expect(participant.team_id).not.toBeNull();

      // The team_id should reference a real match_teams row
      const team = await new Promise<any>((res, rej) => {
        db.get(`SELECT * FROM match_teams WHERE id = ?`, [participant.team_id], (err, r) => err ? rej(err) : res(r));
      });
      expect(team).not.toBeNull();
      expect(team.team_name).toBe('Xavier');
    });
  });

  describe('assignParticipantToTeam', () => {
    it('assigns participant to Blue team using legacy "blue" string', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString());

      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES ('p_assign', ?, 'u_assign', 'Dave', CURRENT_TIMESTAMP)`,
          [match.id], (err) => err ? rej(err) : res()
        );
      });

      await assignParticipantToTeam(match.id.toString(), 'p_assign', 'blue');

      const participant = await new Promise<any>((res, rej) => {
        db.get(`SELECT team_id, team_assignment FROM match_participants WHERE id = 'p_assign'`, (err, r) => err ? rej(err) : res(r));
      });

      expect(participant.team_assignment).toBe('blue');
      expect(participant.team_id).not.toBeNull();

      // Verify team_id points to the Blue row (team_order = 0)
      const team = await new Promise<any>((res, rej) => {
        db.get(`SELECT team_order FROM match_teams WHERE id = ?`, [participant.team_id], (err, r) => err ? rej(err) : res(r));
      });
      expect(team.team_order).toBe(0);
    });

    it('assigns participant to Red team using legacy "red" string', async () => {
      const db = getTestDb();
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString());

      await new Promise<void>((res, rej) => {
        db.run(
          `INSERT INTO match_participants (id, match_id, user_id, username, joined_at) VALUES ('p_red', ?, 'u_red', 'Eve', CURRENT_TIMESTAMP)`,
          [match.id], (err) => err ? rej(err) : res()
        );
      });

      await assignParticipantToTeam(match.id.toString(), 'p_red', 'red');

      const participant = await new Promise<any>((res, rej) => {
        db.get(`SELECT team_id FROM match_participants WHERE id = 'p_red'`, (err, r) => err ? rej(err) : res(r));
      });

      const team = await new Promise<any>((res, rej) => {
        db.get(`SELECT team_order FROM match_teams WHERE id = ?`, [participant.team_id], (err, r) => err ? rej(err) : res(r));
      });
      expect(team.team_order).toBe(1);
    });
  });

  describe('getMatchTeams', () => {
    it('returns teams ordered: non-reserve first by team_order, reserve last', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString());

      const teams = await getMatchTeams(match.id.toString());
      expect(teams.length).toBeGreaterThanOrEqual(2);
      // Active teams come first
      const active = teams.filter(t => !t.is_reserve);
      const reserve = teams.filter(t => t.is_reserve);
      // All active indices precede reserve indices
      const lastActiveIdx = teams.findLastIndex((t: any) => !t.is_reserve);
      const firstReserveIdx = teams.findIndex((t: any) => t.is_reserve);
      if (reserve.length > 0) {
        expect(lastActiveIdx).toBeLessThan(firstReserveIdx);
      }
      expect(active[0].team_order).toBeLessThan(active[1].team_order);
    });

    it('returns empty array for match with no teams', async () => {
      const match = await createMatch(game.id, mode.id);
      const teams = await getMatchTeams(match.id.toString());
      expect(teams).toHaveLength(0);
    });
  });

  describe('setTeamVoiceChannel', () => {
    it('updates voice_channel_id on a match_teams row', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString());

      const teams = await getMatchTeams(match.id.toString());
      const blue = teams.find(t => !t.is_reserve && t.team_order === 0)!;
      expect(blue).toBeDefined();

      await setTeamVoiceChannel(blue.id, '111222333444555');

      const db = getTestDb();
      const row = await new Promise<any>((res, rej) => {
        db.get(`SELECT voice_channel_id FROM match_teams WHERE id = ?`, [blue.id], (err, r) => err ? rej(err) : res(r));
      });
      expect(row.voice_channel_id).toBe('111222333444555');
    });

    it('can clear voice_channel_id by setting null', async () => {
      const match = await createMatch(game.id, mode.id);
      await createMatchTeams(match.id.toString());

      const teams = await getMatchTeams(match.id.toString());
      const blue = teams.find(t => !t.is_reserve && t.team_order === 0)!;

      await setTeamVoiceChannel(blue.id, '999888777');
      await setTeamVoiceChannel(blue.id, null);

      const db = getTestDb();
      const row = await new Promise<any>((res, rej) => {
        db.get(`SELECT voice_channel_id FROM match_teams WHERE id = ?`, [blue.id], (err, r) => err ? rej(err) : res(r));
      });
      expect(row.voice_channel_id).toBeNull();
    });
  });
});
