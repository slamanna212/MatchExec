// @vitest-environment node
/** Bracket generation, persistence and state queries against the Postgres harness (domain functions called directly). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createTournament } from '../../utils/pg-fixtures';
import { bracketGame, completeMatch, insertTeams } from '../../utils/pg-tournament-fixtures';
import type { tournaments } from '../../../lib/db/schema';
import { matchGames, matchParticipants, matchTeams, matches, tournamentMatches, tournamentRoundByes, tournamentTeams } from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import {
  generateCumulativeMatches, generateDoubleEliminationMatches, generateDoubleEliminationRoundMatches, generateNextRoundMatches,
  generateSingleEliminationMatches, getBracketWinner, getCurrentRoundInfo, isRoundComplete, saveGeneratedMatches, TournamentError,
  type BracketAssignment, type GeneratedMatch, type TournamentMatchInfo,
} from '@/lib/tournaments';
import { AfterCommit as Effects } from '@/lib/matches/effects';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
const setupVoice = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/matches/voice-channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/matches/voice-channels')>()),
  VoiceChannelService: { setupMatchVoiceChannels: (...a: unknown[]) => setupVoice(...a) },
}));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  setupVoice.mockClear();
  const g = await bracketGame({ maps: 5 });
  gameId = g.gameId;
  modeId = g.modeId;
});

const newTournament = (o: Partial<typeof tournaments.$inferInsert> = {}) => createTournament(gameId, { game_mode_id: modeId, ...o });
const assignmentsFor = (teams: string[]): BracketAssignment[] => teams.map((teamId, i) => ({ position: i + 1, teamId }));
const infosFor = (tournamentId: string, round: number, generated: GeneratedMatch[], bracket: 'winners' | 'losers' | 'final' = 'winners'): TournamentMatchInfo[] =>
  generated.map((m, i) => ({ id: m.id, tournament_id: tournamentId, round, bracket_type: bracket, team1_id: m.team1_id, team2_id: m.team2_id, match_order: i + 1 }));

/** Generate + save one round in a transaction (voice setup deferred like the API does). */
async function saveRound(tournamentId: string, generated: GeneratedMatch[], round: number, opts: { addAllTeams?: boolean } = {}) {
  const after = new Effects();
  await db.transaction((tx) => saveGeneratedMatches(tx, generated, infosFor(tournamentId, round, generated), opts, after));
  await after.run();
}

