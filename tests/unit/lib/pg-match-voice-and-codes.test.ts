// @vitest-environment node
/**
 * Map codes and voice channels on Postgres (ported from the old map-code-service, voice-channel-manager and
 * voice-channel-service suites).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, desc, eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode, createMatch } from '../../utils/pg-fixtures';
import {
  autoVoiceChannels, discordBotRequests, discordMapCodeQueue, discordSettings, discordVoiceAnnouncementQueue, gameMaps, games, matchTeams,
} from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import {
  MapCodeService, VoiceChannelService, createMatchTeams, createMatchVoiceChannels, deleteMatchVoiceChannels, trackVoiceChannels,
} from '@/lib/matches';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), debug: vi.fn(), reload: vi.fn() } }));
vi.mock('@/lib/feed-helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/feed-helpers')>()), logFeedEvent: vi.fn(), deleteFeedEvents: vi.fn() }));

setupPgTestFile();
const pg = () => getPgTestDb();

let gameId: string;
let modeId: string;
beforeEach(async () => {
  gameId = (await createGame()).id;
  modeId = (await createGameMode(gameId)).id;
});

const enableCodes = (supported = true) => pg().update(games).set({ map_codes_supported: supported }).where(eq(games.id, gameId));
const queued = (matchId: string) => pg().select().from(discordMapCodeQueue).where(eq(discordMapCodeQueue.match_id, matchId)).orderBy(desc(discordMapCodeQueue.created_at));

describe('MapCodeService.processFirstMapCode', () => {
  it('returns false when the game does not support map codes', async () => {
    const m = await createMatch(gameId, modeId, { maps: ['hanamura'], map_codes: { hanamura: 'ABC123' } });
    expect(await MapCodeService.processFirstMapCode(db, m.id)).toBe(false);
    expect(await queued(m.id)).toHaveLength(0);
  });

  it('returns false for a nonexistent match', async () => {
    expect(await MapCodeService.processFirstMapCode(db, 'nonexistent-match')).toBe(false);
  });

  it('returns false when no maps are configured (none or an empty list)', async () => {
    await enableCodes();
    const none = await createMatch(gameId, modeId);
    const empty = await createMatch(gameId, modeId, { maps: [] });
    expect(await MapCodeService.processFirstMapCode(db, none.id)).toBe(false);
    expect(await MapCodeService.processFirstMapCode(db, empty.id)).toBe(false);
  });

  it('returns false when there is no map code for the first map, or map_codes is empty', async () => {
    await enableCodes();
    const noCodes = await createMatch(gameId, modeId, { maps: ['map-1'] });
    expect(await MapCodeService.processFirstMapCode(db, noCodes.id)).toBe(false);
    const nullCodes = await createMatch(gameId, modeId, { maps: ['hanamura'], map_codes: null });
    expect(await MapCodeService.processFirstMapCode(db, nullCodes.id)).toBe(false);
    expect(await queued(nullCodes.id)).toHaveLength(0);
  });

  it('queues the code when the match has maps and codes', async () => {
    await enableCodes();
    const m = await createMatch(gameId, modeId, { maps: ['hanamura'], map_codes: { hanamura: 'ABC123' } });
    expect(await MapCodeService.processFirstMapCode(db, m.id)).toBe(true);
    expect((await queued(m.id))[0]).toMatchObject({ map_code: 'ABC123', status: 'pending' });
  });

  it('only queues the code of the first map even when more maps have codes', async () => {
    await enableCodes();
    const m = await createMatch(gameId, modeId, {
      maps: ['map-one', 'map-two', 'map-three'], map_codes: { 'map-one': 'CODE1', 'map-two': 'CODE2', 'map-three': 'CODE3' },
    });
    await MapCodeService.processFirstMapCode(db, m.id);
    const rows = await queued(m.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].map_code).toBe('CODE1');
  });

  it('is not idempotent: calling twice queues two rows', async () => {
    await enableCodes();
    const m = await createMatch(gameId, modeId, { maps: ['hanamura'], map_codes: { hanamura: 'DUP_CODE' } });
    await MapCodeService.processFirstMapCode(db, m.id);
    await MapCodeService.processFirstMapCode(db, m.id);
    expect(await queued(m.id)).toHaveLength(2);
  });
});

describe('MapCodeService.processMapCode', () => {
  it('returns false when there is no code for the map', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await MapCodeService.processMapCode(db, m.id, gameId, 'unknown-map', {})).toBe(false);
    expect(await MapCodeService.processMapCode(db, m.id, gameId, 'hanamura', { 'other-map': 'CODE99' })).toBe(false);
    expect(await queued(m.id)).toHaveLength(0);
  });

  it('queues a pending row with the match, code and status', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await MapCodeService.processMapCode(db, m.id, gameId, 'hanamura', { hanamura: 'TESTCODE' })).toBe(true);
    expect((await queued(m.id))[0]).toMatchObject({ match_id: m.id, map_code: 'TESTCODE', status: 'pending' });
  });

  it('stores the map display name, falling back to the id when the map is unknown', async () => {
    const m = await createMatch(gameId, modeId);
    await pg().insert(gameMaps).values({ id: 'hanamura', game_id: gameId, mode_id: modeId, name: 'Hanamura' });
    await MapCodeService.processMapCode(db, m.id, gameId, 'hanamura', { hanamura: 'CODE42' });
    await MapCodeService.processMapCode(db, m.id, gameId, 'obscure-map', { 'obscure-map': 'FALLBACK' });
    const names = (await queued(m.id)).map((r) => [r.map_name, r.map_code]).sort();
    expect(names).toEqual([['Hanamura', 'CODE42'], ['obscure-map', 'FALLBACK']]);
  });

  it('stores special characters, spaces and emoji verbatim', async () => {
    const m = await createMatch(gameId, modeId);
    const codes = { 'blizzard-world': 'CODE-123/ABC!@#', eichenwalde: 'MY CODE 999', hanamura: '🎮 EMOJICODE123' };
    for (const mapId of Object.keys(codes)) expect(await MapCodeService.processMapCode(db, m.id, gameId, mapId, codes)).toBe(true);
    expect((await queued(m.id)).map((r) => r.map_code).sort()).toEqual(['CODE-123/ABC!@#', 'MY CODE 999', '🎮 EMOJICODE123'].sort());
  });

  it('looks the code up by the full instance id, and the name by the id without its suffix', async () => {
    const m = await createMatch(gameId, modeId);
    await pg().insert(gameMaps).values({ id: 'hanamura', game_id: gameId, mode_id: modeId, name: 'Hanamura' });
    const instance = 'hanamura-1776547135395-lsqxspqvk';
    expect(await MapCodeService.processMapCode(db, m.id, gameId, instance, { [instance]: 'CODE99' })).toBe(true);
    expect((await queued(m.id))[0]).toMatchObject({ map_code: 'CODE99', map_name: 'Hanamura' });
    // a code keyed by the base name does not match a full instance id
    expect(await MapCodeService.processMapCode(db, m.id, gameId, instance, { hanamura: 'WRONG' })).toBe(false);
    expect(await MapCodeService.processMapCode(db, m.id, gameId, instance, { [instance]: '🎮 EMOJICODE' })).toBe(true);
  });

  it('matches keys regardless of casing and diacritics', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await MapCodeService.processMapCode(db, m.id, gameId, 'hanamura', { Hanamura: 'UPPER_CODE' })).toBe(true);
    expect(await MapCodeService.processMapCode(db, m.id, gameId, 'king-of-the-hill', { 'KING-OF-THE-HILL': 'KOTH_CODE' })).toBe(true);
    expect(await MapCodeService.processMapCode(db, m.id, gameId, 'anubis', { Ánubis: 'DIAC_CODE' })).toBe(true);
    expect(await queued(m.id)).toHaveLength(3);
  });

  it('findMapCode prefers the exact key and returns null without a match', () => {
    expect(MapCodeService.findMapCode('a', { a: '1', A: '2' })).toBe('1');
    expect(MapCodeService.findMapCode('A', { a: '1' })).toBe('1');
    expect(MapCodeService.findMapCode('b', { a: '1' })).toBeNull();
  });
});

describe('createMatchVoiceChannels', () => {
  const category = (v: string | null = 'cat123') => pg().insert(discordSettings).values({ id: 1, guild_id: 'guild1', bot_token: 'token1', voice_channel_category_id: v });

  it('succeeds without doing anything when no settings row or no category exists', async () => {
    expect(await createMatchVoiceChannels('match_nonexistent')).toMatchObject({ success: true, message: expect.stringMatching(/not configured/i) });
    await category(null);
    expect(await createMatchVoiceChannels('any-match')).toMatchObject({ success: true, message: expect.stringMatching(/not configured/i) });
    expect(await pg().select().from(discordBotRequests)).toHaveLength(0);
  });

  it('fails when the category is set but the match does not exist', async () => {
    await category();
    const res = await createMatchVoiceChannels('nonexistent_match');
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not found/i);
  });

  it('queues a voice_channel_create bot request for the match', async () => {
    await category();
    const m = await createMatch(gameId, modeId);
    void createMatchVoiceChannels(m.id); // polls for the bot's answer (up to 30s): only the queued request is checked
    await vi.waitFor(async () => {
      const rows = (await pg().select().from(discordBotRequests).where(eq(discordBotRequests.type, 'voice_channel_create')))
        .filter((r) => (r.data as { matchId?: string }).matchId === m.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].data).toMatchObject({ categoryId: 'cat123' });
    }, { timeout: 3000 });
  }, 10000);
});

describe('deleteMatchVoiceChannels', () => {
  it('returns true when there is nothing to delete (no channels, unknown match)', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await deleteMatchVoiceChannels(db, m.id)).toBe(true);
    expect(await deleteMatchVoiceChannels(db, 'nonexistent-match-999')).toBe(true);
    expect(await pg().select().from(discordBotRequests)).toHaveLength(0);
  });

  it('queues one deletion request per tracked channel and removes the tracking rows', async () => {
    const m = await createMatch(gameId, modeId);
    await pg().insert(autoVoiceChannels).values([
      { id: 'av-a', match_id: m.id, channel_id: 'ch_a', team_name: 'blue' },
      { id: 'av-b', match_id: m.id, channel_id: 'ch_b', team_name: 'red' },
      { id: 'av-c', match_id: m.id, channel_id: 'ch_c', team_name: 'spectator' },
    ]);
    expect(await deleteMatchVoiceChannels(db, m.id)).toBe(true);
    const reqs = await pg().select().from(discordBotRequests).where(eq(discordBotRequests.type, 'voice_channel_delete'));
    expect(reqs.map((r) => (r.data as { channelId: string }).channelId).sort()).toEqual(['ch_a', 'ch_b', 'ch_c']);
    expect(await pg().select().from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, m.id))).toHaveLength(0);
  });

  it('is idempotent: the second call queues nothing more', async () => {
    const m = await createMatch(gameId, modeId);
    await pg().insert(autoVoiceChannels).values({ id: 'av-idem', match_id: m.id, channel_id: 'ch_idem', team_name: 'blue' });
    expect(await deleteMatchVoiceChannels(db, m.id)).toBe(true);
    expect(await deleteMatchVoiceChannels(db, m.id)).toBe(true);
    expect(await pg().select().from(discordBotRequests)).toHaveLength(1);
  });
});

describe('trackVoiceChannels', () => {
  const tracked = (matchId: string) => pg().select().from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, matchId)).orderBy(asc(autoVoiceChannels.team_name));

  it('tracks blue and red for a dual-team match with the right channel ids', async () => {
    const m = await createMatch(gameId, modeId);
    await trackVoiceChannels(db, m.id, 'blue_ch_999', 'red_ch_888');
    expect((await tracked(m.id)).map((r) => [r.team_name, r.channel_id])).toEqual([['blue', 'blue_ch_999'], ['red', 'red_ch_888']]);
  });

  it('tracks a single "all" channel for a single-team match', async () => {
    const m = await createMatch(gameId, modeId);
    await trackVoiceChannels(db, m.id, 'ch_all');
    expect((await tracked(m.id)).map((r) => [r.team_name, r.channel_id])).toEqual([['all', 'ch_all']]);
  });

  it('numbers channels beyond the first two from team3', async () => {
    const m = await createMatch(gameId, modeId);
    await trackVoiceChannels(db, m.id, 'b', 'r', ['t3', 't4']);
    expect((await tracked(m.id)).map((r) => r.team_name)).toEqual(['blue', 'red', 'team3', 'team4']);
  });
});

describe('VoiceChannelService.setupMatchVoiceChannels', () => {
  it('returns false when the channels cannot be created', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await VoiceChannelService.setupMatchVoiceChannels(m.id)).toBe(false);
  });

  it('points the first two teams at the created channels and tracks them', async () => {
    await pg().insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't', voice_channel_category_id: 'cat' });
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id);
    const done = VoiceChannelService.setupMatchVoiceChannels(m.id);
    for (let i = 0; i < 100; i++) { // plays the bot
      const [req] = await pg().select().from(discordBotRequests).where(eq(discordBotRequests.type, 'voice_channel_create'));
      if (req) {
        await pg().update(discordBotRequests).set({ status: 'completed', result: { success: true, blueChannelId: 'vc-blue-123', redChannelId: 'vc-red-456' } }).where(eq(discordBotRequests.id, req.id));
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(await done).toBe(true);
    const teams = await pg().select().from(matchTeams).where(eq(matchTeams.match_id, m.id)).orderBy(asc(matchTeams.team_order));
    expect(teams.map((t) => t.voice_channel_id)).toEqual(['vc-blue-123', 'vc-red-456', null]);
    expect((await pg().select().from(autoVoiceChannels)).map((c) => c.team_name).sort()).toEqual(['blue', 'red']);
  });
});

describe('VoiceChannelService.queueVoiceAnnouncement', () => {
  const voiceQueue = (matchId: string) => pg().select().from(discordVoiceAnnouncementQueue).where(eq(discordVoiceAnnouncementQueue.match_id, matchId)).orderBy(asc(discordVoiceAnnouncementQueue.created_at));
  async function matchWithChannels() {
    const m = await createMatch(gameId, modeId);
    await createMatchTeams(db, m.id);
    const teams = await pg().select().from(matchTeams).where(eq(matchTeams.match_id, m.id)).orderBy(asc(matchTeams.team_order));
    await pg().update(matchTeams).set({ voice_channel_id: 'vc-blue' }).where(eq(matchTeams.id, teams[0].id));
    await pg().update(matchTeams).set({ voice_channel_id: 'vc-red' }).where(eq(matchTeams.id, teams[1].id));
    return m;
  }

  it('returns false for a nonexistent match', async () => {
    expect(await VoiceChannelService.queueVoiceAnnouncement(db, 'nonexistent', 'welcome')).toBe(false);
  });

  it('returns true without queueing anything when no voice channels are configured', async () => {
    const m = await createMatch(gameId, modeId);
    expect(await VoiceChannelService.queueVoiceAnnouncement(db, m.id, 'welcome')).toBe(true);
    expect(await voiceQueue(m.id)).toHaveLength(0);
  });

  it('queues a pending announcement when the teams have voice channels', async () => {
    const m = await matchWithChannels();
    expect(await VoiceChannelService.queueVoiceAnnouncement(db, m.id, 'welcome')).toBe(true);
    const rows = await voiceQueue(m.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ announcement_type: 'welcome', status: 'pending', blue_team_voice_channel: 'vc-blue', red_team_voice_channel: 'vc-red' });
  });

  it('starts with blue when nothing was announced before', async () => {
    const m = await matchWithChannels();
    await VoiceChannelService.queueVoiceAnnouncement(db, m.id, 'welcome');
    expect((await voiceQueue(m.id))[0].first_team).toBe('blue');
  });

  it('handles nextround and finish announcement types', async () => {
    const m = await matchWithChannels();
    for (const type of ['nextround', 'finish'] as const) expect(await VoiceChannelService.queueVoiceAnnouncement(db, m.id, type)).toBe(true);
    expect((await voiceQueue(m.id)).map((r) => r.announcement_type).sort()).toEqual(['finish', 'nextround']);
  });
});
