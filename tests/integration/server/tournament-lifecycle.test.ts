// @vitest-environment node
/** Tournament lifecycle through the routes: created -> gather -> assign -> generate -> battle -> complete, plus generate / progress / team routes and cumulative-points. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createTournament } from '../../utils/pg-fixtures';
import { bracketGame, completeMatch, generateBracket, insertParticipants, insertTeams, progressBracket, tournamentTransition } from '../../utils/pg-tournament-fixtures';
import {
  discordMatchWinnerQueue, gameMaps, matchGamePlacements, matchGames, matchParticipants, matchTeams, matches, tournamentMatches,
  tournamentParticipants, tournamentTeamMembers, tournamentTeams, tournaments,
} from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));
vi.mock('@/lib/matches/voice-channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/matches/voice-channels')>()),
  VoiceChannelService: { setupMatchVoiceChannels: vi.fn().mockResolvedValue(true), queueVoiceAnnouncement: vi.fn().mockResolvedValue(undefined) },
}));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  const g = await bracketGame({ maps: 3 });
  gameId = g.gameId;
  modeId = g.modeId;
});
const tp = (id: string, o: Partial<typeof tournaments.$inferInsert> = {}) => createTournament(gameId, { id, game_mode_id: modeId, rounds_per_match: 1, ...o });

describe('full lifecycle', () => {
  it('walks a tournament from created to complete and reports standings', async () => {
    const t = await tp('life');
    const team1 = (await appRequest('/api/tournaments/life/teams', { method: 'POST', json: { teamName: 'Red Dragons' } })).data;
    const team2 = (await appRequest('/api/tournaments/life/teams', { method: 'POST', json: { teamName: 'Blue Phoenix' } })).data;
    expect((await appRequest('/api/tournaments/life/teams')).data).toHaveLength(2);

    expect((await tournamentTransition(t.id, 'gather')).data.status).toBe('gather');
    expect((await tournamentTransition(t.id, 'assign')).data.status).toBe('assign');

    const gen = await generateBracket(t.id);
    expect(gen.status).toBe(200);
    expect(gen.data).toMatchObject({ matchCount: 1, format: 'single-elimination' });
    const [match] = await pg().select().from(matches).where(eq(matches.tournament_id, t.id));

    await pg().insert(tournamentTeamMembers).values([
      { id: 'mem1', team_id: team1.id, user_id: 'u1', discord_user_id: 'du1', username: 'Player1' },
      { id: 'mem2', team_id: team2.id, user_id: 'u2', discord_user_id: 'du2', username: 'Player2' },
    ]);
    const battle = await tournamentTransition(t.id, 'battle');
    expect(battle.data.status).toBe('battle');
    expect((await pg().select().from(matches).where(eq(matches.id, match.id)))[0].status).toBe('battle');

    await completeMatch(match.id, team1.id);
    expect((await tournamentTransition(t.id, 'complete')).data.status).toBe('complete');

    const standings = (await appRequest(`/api/tournaments/${t.id}/standings`)).data.standings;
    expect(standings).toHaveLength(2);
    expect(standings.find((s: any) => s.team_name === 'Red Dragons')).toMatchObject({ wins: 1, losses: 0 });
    expect(standings.find((s: any) => s.team_name === 'Blue Phoenix').wins).toBe(0);
  });

  it('GET tournament reflects its status, duplicate team names are rejected, and generate-matches needs the assign phase', async () => {
    const t = await tp('t1');
    const got = await appRequest(`/api/tournaments/${t.id}`);
    expect(got.data).toMatchObject({ status: 'created', id: t.id });
    await appRequest(`/api/tournaments/${t.id}/teams`, { method: 'POST', json: { teamName: 'Same Name' } });
    expect((await appRequest(`/api/tournaments/${t.id}/teams`, { method: 'POST', json: { teamName: 'Same Name' } })).status).toBe(409);
    expect((await generateBracket(t.id)).status).toBe(400);
  });

  it('the battle transition starts every round-1 match: status, start announcement and map games', async () => {
    const t = await tp('t1', { status: 'assign' });
    await insertTeams(t.id, 4, 1);
    await generateBracket(t.id);
    expect((await tournamentTransition(t.id, 'battle')).status).toBe(200);
    const rows = await pg().select().from(matches).where(eq(matches.tournament_id, t.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((m) => m.status === 'battle')).toBe(true);
    const games = await pg().select().from(matchGames);
    expect(games).toHaveLength(2); // one map per match (rounds_per_match = 1)
    expect(games.every((g) => g.status === 'ongoing')).toBe(true);
    const { discordAnnouncementQueue } = await import('../../../lib/db/schema');
    const types = (await pg().select().from(discordAnnouncementQueue)).map((a) => a.announcement_type).sort();
    expect(types).toEqual(['match_start', 'match_start', 'standard', 'standard']);
  });
});

describe('POST /api/tournaments/:id/generate-matches', () => {
  it('returns 404 for a missing tournament and 400 outside the assign phase', async () => {
    expect((await generateBracket('nonexistent')).status).toBe(404);
    await tp('t1');
    expect((await generateBracket('t1')).status).toBe(400);
    await tp('t2', { status: 'battle' });
    expect((await generateBracket('t2')).status).toBe(400);
  });

  it('returns 400 with fewer than 2 teams', async () => {
    await tp('t1', { status: 'assign' });
    await insertTeams('t1', 1);
    expect((await generateBracket('t1')).data.error).toContain('At least 2 teams');
  });

  it('generates bracket matches and bracket rows for 2+ teams, and refuses to generate twice', async () => {
    await tp('t1', { status: 'assign' });
    await insertTeams('t1', 2);
    const { status, data } = await generateBracket('t1');
    expect(status).toBe(200);
    expect(data).toMatchObject({ format: 'single-elimination', tournamentId: 't1' });
    expect(data.matchCount).toBeGreaterThanOrEqual(1);
    expect(await pg().select().from(matches).where(eq(matches.tournament_id, 't1'))).toHaveLength(data.matchCount);
    expect(await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, 't1'))).toHaveLength(data.matchCount);
    expect((await generateBracket('t1')).status).toBe(400);
  });

  it('honours explicit bracket assignments (order by position) and rejects unknown teams', async () => {
    await tp('t1', { status: 'assign' });
    const [a, b, c, d] = await insertTeams('t1', 4);
    expect((await generateBracket('t1', { assignments: [{ position: 1, teamId: 'ghost' }, { position: 2, teamId: a }] })).data.error).toContain('ghost');
    const res = await generateBracket('t1', { assignments: [{ position: 4, teamId: d }, { position: 1, teamId: a }, { position: 3, teamId: c }, { position: 2, teamId: b }] });
    expect(res.status).toBe(200);
    const rows = await pg().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, 't1')).orderBy(asc(tournamentMatches.match_order));
    expect(rows.map((r) => [r.team1_id, r.team2_id])).toEqual([[a, b], [c, d]]);
    expect((await generateBracket('t1', { assignments: [{ position: 1, teamId: a }] })).status).toBe(400);
  });

  it('creates named match teams and links each tournament team\'s roster', async () => {
    await tp('t1', { status: 'assign' });
    const [a, b] = await insertTeams('t1', 2, 2);
    await pg().update(tournamentTeams).set({ team_name: 'Red Dragons' }).where(eq(tournamentTeams.id, a));
    await pg().update(tournamentTeams).set({ team_name: 'Blue Phoenix' }).where(eq(tournamentTeams.id, b));
    expect((await generateBracket('t1')).status).toBe(200);
    const [match] = await pg().select().from(matches).where(eq(matches.tournament_id, 't1'));
    const teams = await pg().select().from(matchTeams).where(eq(matchTeams.match_id, match.id)).orderBy(asc(matchTeams.team_order));
    const active = teams.filter((t) => !t.is_reserve);
    expect(active.map((t) => [t.team_name, t.team_color])).toEqual([['Red Dragons', '#4A90E2'], ['Blue Phoenix', '#E04A4A']]);
    const parts = await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, match.id)).orderBy(asc(matchParticipants.username));
    expect(parts).toHaveLength(4);
    expect(parts.filter((p) => p.team_id === active[0].id).map((p) => p.username)).toEqual(['P 1.1', 'P 1.2']);
    expect(parts.filter((p) => p.team_id === active[1].id).map((p) => p.username)).toEqual(['P 2.1', 'P 2.2']);
    expect(parts.filter((p) => p.receives_map_codes)).toHaveLength(2); // captains
    expect(match.blue_team_id).toBe(a);
    expect(match.red_team_id).toBe(b);
    expect(match.team_count).toBe(2);
  });

  it('a malformed JSON body still generates from the tournament\'s teams', async () => {
    await tp('t1', { status: 'assign' });
    await insertTeams('t1', 2);
    const res = await appRequest('/api/tournaments/t1/generate-matches', { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/tournaments/:id/progress', () => {
  it('returns 404 for a missing tournament', async () => {
    expect((await progressBracket('nonexistent')).status).toBe(404);
  });

  it.each(['created', 'complete', 'assign', 'gather', 'cancelled'] as const)('returns 400 for a tournament in %s', async (status) => {
    await tp('t1', { status });
    expect((await progressBracket('t1')).status).toBe(400);
  });

  it('completes a single-elimination tournament when the final match is done and queues the winner announcement', async () => {
    await tp('t1', { status: 'assign' });
    const [a] = await insertTeams('t1', 2, 1);
    await generateBracket('t1');
    await pg().update(tournaments).set({ status: 'battle' }).where(eq(tournaments.id, 't1'));
    const rows = await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, 't1'));
    expect(rows).toHaveLength(1);
    await completeMatch(rows[0].id, a);

    const { status, data } = await progressBracket('t1');
    expect(status).toBe(200);
    expect(data.message).toContain('completed');
    expect(data.winner).toBe(a);
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, 't1')))[0].status).toBe('complete');
    const [notice] = await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, 't1'));
    expect(notice).toMatchObject({ winner: 'tournament', winning_team_name: 'Team 1', team1_score: 2, team2_score: 0 });
    expect(notice.winning_players).toEqual([`<@d-${  a  }-u0>`]);
  });

  it('reports that the current round is not complete yet', async () => {
    await tp('t1', { status: 'assign' });
    await insertTeams('t1', 4, 1);
    await generateBracket('t1');
    await pg().update(tournaments).set({ status: 'battle' }).where(eq(tournaments.id, 't1'));
    const res = await progressBracket('t1');
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('Round 1 is not complete yet');
  });
});

describe('tournament team routes', () => {
  let tournamentId: string;
  beforeEach(async () => { tournamentId = (await tp('tt')).id; });

  it('GET: 404 for unknown tournaments, empty array, teams with members arrays, captains flagged', async () => {
    expect((await appRequest('/api/tournaments/nonexistent/teams')).status).toBe(404);
    expect((await appRequest(`/api/tournaments/${tournamentId}/teams`)).data).toEqual([]);
    await pg().insert(tournamentTeams).values({ id: 'tA', tournament_id: tournamentId, team_name: 'Alpha' });
    const body = (await appRequest(`/api/tournaments/${tournamentId}/teams`)).data;
    expect(body).toHaveLength(1);
    expect(body[0].team_name).toBe('Alpha');
    expect(Array.isArray(body[0].members)).toBe(true);
    await pg().insert(tournamentTeams).values({ id: 'tB', tournament_id: tournamentId, team_name: 'Bravo' });
    await pg().insert(tournamentTeamMembers).values({ id: 'mb', team_id: 'tB', user_id: 'user1', username: 'PlayerOne', is_captain: true });
    const team = (await appRequest(`/api/tournaments/${tournamentId}/teams`)).data.find((t: any) => t.id === 'tB');
    expect(team.members).toHaveLength(1);
    expect(team.members[0]).toMatchObject({ username: 'PlayerOne', is_captain: true });
  });

  it('POST: validates the name, 404s unknown tournaments, trims, creates and rejects duplicates', async () => {
    const post = (json: unknown, id = tournamentId) => appRequest(`/api/tournaments/${id}/teams`, { method: 'POST', json });
    expect((await post({ teamName: 'Test' }, 'nope')).status).toBe(404);
    const missing = await post({});
    expect(missing.status).toBe(400);
    expect(missing.data.error).toMatch(/team name/i);
    expect((await post({ teamName: '   ' })).status).toBe(400);
    const long = await post({ teamName: 'A'.repeat(101) });
    expect(long.status).toBe(400);
    expect(long.data.error).toMatch(/100/);
    const ok = await post({ teamName: 'Charlie Squad' });
    expect(ok.status).toBe(201);
    expect(ok.data.team_name).toBe('Charlie Squad');
    expect(Array.isArray(ok.data.members)).toBe(true);
    expect((await post({ teamName: 'Charlie Squad' })).status).toBe(409);
    expect((await post({ teamName: '  Delta Force  ' })).data.team_name).toBe('Delta Force');
  });

  const put = (json: unknown, id = tournamentId) => appRequest(`/api/tournaments/${id}/teams`, { method: 'PUT', json });

  it('PUT: 404 / 400 for bad input, accepts an empty array, assigns members with captain flag and participant assignment', async () => {
    expect((await put({ teams: [] }, 'nope')).status).toBe(404);
    expect((await put({ teams: 'bad' })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    const empty = await put({ teams: [] });
    expect(empty.status).toBe(200);
    expect(empty.data.success).toBe(true);

    await pg().insert(tournamentTeams).values({ id: 'echo', tournament_id: tournamentId, team_name: 'Echo' });
    await pg().insert(tournamentParticipants).values({ id: 'tp-echo', tournament_id: tournamentId, user_id: 'u1', discord_user_id: 'd1', username: 'EchoPlayer' });
    const res = await put({ teams: [{ teamId: 'echo', members: [{ userId: 'u1', username: 'EchoPlayer', isCaptain: true }] }] });
    expect(res.status).toBe(200);
    const [member] = await pg().select().from(tournamentTeamMembers).where(eq(tournamentTeamMembers.team_id, 'echo'));
    expect(member).toMatchObject({ username: 'EchoPlayer', is_captain: true, discord_user_id: 'd1' });
    expect((await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.id, 'tp-echo')))[0].team_assignment).toBe('echo');
  });

  it('PUT: replaces the previous roster and clears assignments of players no longer listed', async () => {
    const [team] = await insertTeams(tournamentId, 1, 0);
    await insertParticipants(tournamentId, 2);
    await put({ teams: [{ teamId: team, members: [{ userId: `${tournamentId}-pu0`, username: 'a' }] }] });
    await put({ teams: [{ teamId: team, members: [{ userId: `${tournamentId}-pu1`, username: 'b' }] }] });
    expect((await pg().select().from(tournamentTeamMembers)).map((m) => m.user_id)).toEqual([`${tournamentId}-pu1`]);
    const assigned = await pg().select().from(tournamentParticipants).orderBy(asc(tournamentParticipants.id));
    expect(assigned.map((p) => p.team_assignment)).toEqual([null, team]);
  });

  it('PUT: rejects non-participants (changing nothing), a participant on two teams, and a team from another tournament', async () => {
    const [ghosts] = await insertTeams(tournamentId, 1);
    await pg().insert(tournamentTeamMembers).values({ id: 'm-old', team_id: ghosts, user_id: 'old', discord_user_id: 'd', username: 'Old' });
    const bad = await put({ teams: [{ teamId: ghosts, members: [{ userId: 'not-signed-up', username: 'Ghost' }] }] });
    expect(bad.status).toBe(400);
    expect((await pg().select().from(tournamentTeamMembers)).map((m) => m.user_id)).toEqual(['old']); // existing assignment untouched

    const [b] = await insertTeams(tournamentId, 1);
    await pg().insert(tournamentParticipants).values({ id: 'tp-dup', tournament_id: tournamentId, user_id: 'dup', discord_user_id: 'dd', username: 'Dup' });
    const twice = await put({ teams: [{ teamId: ghosts, members: [{ userId: 'dup', username: 'Dup' }] }, { teamId: b, members: [{ userId: 'dup', username: 'Dup' }] }] });
    expect(twice.status).toBe(400);

    await tp('other');
    const [foreign] = await insertTeams('other', 1);
    expect((await put({ teams: [{ teamId: foreign, members: [] }] })).data.error).toContain('does not belong');
  });

  it('PUT: stores the participant\'s discord_user_id on the member', async () => {
    const [teamId] = await insertTeams(tournamentId, 1);
    await pg().insert(tournamentParticipants).values({ id: 'tp-known', tournament_id: tournamentId, user_id: 'known', discord_user_id: 'discord-known', username: 'Known' });
    expect((await put({ teams: [{ teamId, members: [{ userId: 'known', username: 'Known' }] }] })).status).toBe(200);
    expect((await pg().select().from(tournamentTeamMembers).where(eq(tournamentTeamMembers.team_id, teamId)))[0].discord_user_id).toBe('discord-known');
  });

  it('DELETE: needs a teamId, 404s for strangers, deletes the team with its members and clears assignments, and refuses teams in the bracket', async () => {
    const del = (q: string) => appRequest(`/api/tournaments/${tournamentId}/teams${q}`, { method: 'DELETE' });
    expect((await del('')).status).toBe(400);
    expect((await del('?teamId=ghost')).status).toBe(404);

    const [team] = await insertTeams(tournamentId, 1, 2);
    const res = await del(`?teamId=${team}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(await pg().select().from(tournamentTeams).where(eq(tournamentTeams.id, team))).toHaveLength(0);
    expect(await pg().select().from(tournamentTeamMembers)).toHaveLength(0);
    const orphans = await pg().select().from(tournamentParticipants);
    expect(orphans).toHaveLength(2);
    expect(orphans.every((p) => p.team_assignment === null)).toBe(true);

    const [a, b] = await insertTeams(tournamentId, 2);
    await tp('other-t');
    const m = await pg().insert(matches).values({ id: 'bm', game_id: gameId, name: 'M', start_date: new Date(), start_time: new Date(), tournament_id: tournamentId }).returning();
    await pg().insert(tournamentMatches).values({ match_id: m[0].id, tournament_id: tournamentId, round: 1, bracket_type: 'winners', team1_id: a, team2_id: b, match_order: 1 });
    expect((await del(`?teamId=${a}`)).status).toBe(409);
  });
});

describe('tournament match teams and cumulative-points', () => {
  it('cumulative: an FFA/Position tournament runs from signups through solo teams to a ranked winner', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id, { scoring_type: 'Position', team_size: null });
    for (let i = 1; i <= 2; i++) await pg().insert(gameMaps).values({ id: `map-${i}`, game_id: game.id, mode_id: mode.id, name: `Map ${i}` });
    const t = await createTournament(game.id, { id: 'cum', game_mode_id: mode.id, format: 'cumulative-points', rounds_per_match: 2, status: 'gather' });
    for (const [i, name] of ['Alice', 'Bob', 'Cara'].entries()) {
      await pg().insert(tournamentParticipants).values({ id: `tp${i}`, tournament_id: t.id, user_id: `u${i}`, discord_user_id: `d${i}`, username: name, joined_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
    }
    expect((await tournamentTransition(t.id, 'assign')).status).toBe(200);
    expect(await pg().select().from(tournamentTeams).where(eq(tournamentTeams.tournament_id, t.id))).toHaveLength(3);
    expect((await pg().select().from(tournamentTeamMembers)).every((m) => m.discord_user_id)).toBe(true);

    expect((await generateBracket(t.id)).status).toBe(200);
    const [match] = await pg().select().from(matches).where(eq(matches.tournament_id, t.id));
    expect(match.status).toBe('assign');
    expect(await pg().select().from(matchTeams).where(eq(matchTeams.match_id, match.id))).toHaveLength(3);

    expect((await tournamentTransition(t.id, 'battle')).status).toBe(200);
    expect((await pg().select().from(matches).where(eq(matches.id, match.id)))[0].status).toBe('battle');
    const games = await pg().select().from(matchGames).where(eq(matchGames.match_id, match.id)).orderBy(asc(matchGames.round));
    expect(games).toHaveLength(2);

    // Progress too early is rejected
    expect((await progressBracket(t.id)).status).toBe(400);

    const parts = await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, match.id));
    const place = async (gameRow: string, order: string[]) => {
      await pg().update(matchGames).set({ status: 'completed' }).where(eq(matchGames.id, gameRow));
      for (const [i, name] of order.entries()) {
        await pg().insert(matchGamePlacements).values({ id: `pl_${gameRow}_${i}`, match_game_id: gameRow, entity_type: 'participant', entity_id: parts.find((x) => x.username === name)!.id, position: i + 1, points_awarded: [10, 5, 1][i] });
      }
    };
    await place(games[0].id, ['Alice', 'Bob', 'Cara']);
    await place(games[1].id, ['Alice', 'Cara', 'Bob']);
    await pg().update(matches).set({ status: 'complete' }).where(eq(matches.id, match.id));

    const { status, data } = await progressBracket(t.id);
    expect(status).toBe(200);
    expect(data.winner).toBe('Alice');
    expect((await pg().select().from(tournaments).where(eq(tournaments.id, t.id)))[0].status).toBe('complete');
    const [notice] = await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, t.id));
    expect(notice.winning_team_name).toBe('Alice');
    expect(notice.winning_players).toEqual(['<@d0>']);
  });

  it('cumulative: a tie that first places cannot break is announced as a tie with no single winner', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id, { scoring_type: 'FFA', team_size: null });
    const t = await createTournament(game.id, { id: 'tie', game_mode_id: mode.id, format: 'cumulative-points', status: 'battle' });
    const m = await pg().insert(matches).values({ id: 'tm', game_id: game.id, mode_id: mode.id, name: 'M', start_date: new Date(), start_time: new Date(), tournament_id: t.id, status: 'complete' }).returning();
    for (const [id, name] of [['a', 'Ann'], ['b', 'Ben']]) await pg().insert(matchParticipants).values({ id, match_id: m[0].id, user_id: id, discord_user_id: `d${id}`, username: name });
    await pg().insert(matchGames).values({ id: 'g', match_id: m[0].id, round: 1, status: 'completed' });
    await pg().insert(matchGamePlacements).values([
      { id: 'p1', match_game_id: 'g', entity_type: 'participant', entity_id: 'a', position: 1, points_awarded: 5, is_winner: true },
      { id: 'p2', match_game_id: 'g', entity_type: 'participant', entity_id: 'b', position: 1, points_awarded: 5, is_winner: true },
    ]);
    const { status, data } = await progressBracket(t.id);
    expect(status).toBe(200);
    expect(data.winner).toBeNull();
    expect(data.tied).toEqual(['Ann', 'Ben']);
    expect(data.message).toContain('tie');
    const [notice] = await pg().select().from(discordMatchWinnerQueue).where(eq(discordMatchWinnerQueue.match_id, t.id));
    expect(notice.winning_team_name).toBe('Tie: Ann, Ben');
  });

  it('standings aggregate one Discord user across two matches and share ranks on ties; the leaderboard lists per-game placements', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id, { scoring_type: 'Position', team_size: null });
    const t = await createTournament(game.id, { id: 'agg', game_mode_id: mode.id, format: 'cumulative-points', status: 'battle' });
    const mk = async (id: string, createdAt: string) => (await pg().insert(matches).values({
      id, game_id: game.id, mode_id: mode.id, name: id, start_date: new Date(), start_time: new Date(), tournament_id: t.id, created_at: new Date(createdAt),
    }).returning())[0];
    const m1 = await mk('first', '2026-01-01');
    const m2 = await mk('second', '2026-01-02');
    for (const [m, pre] of [[m1, 'x'], [m2, 'y']] as const) {
      for (const [i, name] of ['Alice', 'Bob', 'Cara'].entries()) {
        await pg().insert(matchParticipants).values({ id: `${pre}${i}`, match_id: m.id, user_id: `${pre}-user${i}`, discord_user_id: `d${i}`, username: name });
      }
    }
    await pg().insert(matchGames).values([
      { id: 'g1', match_id: m1.id, round: 1, status: 'completed' }, { id: 'g2', match_id: m1.id, round: 2, status: 'completed' },
      { id: 'g3', match_id: m2.id, round: 1, status: 'completed' },
    ]);
    const pl = (id: string, g: string, entity: string, position: number, pts: number) => ({ id, match_game_id: g, entity_type: 'participant' as const, entity_id: entity, position, points_awarded: pts });
    await pg().insert(matchGamePlacements).values([
      pl('a', 'g1', 'x0', 1, 10), pl('b', 'g1', 'x1', 2, 5), pl('c', 'g1', 'x2', 3, 1),
      pl('d', 'g2', 'x1', 1, 10), pl('e', 'g2', 'x0', 2, 5), pl('f', 'g2', 'x2', 3, 1),
      pl('g', 'g3', 'y0', 1, 10), pl('h', 'g3', 'y1', 2, 5),
    ]);
    const rows = (await appRequest('/api/tournaments/agg/standings')).data.standings as Array<{ username: string; total_points: number; rank: number; matches_played: number }>;
    expect(rows).toHaveLength(3);
    const byName = Object.fromEntries(rows.map((r) => [r.username, r]));
    expect(byName.Alice).toMatchObject({ total_points: 25, rank: 1, matches_played: 3 });
    expect(byName.Bob).toMatchObject({ total_points: 20, rank: 2 });
    expect(byName.Cara).toMatchObject({ total_points: 2, rank: 3 });

    const lb = (await appRequest('/api/tournaments/agg/leaderboard')).data;
    expect(lb.tournament_name).toBe('Test Tournament');
    expect(lb.leaderboard.find((r: any) => r.username === 'Alice').total_points).toBe(25);
    expect(lb.match_breakdown.filter((r: any) => r.position != null).length).toBeGreaterThanOrEqual(8);
    expect((await appRequest('/api/tournaments/life/leaderboard')).status).toBe(404);
    await tp('plain');
    expect((await appRequest('/api/tournaments/plain/leaderboard')).data.error).toContain('cumulative-points');
  });
});
