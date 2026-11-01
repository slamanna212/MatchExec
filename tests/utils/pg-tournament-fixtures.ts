/**
 * Postgres-harness fixtures and API drivers for the tournaments domain (use with setupPgTestFile()).
 * `tournamentInAssign` / `startAndScore` / `playOutBracket` drive the real Hono routes end to end, like a user would.
 */
import { randomBytes } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { getPgTestDb } from './pg-test-db';
import { appRequest } from './app-request';
import { createGame, createGameMode } from './pg-fixtures';
import {
  gameMaps, matchGames, matches, tournamentMatches, tournamentParticipants, tournamentTeamMembers, tournamentTeams, tournaments,
} from '../../lib/db/schema';

const uid = (prefix: string) => `${prefix}${randomBytes(6).toString('hex')}`;
let counter = 0;

/** A game with a Normal (5v5) mode and `maps` maps, ready for bracket generation. */
export async function bracketGame(opts: { maps?: number; scoringType?: 'Normal' | 'FFA' | 'Position'; teamSize?: number | null } = {}) {
  const game = await createGame({ max_signups: 16 });
  const mode = await createGameMode(game.id, { scoring_type: opts.scoringType ?? 'Normal', team_size: opts.teamSize === undefined ? 5 : opts.teamSize });
  const mapIds: string[] = [];
  for (let i = 1; i <= (opts.maps ?? 5); i++) {
    const id = uid('map-');
    await getPgTestDb().insert(gameMaps).values({ id, game_id: game.id, mode_id: mode.id, name: `Map ${i}` });
    mapIds.push(id);
  }
  return { gameId: game.id, modeId: mode.id, mapIds };
}

