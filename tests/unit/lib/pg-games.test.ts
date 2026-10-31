// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createGame, createGameMode } from '../../utils/pg-fixtures';
import { discordChannels, discordSettings, gameMaps, gameStatDefinitions } from '../../../lib/db/schema';
import {
  countStatDefinitions, escapeLike, findMapByIdOrName, findMapByIdPattern, gameExists, gameSupportsMapCodes, getGameAiNotes,
  getGameDisplay, getGameMaxSignups, getGameScoringConfig, getMap, getMapModeScoringType, getMapNameById, getMode, getModeById,
  getModeScoringType, getModeScoringTypeAndMaxTeams, listGames, listMapsForModes, listMapsWithModeScoring, listModes,
  listModesByTeamSize, listNonWorkshopModes,
} from '../../../src/lib/games';
import {
  channelExistsByDiscordId, createChannel, findGlobalVoiceChannelId, getChannel, listChannels, listChannelsForNotification,
  setChannelName, toChannelDto, updateChannelFlags,
} from '../../../src/lib/discord-channels';

setupPgTestFile();
const db = () => getPgTestDb();

async function addMap(gameId: string, modeId: string | null, id: string, name: string) {
  await db().insert(gameMaps).values({ id, game_id: gameId, mode_id: modeId, name });
}

describe('games module: games', () => {
  it('reads display data, flags and limits', async () => {
    const game = await createGame({
      name: 'Kart', color: '#112233', icon_url: '/i.png', max_signups: 16, map_codes_supported: true, ai_screenshot_notes: 'notes',
      scoring_config: { type: 'Position', pointsPerPosition: { '1': 10 } } as never,
    });
    expect(await gameExists(db(), game.id)).toBe(true);
    expect(await gameExists(db(), 'nope')).toBe(false);
    expect(await getGameDisplay(db(), game.id)).toEqual({ name: 'Kart', color: '#112233', icon_url: '/i.png' });
    expect(await getGameDisplay(db(), 'nope')).toBeUndefined();
    expect(await getGameMaxSignups(db(), game.id)).toBe(16);
    expect(await getGameMaxSignups(db(), 'nope')).toBeUndefined();
    expect(await gameSupportsMapCodes(db(), game.id)).toBe(true);
    expect(await gameSupportsMapCodes(db(), 'nope')).toBe(false);
    expect(await getGameAiNotes(db(), game.id)).toEqual({ name: 'Kart', ai_screenshot_notes: 'notes' });
    expect(await getGameScoringConfig(db(), game.id)).toEqual({ type: 'Position', pointsPerPosition: { '1': 10 } });
    expect((await listGames(db())).map((g) => g.id)).toEqual([game.id]);
  });
});

describe('games module: modes', () => {
  it('looks modes up by game+id, by id alone, and reads scoring info', async () => {
    const game = await createGame();
    const mode = await createGameMode(game.id, { id: 'm1', scoring_type: 'Position', max_teams: 4 });
    expect((await getMode(db(), game.id, 'm1'))?.name).toBe(mode.name);
    expect(await getMode(db(), 'other', 'm1')).toBeUndefined();
    expect((await getModeById(db(), 'm1'))?.game_id).toBe(game.id);
    expect(await getModeScoringType(db(), game.id, 'm1')).toBe('Position');
    expect(await getModeScoringTypeAndMaxTeams(db(), game.id, 'm1')).toEqual({ max_teams: 4, scoring_type: 'Position' });
    expect(await getModeScoringTypeAndMaxTeams(db(), game.id, 'zz')).toBeUndefined();
    expect((await listModes(db(), game.id)).map((m) => m.id)).toEqual(['m1']);
  });

  it('filters workshop/custom modes and matches NULL team sizes to each other', async () => {
    const game = await createGame();
    await createGameMode(game.id, { id: 'q5', team_size: 5 });
    await createGameMode(game.id, { id: 'c5', team_size: 5 });
    await createGameMode(game.id, { id: 'workshop5', team_size: 5 });
    await createGameMode(game.id, { id: 'custom5', team_size: 5 });
    await createGameMode(game.id, { id: 'ffa1', team_size: null, scoring_type: 'FFA' });
    await createGameMode(game.id, { id: 'ffa2', team_size: null, scoring_type: 'FFA' });

    expect((await listModesByTeamSize(db(), game.id, 5)).map((m) => m.id)).toEqual(['c5', 'q5']);
    expect((await listModesByTeamSize(db(), game.id, null)).map((m) => m.id)).toEqual(['ffa1', 'ffa2']);
    expect((await listNonWorkshopModes(db(), game.id)).map((m) => m.id)).toEqual(['c5', 'custom5', 'ffa1', 'ffa2', 'q5']);
  });
});