describe('generateSingleEliminationMatches', () => {
  it('generates the first-round pairs for 4 teams', async () => {
    const t = await newTournament();
    const teams = await insertTeams(t.id, 4);
    const generated = await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    expect(generated).toHaveLength(2);
    expect(generated[0]).toMatchObject({ tournament_round: 1, tournament_bracket_type: 'winners', team1_id: teams[0], team2_id: teams[1], name: 'Team 1 vs Team 2' });
    expect(generated[1]).toMatchObject({ team1_id: teams[2], team2_id: teams[3] });
  });

  it('orders by position, whatever order the assignments arrive in', async () => {
    const t = await newTournament();
    const [a, b, c, d] = await insertTeams(t.id, 4);
    const generated = await generateSingleEliminationMatches(db, t.id, [{ position: 3, teamId: c }, { position: 1, teamId: a }, { position: 4, teamId: d }, { position: 2, teamId: b }]);
    expect(generated.map((m) => [m.team1_id, m.team2_id])).toEqual([[a, b], [c, d]]);
  });

  it.each([[2, 1], [3, 1], [5, 2], [8, 4], [9, 4]])('%i teams give %i first-round matches (the odd team out gets a bye)', async (teams, matchesCount) => {
    const t = await newTournament();
    const ids = await insertTeams(t.id, teams);
    const generated = await generateSingleEliminationMatches(db, t.id, assignmentsFor(ids));
    expect(generated).toHaveLength(matchesCount);
    const byes = await pg().select().from(tournamentRoundByes).where(eq(tournamentRoundByes.tournament_id, t.id));
    expect(byes.map((b) => [b.round, b.bracket_type, b.team_id])).toEqual(teams % 2 ? [[1, 'winners', ids[teams - 1]]] : []);
  });

  it('builds matches with status, type, rules and the tournament settings', async () => {
    const t = await newTournament({ ruleset: 'competitive', description: 'Finals', event_image_url: '/img.png', stats_enabled: true, announcements: [{ id: 'a', value: 1, unit: 'hours' }] });
    const teams = await insertTeams(t.id, 2);
    const [m] = await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams), new Date('2026-05-01T10:00:00Z'));
    expect(m).toMatchObject({
      status: 'assign', match_type: 'tournament', rules: 'competitive', description: 'Finals', event_image_url: '/img.png', stats_enabled: true,
      announcements: [{ id: 'a', value: 1, unit: 'hours' }], max_participants: 12, game_id: gameId, rounds_per_match: 3,
    });
    expect(m.scheduled_time?.toISOString()).toBe('2026-05-01T10:00:00.000Z');
    expect(m.maps).toHaveLength(3);
    expect(new Set(m.maps).size).toBe(3);
    expect(m.map_id).toBe(m.maps![0]);
  });

  it('propagates player_notifications from the tournament to the generated matches', async () => {
    const t = await newTournament({ player_notifications: false, rounds_per_match: 1 });
    const teams = await insertTeams(t.id, 2);
    const [m] = await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    expect(m.player_notifications).toBe(false);
  });

  it('returns nothing for empty assignments and fails clearly for unknown tournaments / modes / maps', async () => {
    const t = await newTournament();
    expect(await generateSingleEliminationMatches(db, t.id, [])).toEqual([]);
    await expect(generateSingleEliminationMatches(db, 'nope', [])).rejects.toMatchObject({ status: 404 });
    const noMode = await newTournament({ game_mode_id: 'missing-mode' });
    await expect(generateSingleEliminationMatches(db, noMode.id, [])).rejects.toThrow(/Game mode missing-mode not found/);
    const g2 = await bracketGame({ maps: 0 });
    const noMaps = await createTournament(g2.gameId, { game_mode_id: g2.modeId });
    await expect(generateSingleEliminationMatches(db, noMaps.id, [])).rejects.toBeInstanceOf(TournamentError);
  });

  it('generates 512 first-round matches for 1024 teams', async () => {
    const t = await newTournament({ rounds_per_match: 1 });
    const rows = Array.from({ length: 1024 }, (_, i) => ({ id: `big-${i}`, tournament_id: t.id, team_name: `Team ${i}` }));
    await pg().insert(tournamentTeams).values(rows);
    const generated = await generateSingleEliminationMatches(db, t.id, rows.map((r, i) => ({ position: i + 1, teamId: r.id })));
    expect(generated).toHaveLength(512);
  }, 60_000);
});

describe('generateDoubleEliminationMatches', () => {
  it('generates the same first round as single elimination', async () => {
    const t = await newTournament({ format: 'double-elimination' });
    const teams = await insertTeams(t.id, 4);
    const generated = await generateDoubleEliminationMatches(db, t.id, assignmentsFor(teams));
    expect(generated).toHaveLength(2);
    expect(generated[0].tournament_bracket_type).toBe('winners');
  });
});

describe('generateDoubleEliminationRoundMatches', () => {
  it('builds a losers-bracket match for the planned pairing', async () => {
    const t = await newTournament({ format: 'double-elimination' });
    const [t2, t4] = await insertTeams(t.id, 2);
    const generated = await generateDoubleEliminationRoundMatches(db, t.id, [{ bracket: 'losers', round: 1, team1: t2, team2: t4 }]);
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({ tournament_bracket_type: 'losers', tournament_round: 1, team1_id: t2, team2_id: t4 });
  });

  it('builds the grand final and the reset with the right names', async () => {
    const t = await newTournament({ format: 'double-elimination' });
    const [wb, lb] = await insertTeams(t.id, 2);
    const [final, reset] = await generateDoubleEliminationRoundMatches(db, t.id, [
      { bracket: 'final', round: 1, team1: wb, team2: lb },
      { bracket: 'final', round: 2, team1: wb, team2: lb, reset: true },
    ]);
    expect(final).toMatchObject({ tournament_bracket_type: 'final', team1_id: wb, team2_id: lb });
    expect(final.name).toMatch(/^Grand Finals: /);
    expect(reset.tournament_round).toBe(2);
    expect(reset.name).toMatch(/^Grand Finals Reset: /);
  });

  it('returns an empty array when nothing is planned', async () => {
    const t = await newTournament();
    expect(await generateDoubleEliminationRoundMatches(db, t.id, [])).toEqual([]);
  });
});

