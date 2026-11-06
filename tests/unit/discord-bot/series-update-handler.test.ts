// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile } from '../../utils/pg-test-db';
import {
  createDiscordChannel, createDiscordSettings, createMatch, createTournament, seedBasicTestData,
} from '../../utils/pg-fixtures';
import { createSeriesWithEntrants, insertSeries, insertStage, linkEvent } from '../../utils/pg-series-fixtures';
import { getPgTestDb } from '../../utils/pg-test-db';
import { matchTeams, tournamentTeams } from '../../../lib/db/schema';

vi.mock('../../../src/lib/logger/server', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() } }));
vi.mock('../../../src/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn(), reload: vi.fn() } }));
vi.mock('../../../processes/discord-bot/utils/image-source', () => ({
  loadImage: vi.fn(),
  imageExtension: vi.fn(() => 'png'),
  safePublicPath: vi.fn(),
}));
// Drive the standings table and the champion through controllable stubs of the standings engine
vi.mock('../../../src/lib/series', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSeriesStandingsResponse: vi.fn(),
  getSeriesChampion: vi.fn(),
}));

import {
  SERIES_UPDATE_CHANNEL_TYPE, SeriesUpdateHandler, formatStandingsTable, loadStandingsTable,
} from '../../../processes/discord-bot/modules/series-update-handler';
import { getSeriesChampion, getSeriesStandingsResponse } from '../../../src/lib/series';
import { loadImage } from '../../../processes/discord-bot/utils/image-source';
import { logger } from '../../../src/lib/logger/server';
import { db } from '../../../lib/db';

setupPgTestFile();
const standings = getSeriesStandingsResponse as unknown as ReturnType<typeof vi.fn>;
const champion = getSeriesChampion as unknown as ReturnType<typeof vi.fn>;
const load = loadImage as unknown as ReturnType<typeof vi.fn>;

const KINDS = ['registration_open', 'weekly_schedule', 'standings', 'playoff_seeded', 'champion'] as const;

interface Sent { channel: string; message: any }

function makeClient(opts: { failChannels?: string[] } = {}) {
  const sent: Sent[] = [];
  const client = {
    channels: {
      fetch: vi.fn(async (id: string) => {
        if (opts.failChannels?.includes(id)) throw new Error(`cannot fetch ${id}`);
        return { isTextBased: () => true, send: vi.fn(async (message: unknown) => { sent.push({ channel: id, message }); return { id: `msg-${id}` }; }) };
      }),
    },
  };
  return { client, sent };
}

const embedOf = (s: Sent) => s.message.embeds[0].toJSON();
const job = (series_id: string, kind: string, payload: Record<string, unknown> = {}) => ({ id: `job-${kind}`, series_id, kind, payload });

let gameId: string;
let modeId: string;

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.PUBLIC_URL;
  load.mockResolvedValue(null);
  standings.mockResolvedValue({ mode: 'points', rows: [] });
  champion.mockResolvedValue(null);
  const seed = await seedBasicTestData();
  gameId = seed.game.id;
  modeId = seed.mode.id;
  await createDiscordSettings({ guild_id: 'guild-1' });
});

type Flag = 'send_announcements' | 'send_reminders' | 'send_match_start' | 'send_signup_updates' | 'send_series_updates';
/** A channel with exactly one notification flag on (the column defaults turn most of them on). */
const channel = (discord_channel_id: string, flag: Flag) => createDiscordChannel({
  discord_channel_id, send_announcements: false, send_reminders: false, send_match_start: false, send_signup_updates: false,
  send_health_alerts: false, send_series_updates: false, [flag]: true,
});

async function channels() {
  await channel('D-ANN', 'send_announcements');
  await channel('D-LIVE', 'send_match_start');
  await channel('D-SERIES', 'send_series_updates');
  await channel('D-REM', 'send_reminders');
}

