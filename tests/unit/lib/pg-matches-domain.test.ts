// @vitest-environment node
/** Matches domain functions on Postgres: teams, participants, voice channels, map codes, winner votes, scheduler queries. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch, createTournament } from '../../utils/pg-fixtures';
import {
  autoVoiceChannels, discordBotRequests, discordChannels, discordMapCodeQueue, discordScoreNotificationQueue, discordSettings,
  discordStatusUpdateQueue, discordVoiceAnnouncementQueue, discordWinnerVoteMessages, gameMaps, games, matchGames, matchParticipants,
  matchTeams, matchVoiceAlternation, matches, scorecardSubmissions, statsSettings,
} from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import {
  MapCodeService, VoiceChannelService, addParticipant, areAllGamesCompleted, assignParticipantToTeam, castVote, casMatchStatus,
  countAvatarUsersSkipped, createMatchTeams, createMatchVoiceChannels, createNamedMatchTeams, deleteMatchVoiceChannels,
  ensureMatchGameExists, getLastFirstTeam, getMatchTeams, handleTournamentAssignTransition, incrementAvatarFailures,
  initializeMatchGames, listAvatarRefreshUsers, listDmRecipients, listMatchesDueToStart, listStaleBattleMatches, listUpcomingMatches,
  nextFirstTeam, recordAvatarRefreshed, recordFirstTeam, releaseHeldScoreNotification, removeParticipantByUser, resolveMatchTeam,
  saveMatchResult, setTeamVoiceChannel, submitVoteWinner, TeamAssignmentError, trackVoiceChannels, listVotesForGame, recordVotePrompt,
  isScorecardRequiredButMissing, findVoteByMessage, listVoteCommanders,
} from '@/lib/matches';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
beforeEach(async () => { gameId = (await createGame({ max_signups: 4 })).id; });

const join = async (matchId: string, n: number, from = 0) => {
  const ids: string[] = [];
  for (let i = from; i < from + n; i++) {
    ids.push(`${matchId}-p${i}`);
    await pg().insert(matchParticipants).values({ id: ids[ids.length - 1], match_id: matchId, user_id: `u${i}`, discord_user_id: `d${i}`, username: `P${i}`, joined_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
  }
  return ids;
};

describe('team creation', () => {
  it('Normal: Blue/Red/Reserve, or N numbered teams when the match asks for more, reusing existing rows', async () => {
    const mode = await createGameMode(gameId, { scoring_type: 'Normal', max_teams: 2 });
    const two = await createMatch(gameId, mode.id, { id: 'two' });
    await createMatchTeams(db, two.id);
    expect((await getMatchTeams(db, two.id)).map((t) => [t.team_name, t.team_order, t.is_reserve])).toEqual([['Blue', 0, false], ['Red', 1, false], ['Reserve', 99, true]]);
    await pg().delete(matchTeams).where(and(eq(matchTeams.match_id, two.id), eq(matchTeams.is_reserve, true)));
    await createMatchTeams(db, two.id); // fills the missing Reserve
    expect(await getMatchTeams(db, two.id)).toHaveLength(3);

    const four = await createMatch(gameId, mode.id, { id: 'four' });
    await createMatchTeams(db, four.id, 4);
    expect((await getMatchTeams(db, four.id)).map((t) => t.team_name)).toEqual(['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Reserve']);
    expect((await pg().select().from(matches).where(eq(matches.id, four.id)))[0].team_count).toBe(4);
    await createMatchTeams(db, 'unknown-match'); // no match: no-op
  });

  it('FFA: one team per participant, late joiners get a team on the next call', async () => {
    const mode = await createGameMode(gameId, { scoring_type: 'FFA' });
    const m = await createMatch(gameId, mode.id, { id: 'ffa' });
    await join(m.id, 2);
    await createMatchTeams(db, m.id);
    await join(m.id, 1, 2);
    await createMatchTeams(db, m.id);
    const teams = await getMatchTeams(db, m.id);
    expect(teams.map((t) => [t.team_name, t.team_order])).toEqual([['P0', 0], ['P1', 1], ['P2', 2]]);
    const owners = await pg().select().from(matchParticipants).where(eq(matchParticipants.match_id, m.id)).orderBy(asc(matchParticipants.user_id));
    expect(owners.every((p) => p.team_id !== null)).toBe(true);
  });

  it('team-endurance Position: round-robin teams, overflow to Reserve, late joiners fill the emptiest team', async () => {
    const mode = await createGameMode(gameId, { scoring_type: 'Position', team_size: 2, max_teams: 2 });
    const m = await createMatch(gameId, mode.id, { id: 'end' });
    const ids = await join(m.id, 5);
    await createMatchTeams(db, m.id);
    const teams = await getMatchTeams(db, m.id);
    const byTeam = async (teamId: string) => (await pg().select().from(matchParticipants).where(eq(matchParticipants.team_id, teamId))).map((p) => p.id).sort();
    expect(await byTeam(teams[0].id)).toEqual([ids[0], ids[2]].sort());
    expect(await byTeam(teams[1].id)).toEqual([ids[1], ids[3]].sort());
    expect(await byTeam(teams[2].id)).toEqual([ids[4]]); // Reserve
    const [late] = await join(m.id, 1, 5);
    await pg().update(matchParticipants).set({ team_id: null }).where(eq(matchParticipants.id, ids[0]));
    await createMatchTeams(db, m.id);
    expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.id, ids[0])))[0].team_id).toBe(teams[0].id);
    expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.id, late)))[0].team_id).toBe(teams[2].id);
  });

  it('createNamedMatchTeams is idempotent and assignment/resolution check ownership', async () => {
    const mode = await createGameMode(gameId, { scoring_type: 'Normal' });
    const m = await createMatch(gameId, mode.id, { id: 'named' });
    const other = await createMatch(gameId, mode.id, { id: 'other' });
    const ids1 = await createNamedMatchTeams(db, m.id, [{ name: 'Alpha', color: '#fff' }, { name: 'Beta' }]);
    const ids2 = await createNamedMatchTeams(db, m.id, [{ name: 'Ignored' }, { name: 'Ignored' }]);
    expect(ids2).toEqual(ids1);
    expect((await getMatchTeams(db, m.id)).map((t) => t.team_name)).toEqual(['Alpha', 'Beta']);

    const [p] = await join(m.id, 1);
    await assignParticipantToTeam(db, m.id, p, 'blue');
    expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.id, p)))[0].team_id).toBe(ids1[0]);
    await expect(assignParticipantToTeam(db, m.id, p, 'reserve')).rejects.toBeInstanceOf(TeamAssignmentError);
    await expect(assignParticipantToTeam(db, m.id, 'ghost', ids1[1])).rejects.toThrow(/Participant/);
    await expect(resolveMatchTeam(db, other.id, ids1[0])).rejects.toThrow(/does not belong/);
    await expect(setTeamVoiceChannel(db, ids1[0], 'vc', other.id)).rejects.toBeInstanceOf(TeamAssignmentError);
    await setTeamVoiceChannel(db, ids1[0], 'vc', m.id);
    expect((await getMatchTeams(db, m.id))[0].voice_channel_id).toBe('vc');
  });
});

describe('participants', () => {
  it('adds, rejects duplicates and full matches, removes by user and lists DM recipients with their side', async () => {
    const mode = await createGameMode(gameId);
    const m = await createMatch(gameId, mode.id, { id: 'pp' });
    const input = (userId: string) => ({ matchId: m.id, userId, discordUserId: userId, username: userId.toUpperCase(), signupData: { a: 1 }, avatarUrl: 'url' });
    expect((await addParticipant(db, input('a'), { capacity: 2 })).status).toBe('added');
    expect((await addParticipant(db, input('a'), { capacity: 2 })).status).toBe('duplicate');
    expect((await addParticipant(db, input('b'), { capacity: 2 })).status).toBe('added');
    expect((await addParticipant(db, input('c'), { capacity: 2 })).status).toBe('full');
    expect((await addParticipant(db, input('c'))).status).toBe('added');
    expect(await removeParticipantByUser(db, m.id, 'c')).toBe(true);
    expect(await removeParticipantByUser(db, m.id, 'c')).toBe(false);

    await createMatchTeams(db, m.id);
    const [blue] = await getMatchTeams(db, m.id);
    await pg().update(matchParticipants).set({ team_id: blue.id, receives_map_codes: true }).where(eq(matchParticipants.user_id, 'a'));
    const all = await listDmRecipients(db, m.id);
    expect(all.map((r) => [r.username, r.team_assignment])).toEqual([['A', 'blue'], ['B', undefined]]);
    expect((await listDmRecipients(db, m.id, { commandersOnly: true })).map((r) => r.username)).toEqual(['A']);
    expect(all[0].signup_data).toEqual({ a: 1 });
  });
});

describe('match games', () => {
  it('initialises idempotently, validates lazily-created game ids and reports completion', async () => {
    const mode = await createGameMode(gameId);
    const m = await createMatch(gameId, mode.id, { id: 'g', maps: ['x', 'y'] });
    await initializeMatchGames(db, m.id);
    await initializeMatchGames(db, m.id);
    expect((await pg().select().from(matchGames).where(eq(matchGames.match_id, m.id)).orderBy(asc(matchGames.round))).map((g) => g.id)).toEqual(['g_game_1', 'g_game_2']);
    expect(await areAllGamesCompleted(db, m.id)).toBe(false);
    await expect(ensureMatchGameExists(db, 'g_game_9', m.id)).resolves.toBeUndefined();
    expect((await pg().select().from(matchGames).where(eq(matchGames.id, 'g_game_9')))[0].map_id).toBeNull();
    await expect(ensureMatchGameExists(db, 'random', m.id)).rejects.toThrow(/not found/);
    await expect(ensureMatchGameExists(db, 'g_game_1', 'other')).rejects.toThrow(/does not belong/);
    await expect(ensureMatchGameExists(db, 'nomatch_game_1', 'nomatch')).rejects.toThrow(/Match nomatch not found/);
    expect(await areAllGamesCompleted(db, 'empty')).toBe(false);
  });

  it('releaseHeldScoreNotification queues the held notification once for stats-enabled matches', async () => {
    const mode = await createGameMode(gameId, { scoring_type: 'Normal' });
    const m = await createMatch(gameId, mode.id, { id: 'held', status: 'battle', stats_enabled: true, maps: ['m1', 'm2'] });
    await createMatchTeams(db, m.id);
    await initializeMatchGames(db, m.id);
    const [blue] = await getMatchTeams(db, m.id);
    await saveMatchResult(db, 'held_game_1', { matchId: m.id, gameId: 'held_game_1', winner: 'team1', winnerTeamId: blue.id, completedAt: new Date() });
    expect(await pg().select().from(discordScoreNotificationQueue)).toHaveLength(0); // held
    expect(await releaseHeldScoreNotification(db, 'held_game_1')).toBe(true);
    expect(await releaseHeldScoreNotification(db, 'held_game_1')).toBe(false);
    expect(await pg().select().from(discordScoreNotificationQueue)).toHaveLength(1);
    expect(await releaseHeldScoreNotification(db, 'nope')).toBe(false);
  });
});

describe('map codes', () => {
  it('queues the first map code, matching instance ids, names and diacritics', async () => {
    await pg().update(games).set({ map_codes_supported: true }).where(eq(games.id, gameId));
    const mode = await createGameMode(gameId);
    await pg().insert(gameMaps).values({ id: 'hanamura', game_id: gameId, name: 'Hanamura' });
    const m = await createMatch(gameId, mode.id, { id: 'mc', maps: ['hanamura-1776547135395-abc'], map_codes: { 'hanamura-1776547135395-abc': 'CODE' } });
    expect(await MapCodeService.processFirstMapCode(db, m.id)).toBe(true);
    expect((await pg().select().from(discordMapCodeQueue))[0]).toMatchObject({ map_name: 'Hanamura', map_code: 'CODE' });
    expect(MapCodeService.findMapCode('Pátio', { PATIO: 'x' })).toBe('x');
    expect(MapCodeService.findMapCode('nothing', { a: 'b' })).toBeNull();
    expect(await MapCodeService.processMapCode(db, m.id, gameId, 'hanamura-1-x', {})).toBe(false);

    const none = await createMatch(gameId, mode.id, { id: 'mc2', maps: ['hanamura'] });
    expect(await MapCodeService.processFirstMapCode(db, none.id)).toBe(false);
    await pg().update(games).set({ map_codes_supported: false }).where(eq(games.id, gameId));
    expect(await MapCodeService.processFirstMapCode(db, m.id)).toBe(false);
    expect(await MapCodeService.processFirstMapCode(db, 'missing')).toBe(false);
  });
});

describe('voice channels', () => {
  async function answerBot(result: Record<string, unknown> | null, status: 'completed' | 'failed' = 'completed') {
    // plays the Discord bot: answers the first voice_channel_create request that shows up
    for (let i = 0; i < 100; i++) {
      const [req] = await pg().select().from(discordBotRequests).where(eq(discordBotRequests.type, 'voice_channel_create'));
      if (req) { await pg().update(discordBotRequests).set({ status, result }).where(eq(discordBotRequests.id, req.id)); return req; }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('no bot request appeared');
  }

  it('skips creation without a category, then creates, records and tracks channels via the bot', async () => {
    const mode = await createGameMode(gameId, { scoring_type: 'Normal' });
    const m = await createMatch(gameId, mode.id, { id: 'vc', name: 'Final' });
    await createMatchTeams(db, m.id);
    expect(await createMatchVoiceChannels(m.id)).toMatchObject({ success: true, message: expect.stringMatching(/not configured/) });
    expect(await VoiceChannelService.setupMatchVoiceChannels(m.id)).toBe(false);

    await pg().insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't', voice_channel_category_id: 'cat' });
    const [, req] = await Promise.all([
      VoiceChannelService.setupMatchVoiceChannels(m.id).then((ok) => expect(ok).toBe(true)),
      answerBot({ success: true, blueChannelId: 'vc-b', redChannelId: 'vc-r', channelIds: ['vc-b', 'vc-r'] }),
    ]);
    expect((req.data as any).channelNames).toEqual(['Final - Blue Team', 'Final - Red Team']);
    expect((await getMatchTeams(db, m.id)).map((t) => t.voice_channel_id)).toEqual(['vc-b', 'vc-r', null]);
    expect((await pg().select().from(autoVoiceChannels)).map((c) => c.team_name).sort()).toEqual(['blue', 'red']);

    await deleteMatchVoiceChannels(db, m.id);
    expect(await pg().select().from(autoVoiceChannels)).toHaveLength(0);
    expect((await pg().select().from(discordBotRequests).where(eq(discordBotRequests.type, 'voice_channel_delete'))).map((r) => (r.data as any).channelId).sort()).toEqual(['vc-b', 'vc-r']);
    expect(await deleteMatchVoiceChannels(db, m.id)).toBe(true);
  });

  it('reports bot failures and names FFA lobbies / single-team / 3+ team channels correctly', async () => {
    await pg().insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't', voice_channel_category_id: 'cat' });
    const ffa = await createGameMode(gameId, { scoring_type: 'FFA' });
    const m = await createMatch(gameId, ffa.id, { id: 'lobby', name: 'Race' });
    const [res, req] = await Promise.all([createMatchVoiceChannels(m.id), answerBot({ success: false, message: 'nope' }, 'failed')]);
    expect(res).toEqual({ success: false, message: 'nope' });
    expect((req.data as any).channelNames).toEqual(['Race']);
    expect(await createMatchVoiceChannels('ghost')).toEqual({ success: false, message: 'Match not found' });
  });

  it('queues voice announcements from team channels, falling back to the global channels, alternating the first team', async () => {
    const mode = await createGameMode(gameId, { scoring_type: 'Normal' });
    const m = await createMatch(gameId, mode.id, { id: 'va' });
    expect(await VoiceChannelService.queueVoiceAnnouncement(db, 'ghost', 'welcome')).toBe(false);
    expect(await VoiceChannelService.queueVoiceAnnouncement(db, m.id, 'welcome')).toBe(true); // nothing configured: no row
    expect(await pg().select().from(discordVoiceAnnouncementQueue)).toHaveLength(0);

    await pg().insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't' });
    await pg().insert(discordChannels).values([
      { id: 'gb', guild_id: 'g', discord_channel_id: 'global-blue', name: 'blue', channel_name: 'blue', type: 2, channel_type: 'voice' },
      { id: 'gr', guild_id: 'g', discord_channel_id: 'global-red', name: 'red', channel_name: 'red', type: 2, channel_type: 'voice' },
    ]);
    await VoiceChannelService.queueVoiceAnnouncement(db, m.id, 'welcome');
    expect((await pg().select().from(discordVoiceAnnouncementQueue))[0]).toMatchObject({ blue_team_voice_channel: 'global-blue', red_team_voice_channel: 'global-red', first_team: 'blue' });

    expect(await nextFirstTeam(db, m.id)).toBe('blue');
    await recordFirstTeam(db, m.id, 'blue');
    expect(await nextFirstTeam(db, m.id)).toBe('red');
    await recordFirstTeam(db, m.id, 'red');
    expect(await getLastFirstTeam(db, m.id)).toBe('red');
    expect(await nextFirstTeam(db, m.id)).toBe('blue');
    expect(await pg().select().from(matchVoiceAlternation)).toHaveLength(1);

    await trackVoiceChannels(db, m.id, 'only');
    expect((await pg().select().from(autoVoiceChannels))[0].team_name).toBe('all');
    await trackVoiceChannels(db, m.id, 'b', 'r', ['t3']);
    expect((await pg().select().from(autoVoiceChannels)).map((c) => c.team_name).sort()).toEqual(['all', 'blue', 'red', 'team3']);
  });
});

describe('winner votes', () => {
  async function votingMatch() {
    const mode = await createGameMode(gameId, { scoring_type: 'Normal' });
    const m = await createMatch(gameId, mode.id, { id: 'vote', status: 'battle', maps: ['m1'] });
    await createMatchTeams(db, m.id);
    const teams = await getMatchTeams(db, m.id);
    const [a, b] = await join(m.id, 2);
    await pg().update(matchParticipants).set({ team_id: teams[0].id, receives_map_codes: true }).where(eq(matchParticipants.id, a));
    await pg().update(matchParticipants).set({ team_id: teams[1].id, receives_map_codes: true }).where(eq(matchParticipants.id, b));
    await initializeMatchGames(db, m.id);
    return { matchId: m.id, gameId: 'vote_game_1', teams, players: [a, b] };
  }

  it('lists commanders with their side, records prompts, counts only the first vote', async () => {
    const v = await votingMatch();
    const commanders = await listVoteCommanders(db, v.matchId);
    expect(commanders.map((c) => c.team_side)).toEqual(['blue', 'red']);
    await recordVotePrompt(db, { matchId: v.matchId, matchGameId: v.gameId, discordUserId: 'd0', discordMessageId: 'm0', participantId: v.players[0], teamSide: 'blue' });
    const row = (await findVoteByMessage(db, 'm0', 'd0'))!;
    expect(await castVote(db, row.id, 'blue')).toBe(true);
    expect(await castVote(db, row.id, 'red')).toBe(false);
    expect((await listVotesForGame(db, v.gameId))[0].voted_for).toBe('blue');
    expect(await findVoteByMessage(db, 'm0', 'someone-else')).toBeUndefined();
  });

  it('scores the consensus once, ignoring finished games and matches outside battle', async () => {
    const v = await votingMatch();
    expect(await submitVoteWinner(v.matchId, v.gameId, 'red')).toBe(true);
    const placements = await pg().select().from(discordWinnerVoteMessages);
    expect(placements).toHaveLength(0);
    expect((await pg().select().from(matches).where(eq(matches.id, v.matchId)))[0]).toMatchObject({ status: 'complete', winner_team: v.teams[1].id });
    expect(await submitVoteWinner(v.matchId, v.gameId, 'blue')).toBe(false); // already scored / complete
    expect(await submitVoteWinner(v.matchId, 'ghost', 'blue')).toBe(false);
  });

  it('holds the vote while a required scorecard is missing', async () => {
    const v = await votingMatch();
    expect(await isScorecardRequiredButMissing(db, v.matchId, v.gameId)).toBe(false); // stats disabled on the match
    await pg().update(matches).set({ stats_enabled: true }).where(eq(matches.id, v.matchId));
    expect(await isScorecardRequiredButMissing(db, v.matchId, v.gameId)).toBe(false); // the game has no stat definitions
    const { gameStatDefinitions } = await import('../../../lib/db/schema');
    await pg().insert(gameStatDefinitions).values({ id: 'sd', game_id: gameId, name: 'kills', display_name: 'Kills', stat_type: 'number' } as never);
    expect(await isScorecardRequiredButMissing(db, v.matchId, v.gameId)).toBe(true);
    await pg().insert(scorecardSubmissions).values({ id: 'sc', match_id: v.matchId, match_game_id: v.gameId, team_side: 'blue', screenshot_url: '/x' });
    expect(await isScorecardRequiredButMissing(db, v.matchId, v.gameId)).toBe(false);
    void statsSettings;
  });
});

describe('scheduler queries and avatars', () => {
  it('finds matches due to start, stale battles and upcoming matches; compare-and-set moves each once', async () => {
    const mode = await createGameMode(gameId);
    const past = new Date(Date.now() - 3600_000);
    const future = new Date(Date.now() + 3600_000);
    await createMatch(gameId, mode.id, { id: 'due', status: 'assign', start_date: past, start_time: past });
    await createMatch(gameId, mode.id, { id: 'later', status: 'assign', start_date: future, start_time: future });
    await createMatch(gameId, mode.id, { id: 'stale', status: 'battle', updated_at: new Date(Date.now() - 48 * 3600_000) });
    await createMatch(gameId, mode.id, { id: 'fresh', status: 'battle' });
    expect((await listMatchesDueToStart(db, new Date())).map((x) => x.id)).toEqual(['due']);
    expect((await listStaleBattleMatches(db, new Date(Date.now() - 24 * 3600_000))).map((x) => x.id)).toEqual(['stale']);
    expect((await listUpcomingMatches(db, new Date())).map((x) => x.id)).toEqual(['later']);
    expect(await casMatchStatus(db, 'due', 'assign', 'battle')).toBe(true);
    expect(await casMatchStatus(db, 'due', 'assign', 'battle')).toBe(false);
  });

  it('refreshes avatars for active matches only and stops after three failures', async () => {
    const mode = await createGameMode(gameId);
    const live = await createMatch(gameId, mode.id, { id: 'live', status: 'gather' });
    const done = await createMatch(gameId, mode.id, { id: 'done', status: 'complete' });
    await pg().insert(matchParticipants).values([
      { id: 'a', match_id: live.id, user_id: 'a', discord_user_id: 'da', username: 'A' },
      { id: 'b', match_id: live.id, user_id: 'b', discord_user_id: 'db', username: 'B', failed_avatar_checks: 3 },
      { id: 'c', match_id: done.id, user_id: 'c', discord_user_id: 'dc', username: 'C' },
      { id: 'd', match_id: live.id, user_id: 'd', username: 'D' },
    ]);
    expect(await listAvatarRefreshUsers(db)).toEqual(['da']);
    expect(await countAvatarUsersSkipped(db)).toBe(1);
    await incrementAvatarFailures(db, 'da');
    expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.id, 'a')))[0].failed_avatar_checks).toBe(1);
    await recordAvatarRefreshed(db, 'da', 'https://cdn/x.png');
    expect((await pg().select().from(matchParticipants).where(eq(matchParticipants.id, 'a')))[0]).toMatchObject({ avatar_url: 'https://cdn/x.png', failed_avatar_checks: 0 });
  });

  it('queues status updates for every match of a tournament', async () => {
    const mode = await createGameMode(gameId);
    const t = await createTournament(gameId);
    await createMatch(gameId, mode.id, { id: 't1', tournament_id: t.id });
    await createMatch(gameId, mode.id, { id: 't2', tournament_id: t.id });
    await createMatch(gameId, mode.id, { id: 'solo' });
    await handleTournamentAssignTransition(db, t.id);
    await handleTournamentAssignTransition(db, 'empty-tournament');
    expect((await pg().select().from(discordStatusUpdateQueue)).map((r) => r.match_id).sort()).toEqual(['t1', 't2']);
  });
});
