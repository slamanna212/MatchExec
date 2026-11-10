// @vitest-environment node
/** Team logos: own upload on tournament / match teams, series entrant fallback at read time, PUT validation. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { appRequest } from '../../utils/app-request';
import { createGame, createGameMode, createMatch, createMatchParticipant, createTournament } from '../../utils/pg-fixtures';
import { createSeriesWithEntrants } from '../../utils/pg-series-fixtures';
import { insertTeams } from '../../utils/pg-tournament-fixtures';
import { createMatchTeams } from '@/lib/matches';
import { matchTeams, seriesEntrants, tournamentTeams } from '../../../lib/db/schema';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});

describe('tournament team logos', () => {
  it('sets, returns and clears a team logo', async () => {
    const t = await createTournament(gameId, { id: 'tl1', game_mode_id: modeId });
    const [teamId] = await insertTeams(t.id, 1);
    const put = await appRequest(`/api/tournaments/${t.id}/teams/${teamId}/logo`, { method: 'PUT', json: { logo_url: '/uploads/event-images/a.png' } });
    expect(put.status).toBe(200);
    const list = await appRequest(`/api/tournaments/${t.id}/teams`);
    expect((list.data as Array<{ logo_url: string | null }>)[0].logo_url).toBe('/uploads/event-images/a.png');
    await appRequest(`/api/tournaments/${t.id}/teams/${teamId}/logo`, { method: 'PUT', json: { logo_url: null } });
    const after = await appRequest(`/api/tournaments/${t.id}/teams`);
    expect((after.data as Array<{ logo_url: string | null }>)[0].logo_url).toBeNull();
  });

  it('rejects non-upload URLs and teams from another tournament', async () => {
    const t = await createTournament(gameId, { id: 'tl2', game_mode_id: modeId });
    const other = await createTournament(gameId, { id: 'tl3', game_mode_id: modeId });
    const [teamId] = await insertTeams(t.id, 1);
    expect((await appRequest(`/api/tournaments/${t.id}/teams/${teamId}/logo`, { method: 'PUT', json: { logo_url: 'https://evil.example/x.png' } })).status).toBe(400);
    expect((await appRequest(`/api/tournaments/${other.id}/teams/${teamId}/logo`, { method: 'PUT', json: { logo_url: null } })).status).toBe(404);
  });

  it('falls back to the series entrant logo, own upload wins', async () => {
    const t = await createTournament(gameId, { id: 'tl4', game_mode_id: modeId });
    const [teamId] = await insertTeams(t.id, 1);
    const { entrants } = await createSeriesWithEntrants(pg(), { entrantType: 'team', entrants: [{ name: 'E1' }] });
    await pg().update(seriesEntrants).set({ logo_url: '/uploads/event-images/entrant.png' }).where(eq(seriesEntrants.id, entrants[0].id));
    await pg().update(tournamentTeams).set({ series_entrant_id: entrants[0].id }).where(eq(tournamentTeams.id, teamId));
    const inherited = await appRequest(`/api/tournaments/${t.id}/teams`);
    expect((inherited.data as Array<{ logo_url: string | null }>)[0].logo_url).toBe('/uploads/event-images/entrant.png');
    await pg().update(tournamentTeams).set({ logo_url: '/uploads/event-images/own.png' }).where(eq(tournamentTeams.id, teamId));
    const own = await appRequest(`/api/tournaments/${t.id}/teams`);
    expect((own.data as Array<{ logo_url: string | null }>)[0].logo_url).toBe('/uploads/event-images/own.png');
  });
});

describe('match team logos', () => {
  it('sets a match team logo and exposes it on teams and participants', async () => {
    const m = await createMatch(gameId, modeId, { id: 'ml1', status: 'assign' });
    await createMatchTeams(pg(), m.id);
    const teams = (await appRequest(`/api/matches/${m.id}/teams`)).data as { teams: Array<{ id: string; team_order: number; logo_url: string | null }> };
    const blue = teams.teams.find((t) => t.team_order === 0)!;
    const put = await appRequest(`/api/matches/${m.id}/teams/${blue.id}/logo`, { method: 'PUT', json: { logo_url: '/uploads/event-images/b.png' } });
    expect(put.status).toBe(200);
    await createMatchParticipant(m.id, 'd1', 'Alice', { team_id: blue.id });
    const parts = (await appRequest(`/api/matches/${m.id}/participants`)).data as { participants: Array<{ team_logo_url: string | null }> };
    expect(parts.participants[0].team_logo_url).toBe('/uploads/event-images/b.png');
    const row = await pg().select().from(matchTeams).where(eq(matchTeams.id, blue.id));
    expect(row[0].logo_url).toBe('/uploads/event-images/b.png');
  });

  it('404s for a team of another match and 400s for a bad URL', async () => {
    const m = await createMatch(gameId, modeId, { id: 'ml2', status: 'assign' });
    await createMatchTeams(pg(), m.id);
    expect((await appRequest(`/api/matches/${m.id}/teams/nope/logo`, { method: 'PUT', json: { logo_url: null } })).status).toBe(404);
    expect((await appRequest(`/api/matches/${m.id}/teams/nope/logo`, { method: 'PUT', json: { logo_url: 'x' } })).status).toBe(400);
  });
});