describe('routing', () => {
  it('maps every kind to its channel flag', () => {
    expect(SERIES_UPDATE_CHANNEL_TYPE).toEqual({
      registration_open: 'announcements', playoff_seeded: 'match_start', champion: 'match_start',
      weekly_schedule: 'series_updates', standings: 'series_updates',
    });
  });

  it.each([
    ['registration_open', 'D-ANN'], ['playoff_seeded', 'D-LIVE'], ['champion', 'D-LIVE'], ['weekly_schedule', 'D-SERIES'], ['standings', 'D-SERIES'],
  ] as const)('%s goes only to its own channels (%s)', async (kind, expected) => {
    await channels();
    const s = await insertSeries({ status: 'registration', game_id: gameId, name: 'Season' });
    const { client, sent } = makeClient();
    const result = await new SeriesUpdateHandler(client as never, null).post(job(s.id, kind, { week: 1 }));
    expect(sent.map((x) => x.channel)).toEqual([expected]);
    expect(result).toEqual({ posted: 1, channels: 1, messageId: `msg-${expected}` });
  });

  it('sends to every channel with the flag', async () => {
    await channel('A1', 'send_series_updates');
    await channel('A2', 'send_series_updates');
    const s = await insertSeries({ name: 'Season' });
    const { client, sent } = makeClient();
    const result = await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'standings'));
    expect(sent.map((x) => x.channel).sort()).toEqual(['A1', 'A2']);
    expect(result).toMatchObject({ posted: 2, channels: 2 });
  });

  it('skips quietly (info log, no send) when no channel matches the kind', async () => {
    await channel('only-live', 'send_match_start');
    const s = await insertSeries({ name: 'Season' });
    const { client, sent } = makeClient();
    const result = await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'standings', { week: 1 }));
    expect(result).toEqual({ posted: 0, channels: 0 });
    expect(sent).toEqual([]);
    expect(client.channels.fetch).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No series_updates channels configured'));
  });

  it('drops the post of a deleted series and rejects unknown kinds', async () => {
    await channels();
    const { client, sent } = makeClient();
    const handler = new SeriesUpdateHandler(client as never, null);
    expect(await handler.post(job('gone', 'standings'))).toEqual({ posted: 0, channels: 0 });
    const s = await insertSeries();
    await expect(handler.post(job(s.id, 'nonsense'))).rejects.toThrow(/Unknown series update kind/);
    expect(sent).toEqual([]);
  });
});

describe('delivery failures', () => {
  it('throws when every channel fails (the job is retried)', async () => {
    await channel('X1', 'send_series_updates');
    await channel('X2', 'send_series_updates');
    const s = await insertSeries({ name: 'Season' });
    const { client } = makeClient({ failChannels: ['X1', 'X2'] });
    await expect(new SeriesUpdateHandler(client as never, null).post(job(s.id, 'standings'))).rejects.toThrow(/cannot fetch/);
  });

  it('succeeds when at least one channel got the post', async () => {
    await channel('BAD', 'send_series_updates');
    await channel('GOOD', 'send_series_updates');
    const s = await insertSeries({ name: 'Season' });
    const { client, sent } = makeClient({ failChannels: ['BAD'] });
    const result = await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'standings'));
    expect(result).toMatchObject({ posted: 1, channels: 2, messageId: 'msg-GOOD' });
    expect(sent.map((x) => x.channel)).toEqual(['GOOD']);
  });

  it('throws for a channel that is not text based', async () => {
    await channel('VOICE', 'send_series_updates');
    const s = await insertSeries({ name: 'Season' });
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ isTextBased: () => false }) } };
    await expect(new SeriesUpdateHandler(client as never, null).post(job(s.id, 'standings'))).rejects.toThrow(/any channel/);
  });
});