describe('games module: maps', () => {
  it('finds maps by exact id, then by case-insensitive name contains, preferring exact ids', async () => {
    const game = await createGame();
    const other = await createGame();
    const mode = await createGameMode(game.id, { id: 'ctl', scoring_type: 'Normal' });
    await addMap(game.id, mode.id, 'nepal', 'Nepal Village');
    await addMap(game.id, mode.id, 'oasis', 'Oasis Nepal Annex');
    await addMap(other.id, null, 'nepal', 'Other Nepal');

    expect((await findMapByIdOrName(db(), game.id, 'nepal'))?.name).toBe('Nepal Village'); // id beats the name-contains row
    expect((await findMapByIdOrName(db(), game.id, 'OASIS'))?.id).toBe('oasis'); // ILIKE on name
    expect((await findMapByIdOrName(db(), game.id, 'village'))?.id).toBe('nepal');
    expect(await findMapByIdOrName(db(), game.id, 'zzz')).toBeUndefined();
    expect(await findMapByIdOrName(db(), game.id, '%')).toBeUndefined(); // wildcards are literal
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');

    expect((await getMap(db(), game.id, 'nepal'))?.name).toBe('Nepal Village');
    expect((await getMapNameById(db(), 'oasis'))).toBe('Oasis Nepal Annex');
    expect(await getMapNameById(db(), 'missing')).toBeUndefined();
    expect((await findMapByIdPattern(db(), game.id, 'oas%'))?.id).toBe('oasis');
  });

  it('joins mode scoring types and lists maps for modes', async () => {
    const game = await createGame();
    await createGameMode(game.id, { id: 'race', scoring_type: 'Position' });
    await createGameMode(game.id, { id: 'duel', scoring_type: 'Normal' });
    await addMap(game.id, 'race', 'track', 'Track');
    await addMap(game.id, 'duel', 'arena', 'Arena');
    await addMap(game.id, null, 'free', 'Free');

    const rows = await listMapsWithModeScoring(db(), game.id, ['track', 'arena', 'free', 'nope']);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.mode_scoring_type]))).toEqual({ arena: 'Normal', free: null, track: 'Position' });
    expect(await listMapsWithModeScoring(db(), game.id, [])).toEqual([]);
    expect(await getMapModeScoringType(db(), game.id, 'track')).toBe('Position');
    expect(await getMapModeScoringType(db(), game.id, 'free')).toBeUndefined();
    expect((await listMapsForModes(db(), game.id, ['race', 'duel'])).map((m) => m.id)).toEqual(['arena', 'track']);
    expect(await listMapsForModes(db(), game.id, [])).toEqual([]);
  });
});

describe('games module: stat definitions', () => {
  it('counts definitions per game', async () => {
    const game = await createGame();
    expect(await countStatDefinitions(db(), game.id)).toBe(0);
    await db().insert(gameStatDefinitions).values([
      { id: 'a', game_id: game.id, name: 'a', display_name: 'A' },
      { id: 'b', game_id: game.id, name: 'b', display_name: 'B' },
    ]);
    expect(await countStatDefinitions(db(), game.id)).toBe(2);
  });
});

