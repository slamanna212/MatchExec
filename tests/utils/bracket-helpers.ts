/**
 * Helpers that drive tournaments through the real API routes (create -> teams -> assign ->
 * generate -> battle -> score -> progress). Used by tests that need a finished tournament.
 */
import { expect } from 'vitest';
import { createMockRequest, parseResponse, createRouteParams } from './api-helpers';
import type { getTestDb } from './test-db';
import { POST as createTournament } from '@/app/api/tournaments/route';
import { POST as transitionTournament } from '@/app/api/tournaments/[tournamentId]/transition/route';
import { POST as createTeam, PUT as assignMembers } from '@/app/api/tournaments/[tournamentId]/teams/route';
import { POST as generateMatches } from '@/app/api/tournaments/[tournamentId]/generate-matches/route';
import { POST as progressTournament } from '@/app/api/tournaments/[tournamentId]/progress/route';
import { forwardToApp as transitionMatch } from '../utils/legacy-match-routes';
import { forwardToApp as saveResult } from '../utils/legacy-match-routes';

export interface BracketCtx {
  db: ReturnType<typeof getTestDb>;
  gameId: string;
  /** A Normal (team) mode with maps, used as the tournament's game mode. */
  normalModeId: string;
}

const req = (method: string, url: string, body?: Record<string, unknown>) => createMockRequest(method, url, body);
let counter = 0;

export async function tournamentTransition(tournamentId: string, newStatus: string) {
  return parseResponse(await transitionTournament(
    req('POST', `/api/tournaments/${tournamentId}/transition`, { newStatus }), createRouteParams({ tournamentId })
  ));
}

export const generateBracket = async (tournamentId: string) => parseResponse(await generateMatches(
  req('POST', `/api/tournaments/${tournamentId}/generate-matches`, {}), createRouteParams({ tournamentId })
));

export const progressBracket = async (tournamentId: string) => parseResponse(await progressTournament(
  req('POST', `/api/tournaments/${tournamentId}/progress`, {}), createRouteParams({ tournamentId })
));

/** Create a tournament in 'assign' with `nTeams` two-player teams. Player i has discord id d-<tournament>-<i>. */
export async function tournamentInAssign(ctx: BracketCtx, format: string, nTeams: number) {
  const created = await parseResponse(await createTournament(req('POST', '/api/tournaments', {
    name: `B${++counter}`, gameId: ctx.gameId, gameModeId: ctx.normalModeId, format, roundsPerMatch: 1,
  })));
  expect(created.status).toBe(201);
  const id: string = created.data.id;
  await tournamentTransition(id, 'gather');

  const teamIds: string[] = [];
  for (let i = 0; i < nTeams; i++) {
    teamIds.push((await parseResponse(await createTeam(
      req('POST', `/api/tournaments/${id}/teams`, { teamName: `T${i + 1}` }), createRouteParams({ tournamentId: id })
    ))).data.id);
  }
  for (let i = 0; i < nTeams * 2; i++) {
    await ctx.db.run(
      `INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username) VALUES (?, ?, ?, ?, ?)`,
      [`${id}-tp${i}`, id, `${id}-u${i}`, `d-${id}-${i}`, `U${i}`]
    );
  }
  const put = await assignMembers(req('PUT', `/api/tournaments/${id}/teams`, {
    teams: teamIds.map((teamId, i) => ({
      teamId, members: [0, 1].map(k => ({ userId: `${id}-u${i * 2 + k}`, username: `U${i * 2 + k}` })),
    })),
  }), createRouteParams({ tournamentId: id }));
  expect(put.status).toBe(200);
  expect((await tournamentTransition(id, 'assign')).status).toBe(200);
  return { id, teamIds };
}

export async function startAndScore(ctx: BracketCtx, matchId: string, winner: 'team1' | 'team2') {
  const order = ['created', 'gather', 'assign', 'battle'];
  for (const s of ['gather', 'assign', 'battle']) {
    const cur = (await ctx.db.get<{ status: string }>(`SELECT status FROM matches WHERE id = ?`, [matchId]))!.status;
    if (order.indexOf(cur) < order.indexOf(s)) {
      const res = await parseResponse(await transitionMatch(
        req('POST', `/api/matches/${matchId}/transition`, { newStatus: s }), createRouteParams({ matchId })
      ));
      expect(res.status, `match -> ${s}`).toBe(200);
    }
  }
  const games = await ctx.db.all<{ id: string }>(`SELECT id FROM match_games WHERE match_id = ?`, [matchId]);
  for (const g of games) {
    const res = await parseResponse(await saveResult(
      req('POST', `/api/matches/${matchId}/games/${g.id}/result`, { winner, winnerScore: 13, loserScore: 2 }),
      createRouteParams({ matchId, gameId: g.id })
    ));
    expect(res.status, `score: ${JSON.stringify(res.data)}`).toBe(200);
  }
}

/** Play every open match (the pick'ed side wins) and progress until the tournament completes. */
export async function playOutBracket(ctx: BracketCtx, tournamentId: string, pick: 'team1' | 'team2' = 'team1') {
  for (let iter = 0; iter < 40; iter++) {
    const t = await ctx.db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [tournamentId]);
    if (t?.status !== 'battle') break;
    const open = await ctx.db.all<{ id: string }>(
      `SELECT m.id FROM matches m JOIN tournament_matches tm ON tm.match_id = m.id
       WHERE m.tournament_id = ? AND m.status != 'complete' ORDER BY tm.round, tm.match_order`, [tournamentId]
    );
    for (const m of open) await startAndScore(ctx, m.id, pick);
    const p = await progressBracket(tournamentId);
    if (p.status !== 200 && !/not complete/.test(p.data.error ?? '')) {
      throw new Error(`progress failed: ${p.status} ${JSON.stringify(p.data)}`);
    }
  }
}

/** Create, generate, start and play a bracket tournament to completion. */
export async function finishedBracket(ctx: BracketCtx, format: 'single-elimination' | 'double-elimination', nTeams: number, pick: 'team1' | 'team2' = 'team1') {
  const t = await tournamentInAssign(ctx, format, nTeams);
  expect((await generateBracket(t.id)).status).toBe(200);
  expect((await tournamentTransition(t.id, 'battle')).status).toBe(200);
  await playOutBracket(ctx, t.id, pick);
  expect((await ctx.db.get<{ status: string }>(`SELECT status FROM tournaments WHERE id = ?`, [t.id]))?.status).toBe('complete');
  return t;
}