/** Insert `n` tournament teams (and `perTeam` members each, with matching signups). Returns the team ids in creation order. */
export async function insertTeams(tournamentId: string, n: number, perTeam = 0): Promise<string[]> {
  const db = getPgTestDb();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = uid('team-');
    await db.insert(tournamentTeams).values({ id, tournament_id: tournamentId, team_name: `Team ${i + 1}`, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
    ids.push(id);
    for (let k = 0; k < perTeam; k++) {
      const userId = `${id}-u${k}`;
      await db.insert(tournamentParticipants).values({ id: `${userId}-tp`, tournament_id: tournamentId, user_id: userId, discord_user_id: `d-${userId}`, username: `P ${i + 1}.${k + 1}`, team_assignment: id });
      await db.insert(tournamentTeamMembers).values({ id: `${userId}-tm`, team_id: id, user_id: userId, discord_user_id: `d-${userId}`, username: `P ${i + 1}.${k + 1}`, is_captain: k === 0 });
    }
  }
  return ids;
}

export async function insertParticipants(tournamentId: string, n: number, prefix = 'p') {
  const db = getPgTestDb();
  const out: Array<{ id: string; user_id: string; discord_user_id: string; username: string }> = [];
  for (let i = 0; i < n; i++) {
    const row = { id: `${tournamentId}-${prefix}${i}`, user_id: `${tournamentId}-${prefix}u${i}`, discord_user_id: `d-${prefix}${i}-${tournamentId}`, username: `User ${prefix}${i}` };
    await db.insert(tournamentParticipants).values({ ...row, tournament_id: tournamentId, joined_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
    out.push(row);
  }
  return out;
}

/** Mark a tournament match complete with a winner (a tournament_teams id) without playing it. */
export async function completeMatch(matchId: string, winnerTeamId: string | null): Promise<void> {
  await getPgTestDb().update(matches).set({ status: 'complete', winner_team: winnerTeamId }).where(eq(matches.id, matchId));
}

export async function bracketRows(tournamentId: string) {
  return getPgTestDb().select().from(tournamentMatches).where(eq(tournamentMatches.tournament_id, tournamentId))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.match_order));
}

// ─── API drivers ─────────────────────────────────────────────────────────────

export const tournamentTransition = (tournamentId: string, newStatus: string) =>
  appRequest(`/api/tournaments/${tournamentId}/transition`, { method: 'POST', json: { newStatus } });

export const generateBracket = (tournamentId: string, json: unknown = {}) =>
  appRequest(`/api/tournaments/${tournamentId}/generate-matches`, { method: 'POST', json });

export const progressBracket = (tournamentId: string) => appRequest(`/api/tournaments/${tournamentId}/progress`, { method: 'POST', json: {} });

/** Create a tournament through the API, open signups and add `nTeams` teams of `perTeam` assigned players; end in 'assign'. */
export async function tournamentInAssign(
  ctx: { gameId: string; modeId: string },
  format: string,
  nTeams: number,
  opts: { perTeam?: number; extra?: Record<string, unknown> } = {},
) {
  const perTeam = opts.perTeam ?? 2;
  const created = await appRequest('/api/tournaments', {
    method: 'POST',
    json: { name: `B${++counter}`, gameId: ctx.gameId, gameModeId: ctx.modeId, format, roundsPerMatch: 1, ...opts.extra },
  });
  expect(created.status).toBe(201);
  const id: string = created.data.id;
  expect((await tournamentTransition(id, 'gather')).status).toBe(200);

  const teamIds: string[] = [];
  for (let i = 0; i < nTeams; i++) {
    const res = await appRequest(`/api/tournaments/${id}/teams`, { method: 'POST', json: { teamName: `T${i + 1}` } });
    expect(res.status).toBe(201);
    teamIds.push(res.data.id);
  }
  await insertParticipants(id, nTeams * perTeam);
  const put = await appRequest(`/api/tournaments/${id}/teams`, {
    method: 'PUT',
    json: {
      teams: teamIds.map((teamId, i) => ({
        teamId,
        members: Array.from({ length: perTeam }, (_, k) => ({ userId: `${id}-pu${i * perTeam + k}`, username: `User p${i * perTeam + k}` })),
      })),
    },
  });
  expect(put.status).toBe(200);
  expect((await tournamentTransition(id, 'assign')).status).toBe(200);
  return { id, teamIds };
}

/** Move a tournament match through gather/assign/battle via the API and score every map for `winner` ('team1' | 'team2'). */
export async function startAndScore(matchId: string, winner: 'team1' | 'team2') {
  const order = ['created', 'gather', 'assign', 'battle'];
  for (const s of ['gather', 'assign', 'battle']) {
    const [cur] = await getPgTestDb().select({ status: matches.status }).from(matches).where(eq(matches.id, matchId));
    if (order.indexOf(cur.status) < order.indexOf(s)) {
      const res = await appRequest(`/api/matches/${matchId}/transition`, { method: 'POST', json: { newStatus: s } });
      expect(res.status, `match -> ${s}: ${JSON.stringify(res.data)}`).toBe(200);
    }
  }
  const games = await getPgTestDb().select({ id: matchGames.id }).from(matchGames).where(eq(matchGames.match_id, matchId)).orderBy(asc(matchGames.round));
  for (const g of games) {
    const res = await appRequest(`/api/matches/${matchId}/games/${g.id}/result`, { method: 'POST', json: { winner, winnerScore: 13, loserScore: 2 } });
    expect(res.status, `score: ${JSON.stringify(res.data)}`).toBe(200);
  }
}

/** Play every open match (the picked side wins) and progress until the tournament completes. */
export async function playOutBracket(tournamentIdArg: string, pick: 'team1' | 'team2' = 'team1') {
  for (let iter = 0; iter < 40; iter++) {
    const [t] = await getPgTestDb().select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, tournamentIdArg));
    if (t?.status !== 'battle') break;
    const open = await getPgTestDb().select({ id: matches.id, status: matches.status }).from(matches)
      .innerJoin(tournamentMatches, eq(tournamentMatches.match_id, matches.id))
      .where(eq(matches.tournament_id, tournamentIdArg)).orderBy(asc(tournamentMatches.round), asc(tournamentMatches.match_order));
    for (const m of open.filter((x) => x.status !== 'complete')) await startAndScore(m.id, pick);
    const p = await progressBracket(tournamentIdArg);
    if (p.status !== 200 && !/not complete/.test(p.data?.error ?? '')) throw new Error(`progress failed: ${p.status} ${JSON.stringify(p.data)}`);
  }
}

/** Create, generate, start and play a bracket tournament to completion. */
export async function finishedBracket(ctx: { gameId: string; modeId: string }, format: 'single-elimination' | 'double-elimination', nTeams: number, pick: 'team1' | 'team2' = 'team1') {
  const t = await tournamentInAssign(ctx, format, nTeams);
  expect((await generateBracket(t.id)).status).toBe(200);
  expect((await tournamentTransition(t.id, 'battle')).status).toBe(200);
  await playOutBracket(t.id, pick);
  const [row] = await getPgTestDb().select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, t.id));
  expect(row.status).toBe('complete');
  return t;
}