describe('registration_open', () => {
  const componentsOf = (s: Sent) => s.message.components[0].toJSON().components as Array<{ custom_id: string; label: string; style: number }>;

  it('posts the series info with a Register button for a solo series', async () => {
    await channel('D-ANN', 'send_announcements');
    const s = await insertSeries({
      status: 'registration', name: 'Spring Cup', description: 'Sign up now', game_id: gameId, entrant_type: 'solo',
      start_date: new Date('2026-04-01T00:00:00Z'), end_date: new Date('2026-06-01T00:00:00Z'),
    });
    await createSeriesWithEntrants(db, { entrantType: 'solo', entrants: [] });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'registration_open'));

    const embed = embedOf(sent[0]);
    expect(embed.title).toBe('📝 Registration open: Spring Cup');
    expect(embed.description).toBe('Sign up now');
    expect(embed.fields.map((f: any) => f.name)).toEqual(['🎯 Game', '👥 Format', '📅 Season', '📋 Registered so far']);
    expect(embed.fields[1].value).toBe('Solo players');
    expect(embed.fields[2].value).toContain(`<t:${Math.floor(new Date('2026-04-01T00:00:00Z').getTime() / 1000)}:D>`);
    expect(componentsOf(sent[0]).map((c) => c.custom_id)).toEqual([`series_reg:${s.id}`]);
  });

  it('adds Join team and Leave buttons for a team series, and counts non-withdrawn entrants', async () => {
    await channel('D-ANN', 'send_announcements');
    const created = await createSeriesWithEntrants(db, {
      entrantType: 'team', status: 'registration', rosterMin: 3, rosterMax: 5,
      entrants: [{ name: 'A', status: 'pending' }, { name: 'B' }, { name: 'C', status: 'withdrawn' }],
    });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(created.seriesId, 'registration_open'));
    const embed = embedOf(sent[0]);
    expect(embed.fields.find((f: any) => f.name === '👥 Format').value).toBe('Teams of 3-5 players');
    expect(embed.fields.find((f: any) => f.name === '📋 Registered so far').value).toBe('2');
    expect(componentsOf(sent[0]).map((c) => c.custom_id)).toEqual([
      `series_reg:${created.seriesId}`, `series_join:${created.seriesId}`, `series_leave:${created.seriesId}`,
    ]);
  });

  it('mentions the announcement role, like match announcements', async () => {
    await channel('D-ANN', 'send_announcements');
    const s = await insertSeries({ status: 'registration', name: 'S' });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, { announcement_role_id: '999' } as never).post(job(s.id, 'registration_open'));
    expect(sent[0].message.content).toBe('<@&999>');
    sent.length = 0;
    await new SeriesUpdateHandler(client as never, { mention_everyone: true } as never).post(job(s.id, 'registration_open'));
    expect(sent[0].message.content).toBe('@everyone');
    sent.length = 0;
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'registration_open'));
    expect(sent[0].message.content).toBeUndefined();
  });

  it('attaches the series image as the embed banner when it loads, and uses the game color', async () => {
    await channel('D-ANN', 'send_announcements');
    const s = await insertSeries({ status: 'registration', name: 'S', game_id: gameId, event_image_url: '/uploads/series/banner.png' });
    load.mockResolvedValue({ buffer: Buffer.from('png'), filename: 'banner.png', contentType: 'image/png' });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'registration_open'));
    expect(sent[0].message.files).toHaveLength(1);
    expect(embedOf(sent[0]).image.url).toBe('attachment://series_image.png');
    expect(typeof embedOf(sent[0]).color).toBe('number');
  });

  it('still posts when the series image is missing', async () => {
    await channel('D-ANN', 'send_announcements');
    const s = await insertSeries({ status: 'registration', name: 'S', event_image_url: '/uploads/gone.png' });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'registration_open'));
    expect(sent).toHaveLength(1);
    expect(sent[0].message.files).toBeUndefined();
  });
});