describe('discord-channels module', () => {
  async function guild() {
    await db().insert(discordSettings).values({ id: 1, guild_id: 'g1', bot_token: 't' });
  }

  it('creates text channels with flags, ignores flags for voice, and detects duplicates', async () => {
    await guild();
    const textId = await createChannel(db(), {
      guild_id: 'g1', discord_channel_id: 'd-text', channel_type: 'text', send_announcements: true, send_reminders: false,
      send_match_start: true, send_signup_updates: false, send_health_alerts: false,
    });
    const voiceId = await createChannel(db(), {
      guild_id: 'g1', discord_channel_id: 'd-voice', channel_type: 'voice', send_announcements: true, send_reminders: true,
      send_match_start: true, send_signup_updates: true, send_health_alerts: true,
    });
    expect(await channelExistsByDiscordId(db(), 'd-text')).toBe(true);
    expect(await channelExistsByDiscordId(db(), 'nope')).toBe(false);

    const text = (await getChannel(db(), textId))!;
    expect(text).toMatchObject({ type: 0, channel_type: 'text', send_announcements: true, send_match_start: true, send_reminders: false });
    const voice = (await getChannel(db(), voiceId))!;
    expect(voice).toMatchObject({ type: 2, channel_type: 'voice', send_announcements: false, send_health_alerts: false });
    expect(toChannelDto(text).created_at).toBe(text.created_at.toISOString());
  });

  it('updates flags / names and selects channels by notification type', async () => {
    await guild();
    const a = await createChannel(db(), { guild_id: 'g1', discord_channel_id: 'a', channel_type: 'text', send_announcements: true, send_reminders: false, send_match_start: false, send_signup_updates: false, send_health_alerts: false });
    const b = await createChannel(db(), { guild_id: 'g1', discord_channel_id: 'b', channel_type: 'text', send_announcements: false, send_reminders: false, send_match_start: false, send_signup_updates: false, send_health_alerts: false });
    expect((await listChannelsForNotification(db(), 'announcements')).map((c) => c.id)).toEqual([a]);
    expect(await listChannelsForNotification(db(), 'health_alerts')).toEqual([]);

    await updateChannelFlags(db(), b, { send_announcements: true, send_reminders: true, send_match_start: false, send_signup_updates: false, send_health_alerts: true });
    expect((await listChannelsForNotification(db(), 'announcements')).map((c) => c.id).sort()).toEqual([a, b].sort());
    expect((await listChannelsForNotification(db(), 'health_alerts')).map((c) => c.id)).toEqual([b]);
    await expect(listChannelsForNotification(db(), 'bogus' as never)).rejects.toThrow('Invalid notification type');

    await setChannelName(db(), a, 'general');
    const row = (await getChannel(db(), a))!;
    expect(row.channel_name).toBe('general');
    expect(row.last_name_refresh).toBeInstanceOf(Date);
    expect((await listChannels(db())).length).toBe(2);
  });

  it('finds global voice channels by team colour or team number (voice type only)', async () => {
    await guild();
    const insert = (id: string, name: string, type: number) => db().insert(discordChannels).values({
      id, guild_id: 'g1', discord_channel_id: `d-${id}`, name, type, channel_type: type === 2 ? 'voice' : 'text',
    });
    await insert('t1', 'Blue chat', 0); // text channel: ignored
    await insert('v1', 'Team 1 Voice', 2);
    await insert('v2', 'RED lounge', 2);
    expect(await findGlobalVoiceChannelId(db(), 'blue')).toBe('d-v1');
    expect(await findGlobalVoiceChannelId(db(), 'red')).toBe('d-v2');
    await db().delete(discordChannels);
    expect(await findGlobalVoiceChannelId(db(), 'blue')).toBeUndefined();
  });
});
