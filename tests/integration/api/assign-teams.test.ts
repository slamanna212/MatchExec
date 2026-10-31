import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from '../../utils/api-helpers';
import { seedBasicTestData, createMatch, createMatchParticipant, createGameMode } from '../../utils/fixtures';
import { getTestDb } from '../../utils/test-db';
import { POST as assignTeams } from '@/app/api/matches/[matchId]/assign-teams/route';
import { GET as getTeams } from '@/app/api/matches/[matchId]/teams/route';
import { GET as getSetup, PUT as putSetup } from '@/app/api/matches/[matchId]/setup/route';
import { createMatchTeams, createNamedMatchTeams, getMatchTeams } from '@/lib/match-setup';
import { validateMatchRequest } from '@/app/api/matches/helpers';

describe('assign-teams / setup routes', () => {
  let game: any;
  let mode: any;

  beforeEach(async () => {
    const data = await seedBasicTestData();
    game = data.game;
    mode = data.mode;
  });

  async function normalMatch(status = 'assign') {
    const match = await createMatch(game.id, mode.id, { status });
    await createMatchTeams(match.id);
    const teams = await getMatchTeams(match.id);
    return { match, blue: teams[0], red: teams[1], reserve: teams.find(t => t.is_reserve)! };
  }

  const post = async (matchId: string, body: unknown) =>
    parseResponse(await assignTeams(createMockRequest('POST', `/api/matches/${matchId}/assign-teams`, body as any), createRouteParams({ matchId })));

  it('preserves voice channels when voice fields are absent', async () => {
    const { match, blue } = await normalMatch();
    const db = getTestDb();
    await db.run('UPDATE match_teams SET voice_channel_id = ? WHERE id = ?', ['vc-1', blue.id]);
    await db.run('UPDATE matches SET blue_team_voice_channel = ?, red_team_voice_channel = ? WHERE id = ?', ['lb', 'lr', match.id]);
    const p = await createMatchParticipant(match.id, 'u1', 'P1');

    const { status } = await post(match.id, { teamAssignments: [{ participantId: p.id, teamId: blue.id }] });
    expect(status).toBe(200);

    const team = await db.get<any>('SELECT voice_channel_id FROM match_teams WHERE id = ?', [blue.id]);
    const m = await db.get<any>('SELECT blue_team_voice_channel, red_team_voice_channel FROM matches WHERE id = ?', [match.id]);
    expect(team.voice_channel_id).toBe('vc-1');
    expect(m.blue_team_voice_channel).toBe('lb');
    expect(m.red_team_voice_channel).toBe('lr');
  });

  it('writes voice channels when provided and derives team_assignment', async () => {
    const { match, blue, red, reserve } = await normalMatch();
    const db = getTestDb();
    const p1 = await createMatchParticipant(match.id, 'u1', 'P1');
    const p2 = await createMatchParticipant(match.id, 'u2', 'P2');
    const p3 = await createMatchParticipant(match.id, 'u3', 'P3');

    const { status } = await post(match.id, {
      teamAssignments: [
        { participantId: p1.id, teamId: blue.id },
        { participantId: p2.id, teamId: red.id },
        { participantId: p3.id, teamId: reserve.id },
      ],
      teamVoiceChannels: [{ teamId: red.id, channelId: 'vc-red' }],
    });
    expect(status).toBe(200);

    const rows = await db.all<any>('SELECT id, team_assignment, team_id FROM match_participants WHERE match_id = ?', [match.id]);
    const byId = Object.fromEntries(rows.map((r: any) => [r.id, r]));
    expect(byId[p1.id].team_assignment).toBe('blue');
    expect(byId[p1.id].team_id).toBe(blue.id);
    expect(byId[p2.id].team_assignment).toBe('red');
    expect(byId[p3.id].team_assignment).toBe('reserve');
    const t = await db.get<any>('SELECT voice_channel_id FROM match_teams WHERE id = ?', [red.id]);
    expect(t.voice_channel_id).toBe('vc-red');
  });

  it('rejects a team from another match with 400 and writes nothing', async () => {
    const a = await normalMatch();
    const b = await normalMatch();
    const db = getTestDb();
    const p1 = await createMatchParticipant(a.match.id, 'u1', 'P1');
    const p2 = await createMatchParticipant(a.match.id, 'u2', 'P2');

    const { status } = await post(a.match.id, {
      teamAssignments: [
        { participantId: p1.id, teamId: a.blue.id },
        { participantId: p2.id, teamId: b.blue.id },
      ],
    });
    expect(status).toBe(400);
    const row = await db.get<any>('SELECT team_id, team_assignment FROM match_participants WHERE id = ?', [p1.id]);
    expect(row.team_id).toBeNull();
    expect(row.team_assignment).toBeNull();
  });

  it('rejects a foreign team in teamVoiceChannels and does not save assignments', async () => {
    const a = await normalMatch();
    const b = await normalMatch();
    const db = getTestDb();
    const p1 = await createMatchParticipant(a.match.id, 'u1', 'P1');
    const { status } = await post(a.match.id, {
      teamAssignments: [{ participantId: p1.id, teamId: a.blue.id }],
      teamVoiceChannels: [{ teamId: b.blue.id, channelId: 'x' }],
    });
    expect(status).toBe(400);
    const row = await db.get<any>('SELECT team_id FROM match_participants WHERE id = ?', [p1.id]);
    expect(row.team_id).toBeNull();
  });

  it('gates on match status', async () => {
    const { match, blue } = await normalMatch('battle');
    const p = await createMatchParticipant(match.id, 'u1', 'P1');
    const { status } = await post(match.id, { teamAssignments: [{ participantId: p.id, teamId: blue.id }] });
    expect(status).toBe(409);
  });

  it('queues commander DMs only for changes, labelled with the team name', async () => {
    const { match, blue } = await normalMatch();
    const db = getTestDb();
    await db.run('UPDATE discord_settings SET commander_dm_enabled = 1 WHERE id = 1');
    const hasRow = await db.get<any>('SELECT id FROM discord_settings WHERE id = 1');
    if (!hasRow) return; // settings row not seeded in this environment
    const p = await createMatchParticipant(match.id, 'u1', 'P1');
    const body = { teamAssignments: [{ participantId: p.id, teamId: blue.id, receives_map_codes: true }] };

    await post(match.id, body);
    await post(match.id, body);
    const reqs = await db.all<any>("SELECT data FROM discord_bot_requests WHERE type = 'commander_dm'");
    expect(reqs).toHaveLength(1);
    expect(JSON.parse(reqs[0].data).team).toBe('Blue');
  });

  it('teams GET lazily creates teams for assign/battle matches', async () => {
    const match = await createMatch(game.id, mode.id, { status: 'battle' });
    const res = await parseResponse(await getTeams(createMockRequest('GET', `/api/matches/${match.id}/teams`), createRouteParams({ matchId: match.id })));
    expect(res.data.teams.filter((t: any) => !t.is_reserve)).toHaveLength(2);
  });

  describe('createMatchTeams', () => {
    it('clamps team count to 2..16 and adds a missing Reserve row', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'assign' });
      await createMatchTeams(match.id, 99);
      let teams = await getMatchTeams(match.id);
      expect(teams.filter(t => !t.is_reserve)).toHaveLength(16);
      const db = getTestDb();
      await db.run('DELETE FROM match_teams WHERE match_id = ? AND is_reserve = 1', [match.id]);
      await createMatchTeams(match.id);
      teams = await getMatchTeams(match.id);
      expect(teams.filter(t => t.is_reserve)).toHaveLength(1);
    });

    it('gives FFA late joiners their own team', async () => {
      const ffa = await createGameMode(game.id, { scoring_type: 'FFA', name: 'FFA' });
      const match = await createMatch(game.id, ffa.id, { status: 'assign' });
      const a = await createMatchParticipant(match.id, 'u1', 'Alice');
      await createMatchTeams(match.id);
      const b = await createMatchParticipant(match.id, 'u2', 'Bob');
      await createMatchTeams(match.id);
      const db = getTestDb();
      const rows = await db.all<any>('SELECT id, team_id FROM match_participants WHERE match_id = ?', [match.id]);
      expect(rows.every((r: any) => r.team_id)).toBe(true);
      expect(new Set(rows.map((r: any) => r.team_id)).size).toBe(2);
      expect(a.id).not.toBe(b.id);
      expect((await getMatchTeams(match.id)).filter(t => !t.is_reserve)).toHaveLength(2);
    });

    it('createNamedMatchTeams is idempotent and ordered', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'assign' });
      const ids = await createNamedMatchTeams(match.id, [{ name: 'Alpha' }, { name: 'Beta', color: '#fff' }]);
      const again = await createNamedMatchTeams(match.id, [{ name: 'Alpha' }, { name: 'Beta' }]);
      expect(ids).toHaveLength(2);
      expect(again).toEqual(ids);
      const teams = await getMatchTeams(match.id);
      expect(teams.map(t => t.team_name)).toEqual(['Alpha', 'Beta']);
    });
  });

  it('validateMatchRequest bounds teamCount', () => {
    const base = { name: 'x', gameId: 'g' };
    expect(validateMatchRequest({ ...base, teamCount: 1 }).valid).toBe(false);
    expect(validateMatchRequest({ ...base, teamCount: 17 }).valid).toBe(false);
    expect(validateMatchRequest({ ...base, teamCount: 4 }).valid).toBe(true);
  });

  describe('setup route (grid order / qualifying)', () => {
    it('persists and reloads grid order and qualifying times', async () => {
      const match = await createMatch(game.id, mode.id, { status: 'assign' });
      const a = await createMatchParticipant(match.id, 'u1', 'A');
      const b = await createMatchParticipant(match.id, 'u2', 'B');
      const res = await parseResponse(await putSetup(
        createMockRequest('PUT', `/api/matches/${match.id}/setup`, { gridOrder: [b.id, a.id], qualifyingTimes: { [a.id]: 92345, [b.id]: null } }),
        createRouteParams({ matchId: match.id })
      ));
      expect(res.status).toBe(200);
      const get = await parseResponse(await getSetup(createMockRequest('GET', `/api/matches/${match.id}/setup`), createRouteParams({ matchId: match.id })));
      expect(get.data.participants.map((p: any) => p.id)).toEqual([b.id, a.id]);
      expect(get.data.participants[1].qualifying_time_ms).toBe(92345);
      expect(get.data.participants[0].grid_position).toBe(1);
    });

    it('rejects participants from another match', async () => {
      const m1 = await createMatch(game.id, mode.id, { status: 'assign' });
      const m2 = await createMatch(game.id, mode.id, { status: 'assign' });
      const other = await createMatchParticipant(m2.id, 'u9', 'Z');
      const res = await parseResponse(await putSetup(
        createMockRequest('PUT', `/api/matches/${m1.id}/setup`, { gridOrder: [other.id] }),
        createRouteParams({ matchId: m1.id })
      ));
      expect(res.status).toBe(400);
    });

    it('rejects when match is not in gather/assign', async () => {
      const m = await createMatch(game.id, mode.id, { status: 'battle' });
      const res = await parseResponse(await putSetup(
        createMockRequest('PUT', `/api/matches/${m.id}/setup`, { gridOrder: [] }),
        createRouteParams({ matchId: m.id })
      ));
      expect(res.status).toBe(409);
    });
  });
});
