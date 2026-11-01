// @vitest-environment node
/**
 * Team setup and request validation on Postgres (ported from the old match-setup and match-api-helpers suites, plus
 * the createMatchTeams cases of assign-teams).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import { matchParticipants, matchTeams, matches } from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import {
  MAX_TEAM_COUNT, MAX_VOICE_CHANNELS_PER_MATCH, MIN_TEAM_COUNT, TeamAssignmentError, assignParticipantToTeam, createMatchTeams,
  createNamedMatchTeams, getMatchTeams, getTeamAssignments, listTeamsWithParticipants, setTeamVoiceChannel, validateMatchRequest,
  type MatchRequestBody,
} from '@/lib/matches';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});

const addPlayer = async (matchId: string, id: string, username: string, discord = `d-${id}`) => {
  await pg().insert(matchParticipants).values({ id, match_id: matchId, user_id: `u-${id}`, username, discord_user_id: discord });
  return id;
};
const active = (teams: Awaited<ReturnType<typeof getMatchTeams>>) => teams.filter((t) => !t.is_reserve);

describe('constants', () => {
  it('caps voice channels per match at 8 and teams at 2..16', () => {
    expect(MAX_VOICE_CHANNELS_PER_MATCH).toBe(8);
    expect([MIN_TEAM_COUNT, MAX_TEAM_COUNT]).toEqual([2, 16]);
  });
});

describe('createMatchTeams: Normal mode', () => {
  it('creates Blue (order 0) and Red (order 1)', async () => {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id);
    const a = active(await getMatchTeams(db, m.id));
    expect(a.map((t) => [t.team_name, t.team_order])).toEqual([['Blue', 0], ['Red', 1]]);
  });

  it('creates a Reserve slot', async () => {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id);
    const reserve = (await getMatchTeams(db, m.id)).filter((t) => t.is_reserve);
    expect(reserve).toHaveLength(1);
    expect(reserve[0].team_name).toBe('Reserve');
  });

  it('creates N numbered teams when teamCount > 2', async () => {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id, 4);
    expect(active(await getMatchTeams(db, m.id)).map((t) => t.team_name)).toEqual(['Team 1', 'Team 2', 'Team 3', 'Team 4']);
  });

  it('is idempotent: calling twice does not duplicate teams', async () => {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id);
    await createMatchTeams(db, m.id);
    expect(await getMatchTeams(db, m.id)).toHaveLength(3);
  });

  it('records team_count on the match', async () => {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id);
    expect((await pg().select().from(matches).where(eq(matches.id, m.id)))[0].team_count).toBe(2);
    const quad = await createMatch(gameId, modeId);
    await createMatchTeams(db, quad.id, 4);
    expect((await pg().select().from(matches).where(eq(matches.id, quad.id)))[0].team_count).toBe(4);
  });

  it('clamps the team count to 2..16 and adds a missing Reserve row on a later call', async () => {
    const big = await createMatch(gameId, modeId, { status: 'assign' });
    await createMatchTeams(db, big.id, 99);
    expect(active(await getMatchTeams(db, big.id))).toHaveLength(16);
    const small = await createMatch(gameId, modeId);
    await createMatchTeams(db, small.id, 1);
    expect(active(await getMatchTeams(db, small.id))).toHaveLength(2);

    await pg().delete(matchTeams).where(and(eq(matchTeams.match_id, big.id), eq(matchTeams.is_reserve, true)));
    await createMatchTeams(db, big.id);
    expect((await getMatchTeams(db, big.id)).filter((t) => t.is_reserve)).toHaveLength(1);
    expect(active(await getMatchTeams(db, big.id))).toHaveLength(16);
  });

  it('does nothing for an unknown match', async () => {
    await expect(createMatchTeams(db, 'ghost')).resolves.toBeUndefined();
  });
});

describe('createMatchTeams: FFA mode', () => {
  it('creates one team per participant, named after them', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'FFA Mode' });
    const m = await createMatch(gameId, ffa.id);
    for (const [id, name] of [['p_a', 'Alice'], ['p_b', 'Bob'], ['p_c', 'Carol']]) await addPlayer(m.id, id, name);
    await createMatchTeams(db, m.id);
    expect(active(await getMatchTeams(db, m.id)).map((t) => t.team_name).sort()).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('links each participant to their own team via team_id', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'FFA Mode 2' });
    const m = await createMatch(gameId, ffa.id);
    await addPlayer(m.id, 'p_x', 'Xavier');
    await createMatchTeams(db, m.id);
    const [p] = await pg().select().from(matchParticipants).where(eq(matchParticipants.id, 'p_x'));
    expect(p.team_id).not.toBeNull();
    const [team] = await pg().select().from(matchTeams).where(eq(matchTeams.id, p.team_id!));
    expect(team.team_name).toBe('Xavier');
  });

  it('gives late joiners their own team on the next call', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', name: 'FFA Late' });
    const m = await createMatch(gameId, ffa.id, { status: 'assign' });
    await addPlayer(m.id, 'a', 'Alice');
    await createMatchTeams(db, m.id);
    await addPlayer(m.id, 'b', 'Bob');
    await createMatchTeams(db, m.id);
    const rows = await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, m.id));
    expect(rows.every((r) => r.team_id)).toBe(true);
    expect(new Set(rows.map((r) => r.team_id)).size).toBe(2);
    expect(active(await getMatchTeams(db, m.id))).toHaveLength(2);
  });
});

describe('createNamedMatchTeams', () => {
  it('is idempotent and ordered', async () => {
    const m = await createMatch(gameId, modeId, { status: 'assign' });
    const ids = await createNamedMatchTeams(db, m.id, [{ name: 'Alpha' }, { name: 'Beta', color: '#fff' }]);
    const again = await createNamedMatchTeams(db, m.id, [{ name: 'Alpha' }, { name: 'Beta' }]);
    expect(ids).toHaveLength(2);
    expect(again).toEqual(ids);
    expect((await getMatchTeams(db, m.id)).map((t) => t.team_name)).toEqual(['Alpha', 'Beta']);
  });
});

describe('assignParticipantToTeam', () => {
  async function setup() {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id);
    return m;
  }
  const teamOf = async (participantId: string) => {
    const [p] = await pg().select().from(matchParticipants).where(eq(matchParticipants.id, participantId));
    return (await pg().select().from(matchTeams).where(eq(matchTeams.id, p.team_id!)))[0];
  };

  it('assigns to Blue by the legacy "blue" label', async () => {
    const m = await setup();
    await addPlayer(m.id, 'p_assign', 'Dave');
    await assignParticipantToTeam(db, m.id, 'p_assign', 'blue');
    expect((await teamOf('p_assign')).team_order).toBe(0);
  });

  it('assigns to Red by "red", to Reserve by "reserve" and by team id', async () => {
    const m = await setup();
    await addPlayer(m.id, 'p_red', 'Eve');
    await assignParticipantToTeam(db, m.id, 'p_red', 'red');
    expect((await teamOf('p_red')).team_order).toBe(1);
    await assignParticipantToTeam(db, m.id, 'p_red', 'reserve');
    expect((await teamOf('p_red')).is_reserve).toBe(true);
    const blue = (await getMatchTeams(db, m.id))[0];
    await assignParticipantToTeam(db, m.id, 'p_red', blue.id);
    expect((await teamOf('p_red')).id).toBe(blue.id);
  });

  it('rejects a team of another match, an unknown label and a foreign participant', async () => {
    const m = await setup();
    const other = await setup();
    await addPlayer(m.id, 'mine', 'Mine');
    await addPlayer(other.id, 'theirs', 'Theirs');
    const foreignTeam = (await getMatchTeams(db, other.id))[0];
    await expect(assignParticipantToTeam(db, m.id, 'mine', foreignTeam.id)).rejects.toBeInstanceOf(TeamAssignmentError);
    await expect(assignParticipantToTeam(db, m.id, 'mine', 'green')).rejects.toBeInstanceOf(TeamAssignmentError);
    await expect(assignParticipantToTeam(db, m.id, 'theirs', 'blue')).rejects.toThrow(/does not belong/);
  });
});

describe('getMatchTeams', () => {
  it('returns active teams by team_order and Reserve last', async () => {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id, 3);
    const teams = await getMatchTeams(db, m.id);
    expect(teams.map((t) => t.is_reserve)).toEqual([false, false, false, true]);
    expect(teams.slice(0, 3).map((t) => t.team_order)).toEqual([0, 1, 2]);
  });

  it('returns an empty list when the match has no teams', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await getMatchTeams(db, m.id)).toEqual([]);
  });
});

describe('setTeamVoiceChannel', () => {
  it('sets and clears voice_channel_id', async () => {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id);
    const blue = (await getMatchTeams(db, m.id))[0];
    await setTeamVoiceChannel(db, blue.id, '111222333444555');
    expect((await getMatchTeams(db, m.id))[0].voice_channel_id).toBe('111222333444555');
    await setTeamVoiceChannel(db, blue.id, null);
    expect((await getMatchTeams(db, m.id))[0].voice_channel_id).toBeNull();
  });

  it('refuses a team that belongs to a different match when scoped', async () => {
    const a = await createMatch(gameId, modeId);
    const b = await createMatch(gameId, modeId);
    await createMatchTeams(db, a.id);
    const team = (await getMatchTeams(db, a.id))[0];
    await expect(setTeamVoiceChannel(db, team.id, 'x', b.id)).rejects.toBeInstanceOf(TeamAssignmentError);
    expect((await getMatchTeams(db, a.id))[0].voice_channel_id).toBeNull();
  });
});

describe('team listings', () => {
  it('lists teams with their members and splits blue / red / reserves', async () => {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id);
    await addPlayer(m.id, 'p1', 'Ann');
    await addPlayer(m.id, 'p2', 'Ben');
    await addPlayer(m.id, 'p3', 'Cat');
    await addPlayer(m.id, 'p4', 'Dee');
    await assignParticipantToTeam(db, m.id, 'p1', 'blue');
    await assignParticipantToTeam(db, m.id, 'p2', 'red');
    await assignParticipantToTeam(db, m.id, 'p3', 'reserve');
    const listed = await listTeamsWithParticipants(db, m.id);
    expect(listed.map((t) => [t.team_name, t.participants.map((p) => p.username)])).toEqual([['Blue', ['Ann']], ['Red', ['Ben']], ['Reserve', ['Cat']]]);
    const sides = await getTeamAssignments(db, m.id);
    expect(sides.blueTeam.map((p) => p.username)).toEqual(['Ann']);
    expect(sides.redTeam.map((p) => p.username)).toEqual(['Ben']);
    expect(sides.reserves.map((p) => p.username).sort()).toEqual(['Cat', 'Dee']); // unassigned counts as reserve
    expect(await listTeamsWithParticipants(db, 'none')).toEqual([]);
  });
});

describe('validateMatchRequest', () => {
  const START = '2026-01-01T00:00:00.000Z';
  const base = { name: 'T', gameId: 'g1', startDate: START };
  const ok = (extra: Partial<MatchRequestBody> = {}) => validateMatchRequest({ ...base, ...extra }).valid;

  it('requires a name and a gameId', () => {
    expect(validateMatchRequest({ gameId: 'g1', startDate: START } as never).valid).toBe(false);
    expect(validateMatchRequest({ name: 'Test' } as never).valid).toBe(false);
  });

  it('enforces the maximum lengths', () => {
    expect(ok({ name: 'A'.repeat(256) })).toBe(false);
    expect(ok({ name: 'A'.repeat(255) })).toBe(true);
    expect(ok({ description: 'A'.repeat(1001) })).toBe(false);
    expect(ok({ livestreamLink: 'A'.repeat(501) })).toBe(false);
  });

  it('only accepts the casual and competitive rule sets', () => {
    expect(ok({ rules: 'ranked' })).toBe(false);
    expect(ok({ rules: 'casual' })).toBe(true);
    expect(ok({ rules: 'competitive' })).toBe(true);
  });

  it('bounds the rounds to 1..9', () => {
    expect([ok({ rounds: 0 }), ok({ rounds: 10 })]).toEqual([false, false]);
    expect([ok({ rounds: 1 }), ok({ rounds: 9 })]).toEqual([true, true]);
  });

  it('bounds teamCount to 2..16', () => {
    expect([ok({ teamCount: 1 }), ok({ teamCount: 17 })]).toEqual([false, false]);
    expect(ok({ teamCount: 4 })).toBe(true);
  });

  it('is valid with only the required fields, and with all optional fields undefined', () => {
    expect(validateMatchRequest(base).valid).toBe(true);
    expect(ok({ description: undefined, rules: undefined, rounds: undefined, livestreamLink: undefined })).toBe(true);
  });

  it('requires a parseable startDate (start_date is NOT NULL)', () => {
    const missing = validateMatchRequest({ name: 'T', gameId: 'g1' });
    expect(missing.valid).toBe(false);
    expect((missing as { error?: string }).error).toMatch(/startDate/);
    expect(validateMatchRequest({ name: 'T', gameId: 'g1', startDate: 'not-a-date' }).valid).toBe(false);
  });

  describe('positionScoringOverride', () => {
    it('accepts the flat form and the { type, pointsPerPosition } form', () => {
      expect(ok({ positionScoringOverride: { '1': 25, '2': 18 } })).toBe(true);
      expect(ok({ positionScoringOverride: { type: 'Position', pointsPerPosition: { '1': 10 } } as never })).toBe(true);
    });

    it('rejects an empty spread, non-numeric points and bad positions', () => {
      expect(ok({ positionScoringOverride: {} })).toBe(false);
      expect(ok({ positionScoringOverride: { '1': 'x' } as never })).toBe(false);
      expect(ok({ positionScoringOverride: { first: 5 } })).toBe(false);
      expect(ok({ positionScoringOverride: { '0': 5 } })).toBe(false);
    });
  });
});