describe('weekly_schedule', () => {
  const T1 = new Date('2026-03-10T18:00:00Z');
  const T2 = new Date('2026-03-12T20:00:00Z');
  const ts = (d: Date) => Math.floor(d.getTime() / 1000);

  it('lists the week with Discord timestamps, entrants and stage, in start order', async () => {
    await channel('D-SERIES', 'send_series_updates');
    const created = await createSeriesWithEntrants(db, {
      entrantType: 'team', gameId, entrants: [{ name: 'Rockets' }, { name: 'Comets' }, { name: 'Ants' }, { name: 'Bees' }],
    });
    const stage = await insertStage(created.seriesId, { name: 'Stage 1' });
    const [r, c] = created.entrants;

    const late = await createMatch(gameId, modeId, { name: 'Late match', start_date: T2, start_time: T2 });
    const early = await createMatch(gameId, modeId, { name: 'Early match', start_date: T1, start_time: T1 });
    const other = await createMatch(gameId, modeId, { name: 'Week two', start_date: T2, start_time: T2 });
    const cancelled = await createMatch(gameId, modeId, { name: 'Cancelled one', start_date: T1, start_time: T1, status: 'cancelled' });
    const team = async (matchId: string, entrantId: string, order: number, name: string) =>
      getPgTestDb().insert(matchTeams).values({ id: `${matchId}-${order}`, match_id: matchId, team_name: name, team_order: order, series_entrant_id: entrantId } as never);
    await team(early.id, r.id, 1, 'Rockets');
    await team(early.id, c.id, 2, 'Comets');
    await linkEvent(created.seriesId, 'match', late.id, { week: 1, stage_id: stage.id });
    await linkEvent(created.seriesId, 'match', early.id, { week: 1, stage_id: stage.id });
    await linkEvent(created.seriesId, 'match', other.id, { week: 2 });
    await linkEvent(created.seriesId, 'match', cancelled.id, { week: 1 });
    await linkEvent(created.seriesId, 'match', 'planned-ignored', {
      status: 'planned', match_id: null, week: 1, seeding_rule: { source: 'season', top: 2, format: 'single-elimination', template: { name: 'Finals' } },
    });

    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(created.seriesId, 'weekly_schedule', { week: 1 }));
    const embed = embedOf(sent[0]);
    expect(embed.title).toBe('📅 Season - Week 1');
    const lines = (embed.description as string).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(`<t:${ts(T1)}:F> - **Rockets vs Comets** (Stage 1)`);
    expect(lines[1]).toBe(`<t:${ts(T2)}:F> - **Late match** (Stage 1)`);
    expect(embed.description).not.toContain('Week two');
    expect(embed.description).not.toContain('Cancelled one');
  });

  it('groups events without a week by ISO week of the start', async () => {
    await channel('D-SERIES', 'send_series_updates');
    const s = await insertSeries({ status: 'active', name: 'S' });
    const m = await createMatch(gameId, modeId, { name: 'No week', start_date: T1, start_time: T1 });
    await linkEvent(s.id, 'match', m.id, { week: null });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'weekly_schedule', { week: 11 }));
    expect(embedOf(sent[0]).description).toContain('No week');
  });

  it('says so when nothing is scheduled, and refuses a post without a week', async () => {
    await channel('D-SERIES', 'send_series_updates');
    const s = await insertSeries({ status: 'active', name: 'S' });
    const { client, sent } = makeClient();
    const handler = new SeriesUpdateHandler(client as never, null);
    await handler.post(job(s.id, 'weekly_schedule', { week: 3 }));
    expect(embedOf(sent[0]).description).toBe('No events scheduled for this week.');
    await expect(handler.post(job(s.id, 'weekly_schedule'))).rejects.toThrow(/needs a week/);
  });

  it('keeps the description under the Discord limit for a long week', async () => {
    await channel('D-SERIES', 'send_series_updates');
    const s = await insertSeries({ status: 'active', name: 'S' });
    for (let i = 0; i < 80; i++) {
      const m = await createMatch(gameId, modeId, { name: `Long named event number ${i} ${'x'.repeat(40)}`, start_date: T1, start_time: T1 });
      await linkEvent(s.id, 'match', m.id, { week: 1 });
    }
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'weekly_schedule', { week: 1 }));
    const description = embedOf(sent[0]).description as string;
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).toMatch(/\.\.\.and \d+ more$/);
  });
});