describe('saveGeneratedMatches', () => {
  it('writes the match rows, bracket rows, named match teams, rosters and game rows in one go', async () => {
    const t = await newTournament({ rounds_per_match: 2 });
    const [a, b] = await insertTeams(t.id, 2, 2);
    const generated = await generateSingleEliminationMatches(db, t.id, assignmentsFor([a, b]));
    await saveRound(t.id, generated, 1);

    const [match] = await pg().select().from(matches).where(eq(matches.id, generated[0].id));
    expect(match).toMatchObject({ tournament_id: t.id, tournament_round: 1, tournament_bracket_type: 'winners', status: 'assign', blue_team_id: a, red_team_id: b, team1_name: 'Team 1', team2_name: 'Team 2', rounds: 2 });
    const [row] = await pg().select().from(tournamentMatches).where(eq(tournamentMatches.match_id, match.id));
    expect(row).toMatchObject({ team1_id: a, team2_id: b, round: 1, bracket_type: 'winners', match_order: 1 });
    const mts = await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, match.id), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
    expect(mts.map((x) => x.team_name)).toEqual(['Team 1', 'Team 2']);
    const parts = await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, match.id));
    expect(parts).toHaveLength(4);
    expect(parts.filter((p) => p.team_id === mts[0].id)).toHaveLength(2);
    expect(await pg().select().from(matchGames).where(eq(matchGames.match_id, match.id))).toHaveLength(2);
    expect(setupVoice).toHaveBeenCalledWith(match.id);
  });

  it('adds the roster of whichever side is known when a match is only half filled', async () => {
    const t = await newTournament();
    const [a] = await insertTeams(t.id, 1, 2);
    const g = (await generateSingleEliminationMatches(db, t.id, assignmentsFor(await insertTeams(t.id, 2))))[0];
    const half: GeneratedMatch = { ...g, id: 'half-match', team1_id: a, team2_id: undefined };
    const after = new Effects();
    await db.transaction((tx) => saveGeneratedMatches(tx, [half], [{ id: 'half-match', tournament_id: t.id, round: 1, bracket_type: 'winners', team1_id: a, match_order: 1 }], {}, after));
    expect(await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, 'half-match'))).toHaveLength(2);
    expect(await pg().select().from(matchTeams).where(eq(matchTeams.match_id, 'half-match'))).toHaveLength(0);
  });

  it('a voice channel failure never fails the save', async () => {
    setupVoice.mockRejectedValueOnce(new Error('bot offline'));
    const t = await newTournament();
    const teams = await insertTeams(t.id, 2);
    const generated = await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    await expect(saveRound(t.id, generated, 1)).resolves.toBeUndefined();
    expect(await pg().select().from(matches).where(eq(matches.tournament_id, t.id))).toHaveLength(1);
  });

  it('rolls everything back when the transaction fails (no half-saved bracket)', async () => {
    const t = await newTournament();
    const teams = await insertTeams(t.id, 4);
    const generated = await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    const bad = [...generated, { ...generated[0] }]; // duplicate match id -> primary key violation on the last insert
    await expect(db.transaction((tx) => saveGeneratedMatches(tx, bad, infosFor(t.id, 1, bad), {}, new Effects()))).rejects.toThrow();
    expect(await pg().select().from(matches)).toHaveLength(0);
    expect(await pg().select().from(tournamentMatches)).toHaveLength(0);
  });
});

