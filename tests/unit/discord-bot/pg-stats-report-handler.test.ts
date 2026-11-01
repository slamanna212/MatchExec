// @vitest-environment node
/** StatsReportHandler.processMatch on Postgres (the pure embed helpers are covered in stats-report-handler.test.ts). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { addParticipant, seedStatsMatch, type StatsFixture } from '../../utils/pg-stats-fixtures';
import { gameStatDefinitions, matchPlayerStats, statsSettings } from '../../../lib/db/schema';
import { db } from '../../../lib/db';
import { createMatchTeams, getMatchTeams } from '../../../src/lib/matches';
import { markStatsDmSent } from '../../../src/lib/stats';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), critical: vi.fn() },
}));
vi.mock('discord.js', () => {
  class EmbedBuilder {
    data: Record<string, unknown> = {};
    setColor(c: number) { this.data.color = c; return this; }
    setTitle() { return this; }
    setDescription() { return this; }
    setFooter() { return this; }
    addFields() { return this; }
  }
  return { EmbedBuilder };
});
const sendDM = vi.hoisted(() => vi.fn());
vi.mock('../../../processes/discord-bot/modules/dm-builder', () => ({ sendDM }));

import { StatsReportHandler } from '../../../processes/discord-bot/modules/stats-report-handler';

setupPgTestFile();
const pg = () => getPgTestDb();

let fx: StatsFixture;
beforeEach(async () => {
  vi.clearAllMocks();
  sendDM.mockResolvedValue(undefined);
  fx = await seedStatsMatch();
  await pg().insert(gameStatDefinitions).values({ id: 'kills', game_id: fx.game.id, name: 'kills', display_name: 'Kills', is_primary: true });
});

const enable = (dm = true) => pg().insert(statsSettings).values({ id: 1, enabled: true, stats_report_dm_enabled: dm });
const stat = (participantId: string, stats: Record<string, number> = { kills: 4 }) =>
  pg().insert(matchPlayerStats).values({ id: `mps-${participantId}`, match_id: fx.match.id, participant_id: participantId, total_stats_json: stats, maps_played: 2 });
const handler = () => new StatsReportHandler({} as never);

describe('StatsReportHandler.processMatch', () => {
  it('does nothing when stats or the report DMs are disabled', async () => {
    const p = await addParticipant(fx.match.id);
    await stat(p.id);
    await handler().processMatch(fx.match.id); // no settings row
    await pg().insert(statsSettings).values({ id: 1, enabled: true, stats_report_dm_enabled: false });
    await handler().processMatch(fx.match.id);
    expect(sendDM).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown match or a game without stat definitions', async () => {
    await enable();
    await handler().processMatch('nope');
    await pg().delete(gameStatDefinitions);
    const p = await addParticipant(fx.match.id);
    await stat(p.id);
    await handler().processMatch(fx.match.id);
    expect(sendDM).not.toHaveBeenCalled();
  });

  it('DMs every participant with unsent stats and marks them sent', async () => {
    await enable();
    await createMatchTeams(db, fx.match.id);
    const teams = await getMatchTeams(db, fx.match.id);
    const a = await addParticipant(fx.match.id, { discord_user_id: 'da', team_id: teams.find((t) => t.team_order === 0)!.id, signup_data: { roles: 'Tank' } });
    const b = await addParticipant(fx.match.id, { discord_user_id: 'db' });
    await stat(a.id);
    await stat(b.id);

    await handler().processMatch(fx.match.id);

    expect(sendDM.mock.calls.map((c) => c[1]).sort()).toEqual(['da', 'db']);
    expect((await pg().select().from(matchPlayerStats)).every((r) => r.stats_dm_sent)).toBe(true);

    sendDM.mockClear();
    await handler().processMatch(fx.match.id); // nothing left to send
    expect(sendDM).not.toHaveBeenCalled();
  });

  it('skips already-sent rows and players without a Discord account', async () => {
    await enable();
    const sent = await addParticipant(fx.match.id, { discord_user_id: 'sent' });
    const ghost = await addParticipant(fx.match.id, { discord_user_id: null });
    const open = await addParticipant(fx.match.id, { discord_user_id: 'open' });
    for (const p of [sent, ghost, open]) await stat(p.id);
    await markStatsDmSent(db, fx.match.id, sent.id);
    await handler().processMatch(fx.match.id);
    expect(sendDM.mock.calls.map((c) => c[1])).toEqual(['open']);
  });

  it('keeps going and leaves the row unsent when one DM fails', async () => {
    await enable();
    const a = await addParticipant(fx.match.id, { discord_user_id: 'fails' });
    const b = await addParticipant(fx.match.id, { discord_user_id: 'works' });
    await stat(a.id);
    await stat(b.id);
    sendDM.mockImplementation(async (_c: unknown, id: string) => { if (id === 'fails') throw new Error('closed DMs'); });
    await handler().processMatch(fx.match.id);
    const rows = await pg().select().from(matchPlayerStats);
    expect(rows.find((r) => r.participant_id === a.id)?.stats_dm_sent).toBe(false);
    expect(rows.find((r) => r.participant_id === b.id)?.stats_dm_sent).toBe(true);
  });
});