describe('standings', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({
    rank: i + 1, name: `Team ${i + 1}`, total_points: 100 - i, match_wins: 10 - i, match_losses: i, match_ties: 0, map_diff: 8 - i,
  }));

  it('posts the top 10 as a code-block table with a link to the web UI', async () => {
    process.env.PUBLIC_URL = 'https://matches.example.com/';
    await channel('D-SERIES', 'send_series_updates');
    const s = await insertSeries({ status: 'active', name: 'League' });
    standings.mockResolvedValue({ mode: 'points', rows: rows(12) });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'standings', { week: 4 }));
    const embed = embedOf(sent[0]);
    expect(embed.title).toBe('📊 League - Standings after week 4');
    const description = embed.description as string;
    expect(description.startsWith('```\n')).toBe(true);
    expect(description).toContain('Team 10');
    expect(description).not.toContain('Team 11');
    expect(description).toContain('...and 2 more');
    expect(description).toContain(`[View full standings](https://matches.example.com/series/${s.id})`);
  });

  it('omits the link without PUBLIC_URL', async () => {
    await channel('D-SERIES', 'send_series_updates');
    const s = await insertSeries({ status: 'active', name: 'League' });
    standings.mockResolvedValue({ mode: 'points', rows: rows(2) });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'standings'));
    expect(embedOf(sent[0]).description).not.toContain('View full standings');
    expect(embedOf(sent[0]).title).toBe('📊 League - Standings');
  });

  it('formats head to head tables with the record and map difference', () => {
    const text = formatStandingsTable({
      mode: 'head_to_head',
      rows: [
        { rank: 1, name: 'Rockets', total_points: 0, match_wins: 7, match_losses: 1, match_ties: 2, map_diff: 9 },
        { rank: 2, name: 'A very long team name that is cut', total_points: 0, match_wins: 3, match_losses: 5, map_diff: -4 },
      ],
    });
    const lines = text.split('\n');
    expect(lines[0]).toBe('```');
    expect(lines[1]).toContain('Team');
    expect(lines[1]).toContain('W-L');
    expect(lines[2]).toBe(` 1  ${'Rockets'.padEnd(18)}  ${'7-1-2'.padStart(7)}  ${'+9'.padStart(4)}`);
    expect(lines[3]).toBe(` 2  A very long team …  ${'3-5'.padStart(7)}  ${'-4'.padStart(4)}`);
    expect(lines[4]).toBe('```');
  });

  it('formats points tables and the empty case', () => {
    const text = formatStandingsTable({ mode: 'points', rows: [{ rank: 1, name: 'Ann', total_points: 12.5 }, { rank: 1, name: 'Bob', total_points: 12.5 }] });
    expect(text).toContain('Pts');
    expect(text).toContain(` 1  ${'Ann'.padEnd(18)}  ${'12.5'.padStart(6)}`);
    expect(text).toMatch(/ 1 {2}Bob/);
    expect(formatStandingsTable({ mode: 'points', rows: [] })).toBe('No results yet.');
  });

  it('reduces the standings response to table rows (head to head fields kept, unknown series is an empty points table)', async () => {
    standings.mockResolvedValueOnce({ mode: 'head_to_head', rows: [{ rank: 2, name: 'New', total_points: 3, match_wins: 1, match_losses: 0, map_diff: 2, extra: 'x' }] });
    expect(await loadStandingsTable(db, 's')).toEqual({
      mode: 'head_to_head',
      rows: [{ rank: 2, name: 'New', total_points: 3, match_wins: 1, match_losses: 0, match_ties: undefined, map_diff: 2 }],
    });
    standings.mockResolvedValueOnce(null);
    expect(await loadStandingsTable(db, 's')).toEqual({ mode: 'points', rows: [] });
  });
});