describe('generateNextRoundMatches', () => {
  async function playedRoundOne(teamCount: number) {
    const t = await newTournament();
    const teams = await insertTeams(t.id, teamCount);
    const round1 = await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    await saveRound(t.id, round1, 1);
    return { t, teams, round1 };
  }

  it('generates the next round from the completed matches', async () => {
    const { t, round1 } = await playedRoundOne(4);
    for (const m of round1) await completeMatch(m.id, m.team1_id!);
    const next = await generateNextRoundMatches(db, t.id, 1, 'winners');
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ tournament_round: 2, team1_id: round1[0].team1_id, team2_id: round1[1].team1_id });
  });

  it('returns an empty array when only one match was left (the tournament is done)', async () => {
    const { t, teams, round1 } = await playedRoundOne(2);
    await completeMatch(round1[0].id, teams[0]);
    expect(await generateNextRoundMatches(db, t.id, 1, 'winners')).toEqual([]);
  });

  it('fails when the round has no decided match', async () => {
    const { t } = await playedRoundOne(4);
    await expect(generateNextRoundMatches(db, t.id, 1, 'winners')).rejects.toThrow('No completed matches found for previous round');
  });

  it('ignores completed matches without a winner (draws)', async () => {
    const { t, round1 } = await playedRoundOne(4);
    await completeMatch(round1[0].id, round1[0].team1_id!);
    await completeMatch(round1[1].id, null);
    expect(await generateNextRoundMatches(db, t.id, 1, 'winners')).toEqual([]); // 1 decided match, no byes: treated as the last team
  });
});

describe('6-team bye progression', () => {
  it('carries the bye team through to the final', async () => {
    const t = await newTournament();
    const teams = await insertTeams(t.id, 6);
    const round1 = await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    expect(round1).toHaveLength(3);
    await saveRound(t.id, round1, 1);
    expect(await pg().select().from(tournamentRoundByes)).toHaveLength(0);
    for (const m of round1) await completeMatch(m.id, m.team1_id!);

    const round2 = await generateNextRoundMatches(db, t.id, 1, 'winners');
    expect(round2).toHaveLength(1);
    expect(round2[0].tournament_round).toBe(2);
    const byes2 = await pg().select().from(tournamentRoundByes).where(and(eq(tournamentRoundByes.round, 2), eq(tournamentRoundByes.bracket_type, 'winners')));
    expect(byes2).toHaveLength(1);
    const byeTeam = byes2[0].team_id;
    await saveRound(t.id, round2, 2);
    const r2Winner = round2[0].team1_id!;
    await completeMatch(round2[0].id, r2Winner);

    const round3 = await generateNextRoundMatches(db, t.id, 2, 'winners');
    expect(round3).toHaveLength(1);
    expect(round3[0].tournament_round).toBe(3);
    expect([round3[0].team1_id, round3[0].team2_id].sort()).toEqual([byeTeam, r2Winner].sort());
    await saveRound(t.id, round3, 3);
    await completeMatch(round3[0].id, round3[0].team1_id!);
    expect(await generateNextRoundMatches(db, t.id, 3, 'winners')).toEqual([]);
  });

  it('does not touch 4-team (power of two) brackets', async () => {
    const t = await newTournament();
    const teams = await insertTeams(t.id, 4);
    const round1 = await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    await saveRound(t.id, round1, 1);
    for (const m of round1) await completeMatch(m.id, m.team1_id!);
    const round2 = await generateNextRoundMatches(db, t.id, 1, 'winners');
    expect(round2).toHaveLength(1);
    expect(await pg().select().from(tournamentRoundByes)).toHaveLength(0);
    await saveRound(t.id, round2, 2);
    await completeMatch(round2[0].id, round2[0].team1_id!);
    expect(await generateNextRoundMatches(db, t.id, 2, 'winners')).toEqual([]);
  });

  it('recording a bye twice is idempotent', async () => {
    const t = await newTournament();
    const teams = await insertTeams(t.id, 3);
    await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    expect(await pg().select().from(tournamentRoundByes)).toHaveLength(1);
  });
});

