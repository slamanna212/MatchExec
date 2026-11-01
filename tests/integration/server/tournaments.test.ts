// @vitest-environment node
/** `/api/tournaments` CRUD, teams, participants, standings, bracket assignments and status transitions (Hono + Postgres). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatch, createTournament } from '../../utils/pg-fixtures';
import { bracketGame, insertParticipants, insertTeams, tournamentTransition } from '../../utils/pg-tournament-fixtures';
import {
  discordAnnouncementQueue, discordDeletionQueue, discordMatchMessages, discordStatusUpdateQueue, matchGamePlacements, matchGames, matchParticipants,
  matches, series, seriesEvents, tournamentMatches, tournamentParticipants, tournamentTeamMembers, tournamentTeams, tournaments,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', () => ({ logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});

const tp = (id: string, overrides: Partial<typeof tournaments.$inferInsert> = {}) => createTournament(gameId, { id, game_mode_id: modeId, ...overrides });

describe('GET /api/tournaments', () => {
  it('returns an empty array when no tournaments exist', async () => {
    const { status, data } = await appRequest('/api/tournaments');
    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('returns all non-complete tournaments by default, completed ones with ?status=complete', async () => {
    await tp('t1', { status: 'created' });
    await tp('t2', { status: 'gather' });
    await tp('t3', { status: 'complete' });
    const { status, data } = await appRequest('/api/tournaments');
    expect(status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data.map((t: any) => t.status)).not.toContain('complete');
    expect((await appRequest('/api/tournaments?status=complete')).data.map((t: any) => t.id)).toEqual(['t3']);
  });

  it('supports limit / offset, orders by updated_at and reports game info, participant counts and has_bracket', async () => {
    await tp('old', { updated_at: new Date('2026-01-01') });
    await tp('mid', { updated_at: new Date('2026-01-02'), status: 'gather' });
    await tp('new', { updated_at: new Date('2026-01-03') });
    await insertParticipants('mid', 3);
    await createMatch(gameId, modeId, { id: 'm1', tournament_id: 'new' });
    await pg().insert(tournamentMatches).values({ match_id: 'm1', tournament_id: 'new', round: 1, bracket_type: 'winners', match_order: 1 });

    const all = (await appRequest('/api/tournaments')).data;
    expect(all.map((t: any) => t.id)).toEqual(['new', 'mid', 'old']);
    expect(all.find((t: any) => t.id === 'mid')).toMatchObject({ participant_count: 3, has_bracket: false, game_name: 'Test Game' });
    expect(all.find((t: any) => t.id === 'new')).toMatchObject({ has_bracket: true, participant_count: 0 });
    expect((await appRequest('/api/tournaments?limit=1&offset=1')).data.map((t: any) => t.id)).toEqual(['mid']);
  });

  it('counts players on teams once signups are closed', async () => {
    await tp('t', { status: 'assign' });
    await insertTeams('t', 2, 3);
    expect((await appRequest('/api/tournaments')).data[0].participant_count).toBe(6);
  });

  it('answers 304 for a matching ETag and includes the series each tournament belongs to', async () => {
    await tp('t1');
    await pg().insert(series).values({ id: 's1', name: 'Spring' });
    await pg().insert(seriesEvents).values({ id: 'e1', series_id: 's1', event_type: 'tournament', tournament_id: 't1', event_order: 1 });
    const first = await appRequest('/api/tournaments');
    expect(first.data[0].series).toEqual([{ id: 's1', name: 'Spring' }]);
    const etag = first.headers.get('etag')!;
    expect(etag).toBeTruthy();
    expect((await appRequest('/api/tournaments', { headers: { 'if-none-match': etag } })).status).toBe(304);
    expect((await appRequest('/api/tournaments?limit=5', { headers: { 'if-none-match': etag } })).status).toBe(200);
  });
});

describe('POST /api/tournaments', () => {
  const body = (extra: Record<string, unknown> = {}) => ({ name: 'Test Tournament', gameId, gameModeId: modeId, format: 'single-elimination', roundsPerMatch: 3, ...extra });

  it('creates a tournament with valid data', async () => {
    const { status, data } = await appRequest('/api/tournaments', { method: 'POST', json: body() });
    expect(status).toBe(201);
    expect(data).toMatchObject({ name: 'Test Tournament', format: 'single-elimination', status: 'created', game_name: 'Test Game', participant_count: 0, has_bracket: false });
    expect(data.id).toMatch(/^tournament_/);
  });

  it('persists announcements, playerNotifications and livestreamLink', async () => {
    const announcements = [{ id: 'a1', value: 1, unit: 'hours' }];
    const { status, data } = await appRequest('/api/tournaments', {
      method: 'POST', json: body({ announcements, playerNotifications: false, livestreamLink: 'https://twitch.tv/test' }),
    });
    expect(status).toBe(201);
    expect(data.livestream_link).toBe('https://twitch.tv/test');
    expect(data.player_notifications).toBe(false);
    expect(data.announcements).toEqual(announcements);
  });

  it('stores dates, flags, ruleset and capacity', async () => {
    const { data } = await appRequest('/api/tournaments', {
      method: 'POST',
      json: body({ startDate: '2026-06-01T10:00:00Z', startTime: '2026-06-01T18:30:00Z', ruleset: 'competitive', maxParticipants: 32, allowPlayerTeamSelection: true, allowMatchEditing: false, statsEnabled: true }),
    });
    expect(new Date(data.start_date).toISOString()).toBe('2026-06-01T10:00:00.000Z');
    expect(new Date(data.start_time).toISOString()).toBe('2026-06-01T18:30:00.000Z');
    expect(data).toMatchObject({ ruleset: 'competitive', max_participants: 32, allow_player_team_selection: true, allow_match_editing: false, stats_enabled: true });
  });

  it('rejects missing required fields, an invalid format, bad ranges and an unparseable date', async () => {
    expect((await appRequest('/api/tournaments', { method: 'POST', json: { name: 'Test Tournament' } })).status).toBe(400);
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ format: 'invalid-format' }) })).status).toBe(400);
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ roundsPerMatch: 12 }) })).status).toBe(400);
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ maxParticipants: 2 }) })).status).toBe(400);
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ ruleset: 'weird' }) })).status).toBe(400);
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ name: 'x'.repeat(256) }) })).status).toBe(400);
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ startDate: 'not-a-date' }) })).status).toBe(400);
  });

  it('rejects a mode that does not belong to the game, and malformed JSON', async () => {
    const other = await createGame();
    const otherMode = await createGameMode(other.id);
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ gameModeId: otherMode.id }) })).status).toBe(400);
    const res = await appRequest('/api/tournaments', { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
  });

  it('accepts Overwatch 2 team-size options only for 5v5 / 6v6', async () => {
    await pg().insert((await import('../../../lib/db/schema')).games).values({ id: 'overwatch2', name: 'Overwatch 2' }).onConflictDoNothing();
    const ok = await appRequest('/api/tournaments', { method: 'POST', json: body({ gameId: 'overwatch2', gameModeId: 'ow2-5v5' }) });
    expect(ok.status).toBe(201);
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ gameId: 'overwatch2', gameModeId: 'ow2-3v3' }) })).status).toBe(400);
  });

  it('creates a cumulative-points tournament for an FFA mode, rejects brackets for FFA and cumulative for Normal', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA' });
    const ok = await appRequest('/api/tournaments', { method: 'POST', json: body({ gameModeId: ffa.id, format: 'cumulative-points', roundsPerMatch: 1 }) });
    expect(ok.status).toBe(201);
    expect(ok.data.format).toBe('cumulative-points');
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ gameModeId: ffa.id, format: 'single-elimination' }) })).status).toBe(400);
    expect((await appRequest('/api/tournaments', { method: 'POST', json: body({ format: 'cumulative-points' }) })).status).toBe(400);
  });

  it('validates positionScoringOverride and stores a valid one (JSON string or object)', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'Position' });
    const base = body({ gameModeId: ffa.id, format: 'cumulative-points', roundsPerMatch: 1 });
    expect((await appRequest('/api/tournaments', { method: 'POST', json: { ...base, positionScoringOverride: 'garbage' } })).status).toBe(400);
    const str = await appRequest('/api/tournaments', { method: 'POST', json: { ...base, positionScoringOverride: JSON.stringify({ '1': 10, '2': 5 }) } });
    expect(str.status).toBe(201);
    expect(str.data.position_scoring_override).toEqual({ '1': 10, '2': 5 });
    const obj = await appRequest('/api/tournaments', { method: 'POST', json: { ...base, positionScoringOverride: { '1': 7 } } });
    expect(obj.status).toBe(201);
    expect(obj.data.position_scoring_override).toEqual({ '1': 7 });
  });
});

describe('GET /api/tournaments/:id', () => {
  it('returns tournament details with game info and teams', async () => {
    await tp('t1', { name: 'Test Tournament', livestream_link: 'https://twitch.tv/test', player_notifications: false });
    const { status, data } = await appRequest('/api/tournaments/t1');
    expect(status).toBe(200);
    expect(data).toMatchObject({ id: 't1', name: 'Test Tournament', livestream_link: 'https://twitch.tv/test', player_notifications: false, game_name: 'Test Game', teams: [], participant_count: 0 });
  });

  it('groups members by team (teams by name, members by join time) and attaches the last known avatar', async () => {
    await tp('t1', { status: 'assign' });
    await pg().insert(tournamentTeams).values([{ id: 'tb', tournament_id: 't1', team_name: 'Bravo' }, { id: 'ta', tournament_id: 't1', team_name: 'Alpha' }]);
    await pg().insert(tournamentTeamMembers).values([
      { id: 'm2', team_id: 'ta', user_id: 'u2', discord_user_id: 'd2', username: 'Second', joined_at: new Date('2026-01-02'), is_captain: true },
      { id: 'm1', team_id: 'ta', user_id: 'u1', discord_user_id: 'd1', username: 'First', joined_at: new Date('2026-01-01') },
    ]);
    const match = await createMatch(gameId, modeId);
    await pg().insert(matchParticipants).values({ id: 'mp1', match_id: match.id, user_id: 'u1', discord_user_id: 'd1', username: 'First', avatar_url: 'https://cdn/a.png' });

    const { data } = await appRequest('/api/tournaments/t1');
    expect(data.teams.map((t: any) => t.team_name)).toEqual(['Alpha', 'Bravo']);
    expect(data.teams[0].members.map((m: any) => m.username)).toEqual(['First', 'Second']);
    expect(data.teams[0].members[0]).toMatchObject({ avatar_url: 'https://cdn/a.png', is_captain: false, team_id: 'ta' });
    expect(data.teams[0].members[1].is_captain).toBe(true);
    expect(data.teams[1].members).toEqual([]);
    expect(data.participant_count).toBe(2);
  });

  it('returns 404 for a missing tournament and 400 for an oversize id', async () => {
    expect((await appRequest('/api/tournaments/nonexistent')).status).toBe(404);
    expect((await appRequest(`/api/tournaments/${'x'.repeat(101)}`)).status).toBe(400);
  });
});

describe('PUT /api/tournaments/:id', () => {
  it('updates editable fields', async () => {
    await tp('t-edit', { name: 'Original Name' });
    const { status, data } = await appRequest('/api/tournaments/t-edit', {
      method: 'PUT', json: { name: 'Updated Name', livestreamLink: 'https://twitch.tv/updated', playerNotifications: false, allowMatchEditing: false },
    });
    expect(status).toBe(200);
    expect(data).toMatchObject({ name: 'Updated Name', livestream_link: 'https://twitch.tv/updated', player_notifications: false, allow_match_editing: false, game_name: 'Test Game' });
  });

  it('persists announcements, dates and the scoring override on update', async () => {
    await tp('t-edit');
    const announcements = [{ id: 'x1', value: 30, unit: 'minutes' }];
    const { data } = await appRequest('/api/tournaments/t-edit', {
      method: 'PUT', json: { announcements, startDate: '2026-07-01T00:00:00Z', positionScoringOverride: JSON.stringify({ '1': 3 }) },
    });
    expect(data.announcements).toEqual(announcements);
    expect(new Date(data.start_date).toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(data.position_scoring_override).toEqual({ '1': 3 });
    const cleared = await appRequest('/api/tournaments/t-edit', { method: 'PUT', json: { announcements: null, startDate: null, positionScoringOverride: '' } });
    expect(cleared.data).toMatchObject({ announcements: null, start_date: null, position_scoring_override: null });
  });

  it('rejects a malformed positionScoringOverride, over-long fields and a bad date', async () => {
    await tp('t-edit');
    expect((await appRequest('/api/tournaments/t-edit', { method: 'PUT', json: { positionScoringOverride: 'garbage' } })).status).toBe(400);
    expect((await appRequest('/api/tournaments/t-edit', { method: 'PUT', json: { name: 'x'.repeat(256) } })).status).toBe(400);
    expect((await appRequest('/api/tournaments/t-edit', { method: 'PUT', json: { startDate: 'nope' } })).status).toBe(400);
  });

  it('returns 404 for a missing tournament and 400 when no valid fields are provided', async () => {
    expect((await appRequest('/api/tournaments/nonexistent', { method: 'PUT', json: { name: 'X' } })).status).toBe(404);
    await tp('t-edit');
    expect((await appRequest('/api/tournaments/t-edit', { method: 'PUT', json: {} })).status).toBe(400);
  });
});

describe('DELETE /api/tournaments/:id', () => {
  it('deletes an existing tournament', async () => {
    await tp('t1');
    const { status } = await appRequest('/api/tournaments/t1', { method: 'DELETE' });
    expect(status).toBe(200);
    expect(await pg().select().from(tournaments).where(eq(tournaments.id, 't1'))).toHaveLength(0);
  });

  it('returns 404 for a missing tournament', async () => {
    expect((await appRequest('/api/tournaments/nonexistent', { method: 'DELETE' })).status).toBe(404);
  });

  it('refuses while matches are still active', async () => {
    await tp('t1');
    await createMatch(gameId, modeId, { id: 'live', tournament_id: 't1', status: 'battle' });
    expect((await appRequest('/api/tournaments/t1', { method: 'DELETE' })).status).toBe(400);
    expect(await pg().select().from(tournaments).where(eq(tournaments.id, 't1'))).toHaveLength(1);
  });

  it('removes teams, signups, bracket rows, matches (with games / placements / participants) and series events, and queues Discord deletions', async () => {
    await tp('t1', { status: 'complete' });
    const [a, b] = await insertTeams('t1', 2, 2);
    const m = await createMatch(gameId, modeId, { id: 'm1', tournament_id: 't1', status: 'complete' });
    await pg().insert(tournamentMatches).values({ match_id: m.id, tournament_id: 't1', round: 1, bracket_type: 'winners', team1_id: a, team2_id: b, match_order: 1 });
    await pg().insert(matchGames).values({ id: 'g1', match_id: m.id, round: 1, status: 'completed' });
    await pg().insert(matchGamePlacements).values({ id: 'pl1', match_game_id: 'g1', entity_type: 'team', entity_id: a, is_winner: true });
    await pg().insert(matchParticipants).values({ id: 'mp1', match_id: m.id, user_id: 'u', username: 'U' });
    await pg().insert(series).values({ id: 's1', name: 'S' });
    await pg().insert(seriesEvents).values({ id: 'se1', series_id: 's1', event_type: 'tournament', tournament_id: 't1', event_order: 1 });
    await pg().insert(discordMatchMessages).values({ id: 'dm1', match_id: 't1', message_id: 'x', channel_id: 'c', message_type: 'announcement' });

    expect((await appRequest('/api/tournaments/t1', { method: 'DELETE' })).status).toBe(200);
    expect(await pg().select().from(tournamentTeams)).toHaveLength(0);
    expect(await pg().select().from(tournamentTeamMembers)).toHaveLength(0);
    expect(await pg().select().from(tournamentParticipants)).toHaveLength(0);
    expect(await pg().select().from(tournamentMatches)).toHaveLength(0);
    expect(await pg().select().from(matches)).toHaveLength(0);
    expect(await pg().select().from(matchGames)).toHaveLength(0);
    expect(await pg().select().from(matchGamePlacements)).toHaveLength(0);
    expect(await pg().select().from(matchParticipants)).toHaveLength(0);
    expect(await pg().select().from(seriesEvents)).toHaveLength(0);
    expect(await pg().select().from(series)).toHaveLength(1);
    // The bot reads the message rows after the tournament is gone, so they stay; deletions are queued for the tournament and its match.
    expect(await pg().select().from(discordMatchMessages)).toHaveLength(1);
    expect((await pg().select().from(discordDeletionQueue)).map((r) => r.match_id).sort()).toEqual(['m1', 't1']);
  });
});

describe('tournament teams', () => {
  it('returns an empty teams array for a new tournament and 404 for a missing one', async () => {
    await tp('t-teams');
    expect((await appRequest('/api/tournaments/t-teams/teams')).data).toEqual([]);
    expect((await appRequest('/api/tournaments/nope/teams')).status).toBe(404);
  });

  it('creates a team (trimmed), rejects duplicates, blanks, over-long names and unknown tournaments', async () => {
    await tp('t1');
    const { status, data } = await appRequest('/api/tournaments/t1/teams', { method: 'POST', json: { teamName: '  Alpha Team ' } });
    expect(status).toBe(201);
    expect(data).toMatchObject({ team_name: 'Alpha Team', members: [], tournament_id: 't1' });
    expect((await appRequest('/api/tournaments/t1/teams', { method: 'POST', json: { teamName: 'Alpha Team' } })).status).toBe(409);
    expect((await appRequest('/api/tournaments/t1/teams', { method: 'POST', json: { teamName: '   ' } })).status).toBe(400);
    expect((await appRequest('/api/tournaments/t1/teams', { method: 'POST', json: {} })).status).toBe(400);
    expect((await appRequest('/api/tournaments/t1/teams', { method: 'POST', json: { teamName: 'x'.repeat(101) } })).status).toBe(400);
    expect((await appRequest('/api/tournaments/missing/teams', { method: 'POST', json: { teamName: 'A' } })).status).toBe(404);
  });

  it('lets the same team name exist in two different tournaments', async () => {
    await tp('t1');
    await tp('t2');
    expect((await appRequest('/api/tournaments/t1/teams', { method: 'POST', json: { teamName: 'Same' } })).status).toBe(201);
    expect((await appRequest('/api/tournaments/t2/teams', { method: 'POST', json: { teamName: 'Same' } })).status).toBe(201);
  });

  it('deletes a team', async () => {
    await tp('t1');
    const [teamId] = await insertTeams('t1', 1);
    const { status, data } = await appRequest(`/api/tournaments/t1/teams?teamId=${teamId}`, { method: 'DELETE' });
    expect(status).toBe(200);
    expect(data).toHaveProperty('success', true);
    expect(await pg().select().from(tournamentTeams).where(eq(tournamentTeams.id, teamId))).toHaveLength(0);
  });

  it('requires a teamId and 404s for a team of another tournament', async () => {
    await tp('t1');
    await tp('t2');
    const [other] = await insertTeams('t2', 1);
    expect((await appRequest('/api/tournaments/t1/teams', { method: 'DELETE' })).status).toBe(400);
    expect((await appRequest(`/api/tournaments/t1/teams?teamId=${other}`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('tournament participants', () => {
  it('returns an empty list for a new tournament', async () => {
    await tp('t1');
    const { status, data } = await appRequest('/api/tournaments/t1/participants');
    expect(status).toBe(200);
    expect(data.participants).toEqual([]);
    expect(data.signupConfig).toBeNull();
  });

  it('returns participants in join order with their signup_data', async () => {
    await tp('t1');
    await pg().insert(tournamentParticipants).values([
      { id: 'tp2', tournament_id: 't1', user_id: 'u2', discord_user_id: 'discord-u2', username: 'Player2', signup_data: { rank: 'gold' }, joined_at: new Date('2026-01-02') },
      { id: 'tp1', tournament_id: 't1', user_id: 'u1', discord_user_id: 'discord-u1', username: 'Player1', joined_at: new Date('2026-01-01') },
    ]);
    const { data } = await appRequest('/api/tournaments/t1/participants');
    expect(data.participants.map((p: any) => p.username)).toEqual(['Player1', 'Player2']);
    expect(data.participants[0].signup_data).toBeNull();
    expect(data.participants[1].signup_data).toEqual({ rank: 'gold' });
  });
});

describe('GET /api/tournaments/:id/standings', () => {
  it('returns empty standings for a tournament with no teams, 404 for a missing one', async () => {
    await tp('t1');
    const { status, data } = await appRequest('/api/tournaments/t1/standings');
    expect(status).toBe(200);
    expect(data.standings).toEqual([]);
    expect((await appRequest('/api/tournaments/nope/standings')).status).toBe(404);
  });

  it('returns win / loss rows for an elimination tournament, best first', async () => {
    await tp('t1');
    const [a, b, c] = await insertTeams('t1', 3);
    await pg().update(tournamentTeams).set({ team_name: 'Alpha' }).where(eq(tournamentTeams.id, a));
    await pg().update(tournamentTeams).set({ team_name: 'Bravo' }).where(eq(tournamentTeams.id, b));
    await pg().update(tournamentTeams).set({ team_name: 'Charlie' }).where(eq(tournamentTeams.id, c));
    await createMatch(gameId, modeId, { id: 'm1', tournament_id: 't1', status: 'complete', blue_team_id: a, red_team_id: b, winner_team: a });
    await createMatch(gameId, modeId, { id: 'm2', tournament_id: 't1', status: 'complete', blue_team_id: a, red_team_id: c, winner_team: c });
    await createMatch(gameId, modeId, { id: 'm3', tournament_id: 't1', status: 'battle', blue_team_id: b, red_team_id: c });
    const { data } = await appRequest('/api/tournaments/t1/standings');
    expect(data.standings.map((s: any) => [s.team_name, s.matches_played, s.wins, s.losses])).toEqual([
      ['Charlie', 1, 1, 0], ['Alpha', 2, 1, 1], ['Bravo', 1, 0, 1],
    ]);
  });

  it('returns a ranked per-player leaderboard for cumulative-points, counting only completed games and sharing ranks on ties', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA' });
    await tp('t1', { game_mode_id: ffa.id, format: 'cumulative-points' });
    await createMatch(gameId, ffa.id, { id: 'm1', status: 'battle', tournament_id: 't1' });
    const people = [['p1', 'd1', 'Alice'], ['p2', 'd2', 'Bob'], ['p3', 'd3', 'Cara']] as const;
    for (const [id, d, name] of people) await pg().insert(matchParticipants).values({ id, match_id: 'm1', user_id: id, discord_user_id: d, username: name });
    await pg().insert(matchGames).values([{ id: 'mg-done', match_id: 'm1', round: 1, status: 'completed' }, { id: 'mg-open', match_id: 'm1', round: 2, status: 'pending' }]);
    await pg().insert(matchGamePlacements).values([
      { id: 'pl1', match_game_id: 'mg-done', entity_type: 'participant', entity_id: 'p1', position: 1, points_awarded: 25, is_winner: true },
      { id: 'pl2', match_game_id: 'mg-done', entity_type: 'participant', entity_id: 'p2', position: 2, points_awarded: 18 },
      { id: 'pl4', match_game_id: 'mg-done', entity_type: 'participant', entity_id: 'p3', position: 3, points_awarded: 18 },
      { id: 'pl3', match_game_id: 'mg-open', entity_type: 'participant', entity_id: 'p1', position: 1, points_awarded: 999, is_winner: true },
    ]);
    const { status, data } = await appRequest('/api/tournaments/t1/standings');
    expect(status).toBe(200);
    expect(data.standings).toHaveLength(3);
    expect(data.standings.map((s: any) => [s.username, s.rank, s.total_points, s.matches_played, s.best_position])).toEqual([
      ['Alice', 1, 25, 1, 1], ['Bob', 2, 18, 1, 2], ['Cara', 2, 18, 1, 3],
    ]);
  });
});

describe('POST /api/tournaments/:id/bracket-assignments', () => {
  it('returns 400 when assignments are missing or not an array', async () => {
    await tp('t1');
    expect((await appRequest('/api/tournaments/t1/bracket-assignments', { method: 'POST', json: {} })).status).toBe(400);
    expect((await appRequest('/api/tournaments/t1/bracket-assignments', { method: 'POST', json: { assignments: 'invalid' } })).status).toBe(400);
  });

  it('returns 404 when the tournament is not in the assign phase', async () => {
    await tp('t1');
    expect((await appRequest('/api/tournaments/t1/bracket-assignments', { method: 'POST', json: { assignments: [] } })).status).toBe(404);
  });

  it('accepts empty assignments, and valid ones for the tournament\'s own teams', async () => {
    await tp('t1', { status: 'assign' });
    const ok = await appRequest('/api/tournaments/t1/bracket-assignments', { method: 'POST', json: { assignments: [] } });
    expect(ok.status).toBe(200);
    expect(ok.data.message).toContain('saved');
    const [team] = await insertTeams('t1', 1);
    const withTeam = await appRequest('/api/tournaments/t1/bracket-assignments', { method: 'POST', json: { assignments: [{ position: 1, teamId: team }] } });
    expect(withTeam.status).toBe(200);
    expect(withTeam.data.assignments).toEqual([{ position: 1, teamId: team }]);
  });

  it('returns 400 for a team that is not in the tournament', async () => {
    await tp('t1', { status: 'assign' });
    expect((await appRequest('/api/tournaments/t1/bracket-assignments', { method: 'POST', json: { assignments: [{ position: 1, teamId: 'nonexistent-team' }] } })).status).toBe(400);
  });
});

describe('GET /api/tournaments/:id/matches', () => {
  it('returns empty matches for a new tournament', async () => {
    await tp('t1');
    const { status, data } = await appRequest('/api/tournaments/t1/matches');
    expect(status).toBe(200);
    expect(data).toEqual({ matches: [], count: 0 });
  });

  it('shapes bracket matches (status mapping, winners, unknown sides) and derives a missing winner from the games', async () => {
    const ctx = await bracketGame();
    await tp('t1', { game_mode_id: ctx.modeId });
    const [a, b] = await insertTeams('t1', 2);
    const mk = async (id: string, status: 'assign' | 'battle' | 'complete', order: number, extra: Partial<typeof matches.$inferInsert> = {}) => {
      await createMatch(ctx.gameId, ctx.modeId, { id, tournament_id: 't1', status, tournament_round: 1, tournament_bracket_type: 'winners', team1_name: 'Alpha', team2_name: 'Bravo', ...extra });
      await pg().insert(tournamentMatches).values({ match_id: id, tournament_id: 't1', round: 1, bracket_type: 'winners', team1_id: a, team2_id: b, match_order: order });
    };
    await mk('m-pending', 'assign', 1);
    await mk('m-live', 'battle', 2);
    await mk('m-done', 'complete', 3, { winner_team: b });
    const { data } = await appRequest('/api/tournaments/t1/matches');
    expect(data.count).toBe(3);
    expect(data.matches.map((m: any) => [m.id, m.status, m.rawStatus, m.winner])).toEqual([
      ['m-pending', 'pending', 'assign', undefined], ['m-live', 'ongoing', 'battle', undefined], ['m-done', 'complete', 'complete', b],
    ]);
    expect(data.matches[0]).toMatchObject({ round: 1, bracket_type: 'winners', team1: { id: a, name: 'Alpha' }, team2: { id: b, name: 'Bravo' }, match_order: 1 });
  });
});

describe('tournament transitions', () => {
  it('moves created -> gather and queues the Discord signup announcement once', async () => {
    await tp('t-trans');
    const { status, data } = await tournamentTransition('t-trans', 'gather');
    expect(status).toBe(200);
    expect(data).toMatchObject({ status: 'gather', game_name: 'Test Game' });
    const rows = await pg().select().from(discordAnnouncementQueue).where(eq(discordAnnouncementQueue.match_id, 't-trans'));
    expect(rows.map((r) => r.announcement_type)).toEqual(['tournament']);
  });

  it('rejects backward moves, skipped phases, repeats, terminal exits and unknown statuses; 404 for a missing tournament', async () => {
    await tp('t-back', { status: 'gather' });
    expect((await tournamentTransition('t-back', 'created')).status).toBe(400);
    expect((await tournamentTransition('t-back', 'battle')).status).toBe(400);
    expect((await tournamentTransition('t-back', 'gather')).data.error).toContain('already');
    expect((await tournamentTransition('t-back', 'banana')).status).toBe(400);
    await tp('t-done', { status: 'complete' });
    expect((await tournamentTransition('t-done', 'gather')).status).toBe(400);
    expect((await tournamentTransition('nonexistent', 'gather')).status).toBe(404);
    expect(await pg().select().from(discordAnnouncementQueue)).toHaveLength(0);
  });

  it('requires teams with members before battle', async () => {
    await tp('t1', { status: 'assign' });
    expect((await tournamentTransition('t1', 'battle')).data.error).toContain('At least 2 teams');
    await insertTeams('t1', 2, 0);
    expect((await tournamentTransition('t1', 'battle')).data.error).toContain('members');
  });

  it('assign: auto-creates solo teams for individual modes, queues the status update, and updates matches\' Discord messages', async () => {
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA', team_size: null });
    await tp('t1', { status: 'gather', game_mode_id: ffa.id, format: 'cumulative-points' });
    await insertParticipants('t1', 3);
    await createMatch(gameId, ffa.id, { id: 'tm1', tournament_id: 't1', status: 'assign' });
    expect((await tournamentTransition('t1', 'assign')).status).toBe(200);

    const teams = await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, 't1'));
    expect(teams).toHaveLength(3);
    expect(await pg().select().from(tournamentTeamMembers)).toHaveLength(3);
    const assigned = await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.tournament_id, 't1'));
    expect(assigned.every((p) => teams.some((t) => t.id === p.team_assignment))).toBe(true);
    expect((await pg().select().from(discordStatusUpdateQueue)).map((r) => r.match_id).sort()).toEqual(['t1', 'tm1']);
  });

  it('assign: leaves existing teams alone and creates none for team modes', async () => {
    await tp('t1', { status: 'gather' });
    await insertParticipants('t1', 4);
    expect((await tournamentTransition('t1', 'assign')).status).toBe(200);
    expect(await pg().select().from(tournamentTeams)).toHaveLength(0);
  });

  it('end states queue a Discord event deletion only when the tournament has a Discord event', async () => {
    await tp('t-with', { status: 'battle' });
    await tp('t-without', { status: 'battle' });
    await pg().insert(discordMatchMessages).values({ id: 'dm', match_id: 't-with', message_id: 'm', channel_id: 'c', message_type: 'announcement', discord_event_id: 'ev1' });
    expect((await tournamentTransition('t-with', 'cancelled')).status).toBe(200);
    expect((await tournamentTransition('t-without', 'complete')).status).toBe(200);
    expect((await pg().select().from(discordDeletionQueue)).map((r) => r.match_id)).toEqual(['t-with']);
  });
});

describe('tournament signups through the domain', () => {
  it('addParticipant enforces uniqueness, capacity and joins the chosen team', async () => {
    const { addParticipant, listParticipants } = await import('@/lib/tournaments');
    const { db } = await import('../../../lib/db');
    await tp('t1', { status: 'gather' });
    const [team] = await insertTeams('t1', 1);
    const base = { tournamentId: 't1', userId: 'u1', discordUserId: 'd1', username: 'One', signupData: { a: 1 } };
    expect((await addParticipant(db, { ...base, teamId: team }, { capacity: 2 })).status).toBe('added');
    expect((await addParticipant(db, base, { capacity: 2 })).status).toBe('duplicate');
    expect((await addParticipant(db, { ...base, userId: 'u2', discordUserId: 'd2' }, { capacity: 2 })).status).toBe('added');
    expect((await addParticipant(db, { ...base, userId: 'u3', discordUserId: 'd3' }, { capacity: 2 })).status).toBe('full');
    expect(await listParticipants(db, 't1')).toHaveLength(2);
    const members = await pg().select().from(tournamentTeamMembers);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ team_id: team, user_id: 'u1' });
  });
});