describe('playoff_seeded and champion', () => {
  it('lists the qualifiers with their seeds and the bracket start', async () => {
    await channel('D-LIVE', 'send_match_start');
    const s = await insertSeries({ status: 'active', name: 'League' });
    const start = new Date('2026-05-01T18:00:00Z');
    const t = await createTournament(gameId, { name: 'League Playoffs', start_date: start });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'playoff_seeded', {
      tournament_id: t.id, qualifiers: [{ seed: 2, name: 'Comets' }, { seed: 1, name: 'Rockets' }],
    }));
    const embed = embedOf(sent[0]);
    expect(embed.title).toBe('🏅 League Playoffs - seeding is set');
    expect(embed.description).toContain('League');
    expect(embed.fields[0]).toEqual({ name: '🎟️ Qualifiers', value: '**#1** Rockets\n**#2** Comets', inline: false });
    expect(embed.fields[1].value).toBe(`<t:${Math.floor(start.getTime() / 1000)}:F>`);
  });

  it('falls back to the tournament teams (by event id) when the payload has no qualifiers', async () => {
    await channel('D-LIVE', 'send_match_start');
    const s = await insertSeries({ status: 'active', name: 'League' });
    const t = await createTournament(gameId, { name: 'Finals' });
    await getPgTestDb().insert(tournamentTeams).values([
      { id: 'tt1', tournament_id: t.id, team_name: 'Zeta' }, { id: 'tt2', tournament_id: t.id, team_name: 'Alpha' },
    ]);
    const event = await linkEvent(s.id, 'tournament', t.id);
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'playoff_seeded', { event_id: event.id }));
    const embed = embedOf(sent[0]);
    expect(embed.title).toBe('🏅 Finals - seeding is set');
    expect(embed.fields[0].value).toBe('- Alpha\n- Zeta');
  });

  it('posts a champion embed with the rank 1 name', async () => {
    process.env.PUBLIC_URL = 'https://x.test';
    await channel('D-LIVE', 'send_match_start');
    const s = await insertSeries({ status: 'complete', name: 'League' });
    standings.mockResolvedValue({ mode: 'points', rows: [{ rank: 1, name: 'Rockets', total_points: 50 }, { rank: 2, name: 'Comets', total_points: 40 }] });
    const { client, sent } = makeClient();
    await new SeriesUpdateHandler(client as never, null).post(job(s.id, 'champion'));
    const embed = embedOf(sent[0]);
    expect(embed.title).toBe('🏆 League - Champion');
    expect(embed.description).toBe('Congratulations to **Rockets**, champion of **League**!');
    expect(embed.fields[0].value).toContain(`https://x.test/series/${s.id}`);
  });

  it('prefers the series champion lookup (season playoff winner), and copes with an empty table', async () => {
    await channel('D-LIVE', 'send_match_start');
    const s = await insertSeries({ status: 'complete', name: 'League' });
    champion.mockResolvedValue({ entrant_id: null, name: 'Playoff Winners', source: 'season_playoff' });
    const first = makeClient();
    await new SeriesUpdateHandler(first.client as never, null).post(job(s.id, 'champion'));
    expect(embedOf(first.sent[0]).description).toContain('**Playoff Winners**');

    champion.mockResolvedValue(null);
    const second = makeClient();
    await new SeriesUpdateHandler(second.client as never, null).post(job(s.id, 'champion'));
    expect(embedOf(second.sent[0]).description).toBe('**League** has concluded.');
  });
});

describe('every kind produces a postable message', () => {
  it.each(KINDS)('%s', async (kind) => {
    await channels();
    const s = await insertSeries({ status: 'active', name: 'Season', game_id: gameId });
    const { client, sent } = makeClient();
    const result = await new SeriesUpdateHandler(client as never, null).post(job(s.id, kind, { week: 1 }));
    expect(result.posted).toBe(1);
    expect(embedOf(sent[0]).title.length).toBeLessThanOrEqual(256);
  });
});