describe('round state queries', () => {
  async function oneMatchBracket() {
    const t = await newTournament();
    const teams = await insertTeams(t.id, 2);
    const generated = await generateSingleEliminationMatches(db, t.id, assignmentsFor(teams));
    await saveRound(t.id, generated, 1);
    return { t, teams, generated };
  }

  it('isRoundComplete: false without matches, false while open, true once every match is complete', async () => {
    const empty = await newTournament();
    expect(await isRoundComplete(db, empty.id, 1, 'winners')).toBe(false);
    const { t, teams, generated } = await oneMatchBracket();
    expect(await isRoundComplete(db, t.id, 1, 'winners')).toBe(false);
    await completeMatch(generated[0].id, teams[0]);
    expect(await isRoundComplete(db, t.id, 1, 'winners')).toBe(true);
    expect(await isRoundComplete(db, t.id, 1, 'losers')).toBe(false);
  });

  it('getCurrentRoundInfo reports the highest round per bracket and whether it is finished', async () => {
    const { t, teams, generated } = await oneMatchBracket();
    expect(await getCurrentRoundInfo(db, t.id)).toEqual({ maxWinnersRound: 1, maxLosersRound: 0, winnersComplete: false, losersComplete: false });
    await completeMatch(generated[0].id, teams[0]);
    expect(await getCurrentRoundInfo(db, t.id)).toMatchObject({ winnersComplete: true });
    expect(await getCurrentRoundInfo(db, (await newTournament()).id)).toEqual({ maxWinnersRound: 0, maxLosersRound: 0, winnersComplete: false, losersComplete: false });
  });

  it('getBracketWinner returns the winner of the latest decided match, or null', async () => {
    const empty = await newTournament();
    expect(await getBracketWinner(db, empty.id, 'winners')).toBeNull();
    const { t, teams, generated } = await oneMatchBracket();
    expect(await getBracketWinner(db, t.id, 'winners')).toBeNull();
    await completeMatch(generated[0].id, teams[1]);
    expect(await getBracketWinner(db, t.id, 'winners')).toBe(teams[1]);
    expect(await getBracketWinner(db, t.id, 'losers')).toBeNull();
  });
});

describe('generateCumulativeMatches', () => {
  it('builds one group match for everyone, scheduled far in the future unless a start time is set', async () => {
    const g = await bracketGame({ scoringType: 'Position', teamSize: null, maps: 3 });
    const t = await createTournament(g.gameId, { game_mode_id: g.modeId, format: 'cumulative-points', rounds_per_match: 2 });
    const { matches: generated, tournamentMatches: infos } = await generateCumulativeMatches(db, t.id);
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({ status: 'assign', max_participants: 999, name: 'Test Tournament', tournament_round: 1, game_mode_id: g.modeId });
    expect(generated[0].maps).toHaveLength(2);
    expect(generated[0].scheduled_time?.toISOString()).toBe('2099-12-31T23:59:59.999Z');
    expect(infos).toEqual([{ id: generated[0].id, tournament_id: t.id, round: 1, bracket_type: 'winners', match_order: 1 }]);
    const start = new Date('2026-08-01T12:00:00Z');
    expect((await generateCumulativeMatches(db, t.id, start)).matches[0].scheduled_time).toEqual(start);
  });

  it('saveGeneratedMatches(addAllTeams) puts every team member in the match with one match team each (no voice channels)', async () => {
    const g = await bracketGame({ scoringType: 'Position', teamSize: null, maps: 3 });
    const t = await createTournament(g.gameId, { game_mode_id: g.modeId, format: 'cumulative-points', rounds_per_match: 1 });
    await insertTeams(t.id, 3, 1);
    const { matches: generated, tournamentMatches: infos } = await generateCumulativeMatches(db, t.id);
    const after = new Effects();
    await db.transaction((tx) => saveGeneratedMatches(tx, generated, infos, { addAllTeams: true }, after));
    await after.run();
    const parts = await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, generated[0].id));
    expect(parts).toHaveLength(3);
    expect(await pg().select().from(matchTeams).where(and(eq(matchTeams.match_id, generated[0].id), eq(matchTeams.is_reserve, false)))).toHaveLength(3);
    expect(setupVoice).not.toHaveBeenCalled();
  });

  it('rejects a tournament without eligible maps', async () => {
    const g = await bracketGame({ scoringType: 'Position', teamSize: null, maps: 0 });
    const t = await createTournament(g.gameId, { game_mode_id: g.modeId, format: 'cumulative-points' });
    await expect(generateCumulativeMatches(db, t.id)).rejects.toBeInstanceOf(TournamentError);
  });
});
