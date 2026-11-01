// @vitest-environment node
/**
 * Tournament + Series flows through the REAL routes, with scoring done through the result route (nothing in the scoring
 * path is mocked). Mirrors match-lifecycle.test.ts.
 *
 * Regressions covered:
 *  - tournament transitions could skip phases (gather -> battle) or repeat, re-firing side effects
 *  - team DELETE left orphan members / participant assignments
 *  - team PUT accepted a teamId from another tournament
 *  - tournament positionScoringOverride accepted garbage
 *  - DELETE match left match_participants / match_games behind
 *  - series standings gave tied players different ranks
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame } from '../../utils/pg-fixtures';
import { modeWithMaps, createSeriesApi, addEventApi, transitionSeriesApi, standingsApi, gamesOf, scoreGame, moveMatch } from '../../utils/pg-series-fixtures';
import {
  discordAnnouncementQueue, discordStatusUpdateQueue, matchGames, matchParticipants, matchTeams, matches, seriesEvents, tournamentMatches,
  tournamentParticipants, tournamentTeamMembers, tournaments,
} from '../../../lib/db/schema';
import { logFeedEvent } from '@/lib/feed-helpers';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', () => ({ logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let seq = 0;
beforeEach(async () => {
  gameId = (await createGame()).id;
});

const mkMode = async (scoringType: 'Normal' | 'Position', teamSize: number) => modeWithMaps(gameId, scoringType, teamSize, 4);

async function newTournament(modeId: string, format: string, extra: Record<string, unknown> = {}) {
  const res = await appRequest('/api/tournaments', { method: 'POST', json: { name: `T${++seq}`, gameId, gameModeId: modeId, format, roundsPerMatch: 1, ...extra } });
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.id as string;
}

const tPost = (tournamentId: string, newStatus: string) =>
  appRequest(`/api/tournaments/${tournamentId}/transition`, { method: 'POST', json: { newStatus } });
const generate = (tournamentId: string) => appRequest(`/api/tournaments/${tournamentId}/generate-matches`, { method: 'POST', json: {} });

async function addPlayers(tournamentId: string, n: number, discordBase: number) {
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const userId = `${tournamentId}-u${i}`;
    await pg().insert(tournamentParticipants).values({
      id: `${tournamentId}-tp${i}`, tournament_id: tournamentId, user_id: userId, discord_user_id: `${discordBase + i}`, username: `P${discordBase + i}`,
      joined_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    });
    users.push(userId);
  }
  return users;
}

async function newTeams(tournamentId: string, users: string[], perTeam: number) {
  const teamIds: string[] = [];
  for (let i = 0; i < users.length / perTeam; i++) {
    const res = await appRequest(`/api/tournaments/${tournamentId}/teams`, { method: 'POST', json: { teamName: `Team ${i + 1}` } });
    expect(res.status).toBe(201);
    teamIds.push(res.data.id);
  }
  const put = await appRequest(`/api/tournaments/${tournamentId}/teams`, {
    method: 'PUT',
    json: { teams: teamIds.map((teamId, i) => ({ teamId, members: users.slice(i * perTeam, (i + 1) * perTeam).map((userId) => ({ userId, username: `name-${userId}` })) })) },
  });
  expect(put.status, JSON.stringify(put.data)).toBe(200);
  return teamIds;
}

async function scoreNormal(matchId: string, winner: 'team1' | 'team2') {
  const gs = await gamesOf(matchId);
  expect(gs.length).toBeGreaterThan(0);
  for (const g of gs) {
    const res = await scoreGame(matchId, g.id, { winner, winnerScore: 13, loserScore: 4 });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
  }
}

async function startMatch(matchId: string) {
  const [row] = await pg().select({ status: matches.status }).from(matches).where(eq(matches.id, matchId));
  const path = ['gather', 'assign', 'battle'];
  for (const s of path.slice(path.indexOf(row.status) + 1)) expect((await moveMatch(matchId, s)).status).toBe(200);
}

describe('tournament transitions', () => {
  it('rejects skipping phases, repeating a phase, and leaving a terminal phase', async () => {
    const { modeId } = await mkMode('Normal', 5);
    const id = await newTournament(modeId, 'single-elimination');

    expect((await tPost(id, 'battle')).status).toBe(400); // created -> battle
    expect((await tPost(id, 'complete')).status).toBe(400); // created -> complete
    expect((await tPost(id, 'gather')).status).toBe(200);
    expect((await tPost(id, 'gather')).status).toBe(400); // repeat
    expect((await tPost(id, 'battle')).status).toBe(400); // gather -> battle (no bracket)
    expect((await tPost(id, 'assign')).status).toBe(200);
    expect((await tPost(id, 'gather')).status).toBe(400); // backwards

    expect((await tPost(id, 'cancelled')).status).toBe(200);
    expect((await tPost(id, 'assign')).status).toBe(400); // terminal
    expect((await tPost(id, 'cancelled')).status).toBe(400);
  });

  it('does not re-queue side effects on a repeated transition', async () => {
    const { modeId } = await mkMode('Normal', 5);
    const id = await newTournament(modeId, 'single-elimination');
    await tPost(id, 'gather');
    const counts = async () => ({
      feed: vi.mocked(logFeedEvent).mock.calls.length,
      announcements: (await pg().select().from(discordAnnouncementQueue)).length,
      statusUpdates: (await pg().select().from(discordStatusUpdateQueue)).length,
    });
    const before = await counts();
    expect((await tPost(id, 'gather')).status).toBe(400);
    expect(await counts()).toEqual(before);
  });
});

describe('tournament create/update validation', () => {
  it('rejects a malformed positionScoringOverride and accepts both valid shapes', async () => {
    const { modeId } = await mkMode('Position', 1);
    const base = { name: 'Cum', gameId, gameModeId: modeId, format: 'cumulative-points', roundsPerMatch: 1 };
    for (const bad of ['garbage', '[]', '{}', JSON.stringify({ '1': 'x' }), JSON.stringify({ first: 3 })]) {
      const res = await appRequest('/api/tournaments', { method: 'POST', json: { ...base, positionScoringOverride: bad } });
      expect(res.status, bad).toBe(400);
    }
    for (const good of [JSON.stringify({ '1': 5, '2': 3 }), JSON.stringify({ type: 'Position', pointsPerPosition: { '1': 5 } })]) {
      const res = await appRequest('/api/tournaments', { method: 'POST', json: { ...base, positionScoringOverride: good } });
      expect(res.status).toBe(201);
    }
  });

  it('validates positionScoringOverride on update too', async () => {
    const { modeId } = await mkMode('Position', 1);
    const id = await newTournament(modeId, 'cumulative-points');
    const bad = await appRequest(`/api/tournaments/${id}`, { method: 'PUT', json: { positionScoringOverride: 'nope' } });
    expect(bad.status).toBe(400);
  });
});

describe('tournament teams', () => {
  it('refuses to write members into a team from another tournament', async () => {
    const { modeId } = await mkMode('Normal', 5);
    const a = await newTournament(modeId, 'single-elimination');
    const b = await newTournament(modeId, 'single-elimination');
    const usersA = await addPlayers(a, 2, 100);
    const [teamA] = await newTeams(a, usersA, 2);
    const usersB = await addPlayers(b, 2, 200);
    await newTeams(b, usersB, 2);

    const res = await appRequest(`/api/tournaments/${b}/teams`, {
      method: 'PUT', json: { teams: [{ teamId: teamA, members: [{ userId: usersB[0], username: 'x' }] }] },
    });
    expect(res.status).toBe(400);
    expect(await pg().select().from(tournamentTeamMembers).where(eq(tournamentTeamMembers.team_id, teamA))).toHaveLength(2); // untouched
  });

  it('deleting a team removes its members and clears participant assignments', async () => {
    const { modeId } = await mkMode('Normal', 5);
    const id = await newTournament(modeId, 'single-elimination');
    const users = await addPlayers(id, 4, 300);
    const [t1] = await newTeams(id, users, 2);

    const res = await appRequest(`/api/tournaments/${id}/teams?teamId=${t1}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await pg().select().from(tournamentTeamMembers).where(eq(tournamentTeamMembers.team_id, t1))).toHaveLength(0);
    expect(await pg().select().from(tournamentParticipants).where(eq(tournamentParticipants.team_assignment, t1))).toHaveLength(0);
  });

  it('refuses to delete a team that is already in the bracket', async () => {
    const { modeId } = await mkMode('Normal', 5);
    const id = await newTournament(modeId, 'single-elimination');
    const users = await addPlayers(id, 4, 400);
    const teams = await newTeams(id, users, 2);
    await tPost(id, 'gather');
    await tPost(id, 'assign');
    expect((await generate(id)).status).toBe(200);

    const res = await appRequest(`/api/tournaments/${id}/teams?teamId=${teams[0]}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
    expect(await pg().select().from(tournamentTeamMembers).where(eq(tournamentTeamMembers.team_id, teams[0]))).toHaveLength(2);
  });
});

describe('single elimination, played through scoring', () => {
  it('plays a 4-team bracket to a champion', async () => {
    const { modeId } = await mkMode('Normal', 5);
    const id = await newTournament(modeId, 'single-elimination');
    await tPost(id, 'gather');
    const users = await addPlayers(id, 8, 700);
    const teams = await newTeams(id, users, 2);
    expect((await tPost(id, 'assign')).status).toBe(200);
    expect((await generate(id)).status).toBe(200);
    expect((await tPost(id, 'battle')).status).toBe(200);

    const prog = () => appRequest(`/api/tournaments/${id}/progress`, { method: 'POST', json: {} });
    const roundRows = async (r: number) => (await pg().select({ id: tournamentMatches.match_id, team1_id: tournamentMatches.team1_id, team2_id: tournamentMatches.team2_id, round: tournamentMatches.round })
      .from(tournamentMatches).where(eq(tournamentMatches.tournament_id, id)).orderBy(asc(tournamentMatches.match_order))).filter((x) => x.round === r);

    const r1 = await roundRows(1);
    expect(r1).toHaveLength(2);
    expect((await prog()).status).toBe(400); // round not finished

    await startMatch(r1[0].id);
    await scoreNormal(r1[0].id, 'team1');
    expect((await prog()).status).toBe(400); // one match still open
    await startMatch(r1[1].id);
    await scoreNormal(r1[1].id, 'team2');

    // winner_team of a tournament match is a tournament_teams.id, not a match_teams.id
    const winnerOf = async (matchId: string) => (await pg().select({ w: matches.winner_team }).from(matches).where(eq(matches.id, matchId)))[0].w;
    expect(await winnerOf(r1[0].id)).toBe(r1[0].team1_id);
    expect(await winnerOf(r1[1].id)).toBe(r1[1].team2_id);

    expect((await prog()).status).toBe(200);
    const r2 = await roundRows(2);
    expect(r2).toHaveLength(1);
    expect([r2[0].team1_id, r2[0].team2_id].sort()).toEqual([r1[0].team1_id, r1[1].team2_id].sort());

    await startMatch(r2[0].id);
    await scoreNormal(r2[0].id, 'team2');
    const finalProg = await prog();
    expect(finalProg.status).toBe(200);

    const [t] = await pg().select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, id));
    expect(t.status).toBe('complete');
    expect(finalProg.data.winner).toBe(r2[0].team2_id);
    expect(teams).toContain(finalProg.data.winner);
  });
});

describe('cumulative points (Position), with a tournament override', () => {
  it('applies the tournament spread, completes, and ranks the leaderboard', async () => {
    const { modeId } = await mkMode('Position', 1);
    const id = await newTournament(modeId, 'cumulative-points', {
      roundsPerMatch: 2,
      positionScoringOverride: JSON.stringify({ type: 'Position', pointsPerPosition: { '1': 10, '2': 6, '3': 3, '4': 1 } }),
    });
    await tPost(id, 'gather');
    await addPlayers(id, 4, 600);
    expect((await tPost(id, 'assign')).status).toBe(200);
    expect((await generate(id)).status).toBe(200);
    expect((await tPost(id, 'battle')).status).toBe(200);

    const [match] = await pg().select({ id: matches.id, mode_id: matches.mode_id }).from(matches).where(eq(matches.tournament_id, id));
    expect(match.mode_id).toBe(modeId);
    await startMatch(match.id);
    const ps = await pg().select({ id: matchParticipants.id }).from(matchParticipants).where(eq(matchParticipants.match_id, match.id)).orderBy(asc(matchParticipants.username));
    const gs = await gamesOf(match.id);
    expect(gs).toHaveLength(2);
    const orders = [[0, 1, 2, 3], [0, 2, 1, 3]];
    for (let i = 0; i < 2; i++) {
      const res = await scoreGame(match.id, gs[i].id, {
        type: 'Position', matchId: match.id, gameId: gs[i].id,
        positionResults: Object.fromEntries(orders[i].map((k, p) => [ps[k].id, p + 1])),
      });
      expect(res.status, JSON.stringify(res.data)).toBe(200);
    }

    const [m] = await pg().select({ status: matches.status, winner_team: matches.winner_team }).from(matches).where(eq(matches.id, match.id));
    expect(m).toMatchObject({ status: 'complete', winner_team: ps[0].id });

    const lb = await appRequest(`/api/tournaments/${id}/leaderboard`);
    expect(lb.data.leaderboard.map((r: { total_points: number }) => r.total_points)).toEqual([20, 9, 9, 2]); // 10+10, 6+3, 3+6, 1+1 (default spread would give 50)
    expect(lb.data.leaderboard.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 2, 4]);

    expect((await appRequest(`/api/tournaments/${id}/progress`, { method: 'POST', json: {} })).status).toBe(200);
    expect((await pg().select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, id)))[0].status).toBe('complete');
  });
});

describe('deleting', () => {
  it('DELETE match removes its participants, games, teams and series events', async () => {
    const { mapIds } = await mkMode('Normal', 5);
    const created = await appRequest('/api/matches', { method: 'POST', json: { name: 'Doomed', gameId, maps: [mapIds[0]], startDate: new Date().toISOString() } });
    const matchId: string = created.data.id;
    await pg().insert(matchParticipants).values({ id: `${matchId}-p`, match_id: matchId, user_id: 'u', discord_user_id: 'd', username: 'P' });
    for (const s of ['gather', 'assign', 'battle']) await moveMatch(matchId, s);
    const sid = await createSeriesApi();
    await addEventApi(sid, { event_type: 'match', match_id: matchId });
    expect(await pg().select().from(matchGames).where(eq(matchGames.match_id, matchId))).not.toHaveLength(0);

    expect((await appRequest(`/api/matches/${matchId}`, { method: 'DELETE' })).status).toBe(200);
    expect(await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, matchId))).toHaveLength(0);
    expect(await pg().select().from(matchGames).where(eq(matchGames.match_id, matchId))).toHaveLength(0);
    expect(await pg().select().from(matchTeams).where(eq(matchTeams.match_id, matchId))).toHaveLength(0);
    expect(await pg().select().from(seriesEvents).where(eq(seriesEvents.match_id, matchId))).toHaveLength(0);
  });

  it('DELETE series removes its events', async () => {
    const sid = await createSeriesApi();
    const { mapIds } = await mkMode('Normal', 5);
    const m = await appRequest('/api/matches', { method: 'POST', json: { name: 'M', gameId, maps: [mapIds[0]], startDate: new Date().toISOString() } });
    await addEventApi(sid, { event_type: 'match', match_id: m.data.id });
    expect((await appRequest(`/api/series/${sid}`, { method: 'DELETE' })).status).toBe(200);
    expect(await pg().select().from(seriesEvents).where(eq(seriesEvents.series_id, sid))).toHaveLength(0);
  });
});

describe('series', () => {
  const seriesWith = (config: Record<string, unknown>) => createSeriesApi(config);

  async function completedNormalMatch(players: number) {
    const { mapIds } = await mkMode('Normal', 5);
    const c = await appRequest('/api/matches', { method: 'POST', json: { name: 'N', gameId, maps: [mapIds[0]], startDate: new Date().toISOString() } });
    const matchId: string = c.data.id;
    const ids: string[] = [];
    for (let i = 0; i < players; i++) {
      const pid = `${matchId}-p${i}`;
      await pg().insert(matchParticipants).values({ id: pid, match_id: matchId, user_id: `su${i}`, discord_user_id: `${800 + i}`, username: `S${800 + i}` });
      ids.push(pid);
    }
    await moveMatch(matchId, 'gather');
    await moveMatch(matchId, 'assign');
    const teams = (await pg().select({ id: matchTeams.id, is_reserve: matchTeams.is_reserve }).from(matchTeams).where(eq(matchTeams.match_id, matchId)).orderBy(asc(matchTeams.team_order)))
      .filter((t) => !t.is_reserve);
    await appRequest(`/api/matches/${matchId}/assign-teams`, { method: 'POST', json: { teamAssignments: ids.map((participantId, i) => ({ participantId, teamId: teams[i % 2].id })) } });
    await moveMatch(matchId, 'battle');
    await scoreNormal(matchId, 'team1'); // even-index players (team 0) win
    expect((await pg().select({ status: matches.status }).from(matches).where(eq(matches.id, matchId)))[0].status).toBe('complete');
    return matchId;
  }

  it('scores a completed match: winners get win points, the rest loss points, x multiplier', async () => {
    const matchId = await completedNormalMatch(4);
    const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1 });
    expect((await addEventApi(sid, { event_type: 'match', match_id: matchId, points_multiplier: 2 })).status).toBe(201);
    const rows = await standingsApi(sid);
    expect(Object.fromEntries(rows.map((r) => [r.user_id, r.total_points]))).toEqual({ '800': 6, '802': 6, '801': 2, '803': 2 });
    expect(rows.every((r) => r.events_played === 1)).toBe(true);
  });

  it('gives tied players the same rank', async () => {
    const matchId = await completedNormalMatch(4);
    const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1 });
    await addEventApi(sid, { event_type: 'match', match_id: matchId });
    // two winners on 3, two losers on 1
    expect((await standingsApi(sid)).map((r) => r.rank)).toEqual([1, 1, 3, 3]);
  });

  it('ignores events that are not complete yet', async () => {
    const { mapIds } = await mkMode('Normal', 5);
    const open = await appRequest('/api/matches', { method: 'POST', json: { name: 'Open', gameId, maps: [mapIds[0]], startDate: new Date().toISOString() } });
    await pg().insert(matchParticipants).values({ id: 'op', match_id: open.data.id, user_id: 'x', discord_user_id: '1', username: 'X' });
    const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1 });
    expect((await addEventApi(sid, { event_type: 'match', match_id: open.data.id })).status).toBe(201);
    expect(await standingsApi(sid)).toEqual([]);
  });

  it('validates events and series transitions', async () => {
    const matchId = await completedNormalMatch(2);
    const sid = await seriesWith({ match_win_points: 1 });
    expect((await addEventApi(sid, { event_type: 'bogus' })).status).toBe(400);
    expect((await addEventApi(sid, { event_type: 'match', match_id: 'missing' })).status).toBe(400);
    expect((await addEventApi(sid, { event_type: 'match', match_id: matchId, points_multiplier: -1 })).status).toBe(400);
    expect((await addEventApi(sid, { event_type: 'match', match_id: matchId })).status).toBe(201);
    expect((await addEventApi(sid, { event_type: 'match', match_id: matchId })).status).toBe(409);

    const to = async (status: string) => (await transitionSeriesApi(sid, status)).status;
    expect(await to('complete')).toBe(400); // created -> complete
    expect(await to('active')).toBe(200);
    expect(await to('complete')).toBe(200);
    expect(await to('active')).toBe(400); // terminal
    expect((await addEventApi(sid, { event_type: 'tournament', tournament_id: 'x' })).status).toBe(409);
  });

  it('combines match, Position and tournament events into one standing', async () => {
    // Position match (default spread, x2)
    const pos = await mkMode('Position', 1);
    const pm = await appRequest('/api/matches', { method: 'POST', json: { name: 'Race', gameId, maps: [pos.mapIds[0]], startDate: new Date().toISOString() } });
    const posId: string = pm.data.id;
    const pIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const pid = `${posId}-p${i}`;
      await pg().insert(matchParticipants).values({ id: pid, match_id: posId, user_id: `ru${i}`, discord_user_id: `${900 + i}`, username: `R${900 + i}` });
      pIds.push(pid);
    }
    await startMatch(posId);
    const [g] = await gamesOf(posId);
    await scoreGame(posId, g.id, { type: 'Position', matchId: posId, gameId: g.id, positionResults: { [pIds[2]]: 1, [pIds[0]]: 2, [pIds[1]]: 3 } });

    // Cumulative tournament, finished: positions 1..3 -> [10, 6, 3]
    const tm = await mkMode('Position', 1);
    const tid = await newTournament(tm.modeId, 'cumulative-points');
    await tPost(tid, 'gather');
    await addPlayers(tid, 3, 950);
    await tPost(tid, 'assign');
    await generate(tid);
    await tPost(tid, 'battle');
    const [tmatch] = await pg().select({ id: matches.id }).from(matches).where(eq(matches.tournament_id, tid));
    await startMatch(tmatch.id);
    const tps = await pg().select({ id: matchParticipants.id }).from(matchParticipants).where(eq(matchParticipants.match_id, tmatch.id)).orderBy(asc(matchParticipants.username));
    const [tg] = await gamesOf(tmatch.id);
    await scoreGame(tmatch.id, tg.id, { type: 'Position', matchId: tmatch.id, gameId: tg.id, positionResults: { [tps[0].id]: 1, [tps[1].id]: 2, [tps[2].id]: 3 } });
    await appRequest(`/api/tournaments/${tid}/progress`, { method: 'POST', json: {} });
    expect((await pg().select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, tid)))[0].status).toBe('complete');

    const sid = await seriesWith({ match_win_points: 3, match_loss_points: 1, tournament_position_points: [10, 6, 3] });
    await addEventApi(sid, { event_type: 'match', match_id: posId, points_multiplier: 2 });
    await addEventApi(sid, { event_type: 'tournament', tournament_id: tid });

    const pts = Object.fromEntries((await standingsApi(sid)).map((r) => [r.user_id, r.total_points]));
    // Position event: default spread 25/18/15, x2 -> R902 50, R900 36, R901 30
    // Tournament event: 10/6/3 for the three cumulative players
    expect(pts).toMatchObject({ '902': 50, '900': 36, '901': 30, '950': 10, '951': 6, '952': 3 });
  });
});
