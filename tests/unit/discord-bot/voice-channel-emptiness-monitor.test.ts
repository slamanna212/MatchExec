import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';
import { getPgTestDb, setupPgTestFile } from '../../utils/pg-test-db';
import { eq } from 'drizzle-orm';
import { autoVoiceChannels, discordSettings } from '../../../lib/db/schema';
import { createMatch, seedBasicTestData } from '../../utils/pg-fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

import { deleteMatch, scheduleVoiceCleanup, trackAutoVoiceChannels } from '../../../src/lib/matches';
import { VoiceChannelEmptinessMonitor } from '../../../processes/discord-bot/modules/voice-channel-emptiness-monitor';

type MockVoiceChannel = {
  id: string;
  members: { size: number };
  delete: ReturnType<typeof vi.fn>;
};

setupPgTestFile();

describe('VoiceChannelEmptinessMonitor', () => {
  let monitor: VoiceChannelEmptinessMonitor;
  let channelMap: Map<string, MockVoiceChannel>;
  let fetchErrorIds: Set<string>;

  const createVoiceChannel = (channelId: string, memberCount = 0): MockVoiceChannel => {
    const channel: MockVoiceChannel = {
      id: channelId,
      members: { size: memberCount },
      delete: vi.fn().mockImplementation(async () => {
        channelMap.delete(channelId);
      }),
    };

    channelMap.set(channelId, channel);
    return channel;
  };

  const insertTrackedChannel = async (matchId: string, channelId: string, teamName: string) => {
    await getPgTestDb().insert(autoVoiceChannels).values({ id: `avc_${matchId}_${channelId}`, match_id: matchId, channel_id: channelId, team_name: teamName, cleanup_after: new Date(0) });
  };

  beforeEach(async () => {
    resetDiscordMocks();

    channelMap = new Map<string, MockVoiceChannel>();
    fetchErrorIds = new Set<string>();

    mockDiscordClient.channels.fetch.mockImplementation(async (channelId: string) => {
      if (fetchErrorIds.has(channelId)) {
        throw new Error('Fetch failed');
      }
      return channelMap.get(channelId) ?? null;
    });

    monitor = new VoiceChannelEmptinessMonitor(mockDiscordClient as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('increments empty check count on first empty cycle without deleting', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });

    const blue = createVoiceChannel('voice-empty-1', 0);
    const red = createVoiceChannel('voice-empty-2', 0);

    await insertTrackedChannel(match.id, blue.id, 'blue');
    await insertTrackedChannel(match.id, red.id, 'red');

    await monitor.runCheck();

    const rows = await getPgTestDb().select({ channel_id: autoVoiceChannels.channel_id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, match.id));
    expect(rows).toHaveLength(2);
    expect(blue.delete).not.toHaveBeenCalled();
    expect(red.delete).not.toHaveBeenCalled();
  });

  it('deletes tracked channels on second consecutive empty cycle', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });

    const blue = createVoiceChannel('voice-delete-1', 0);
    const red = createVoiceChannel('voice-delete-2', 0);

    await insertTrackedChannel(match.id, blue.id, 'blue');
    await insertTrackedChannel(match.id, red.id, 'red');

    await monitor.runCheck();
    await monitor.runCheck();

    const rows = await getPgTestDb().select({ channel_id: autoVoiceChannels.channel_id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, match.id));
    expect(rows).toHaveLength(0);
    expect(blue.delete).toHaveBeenCalledTimes(1);
    expect(red.delete).toHaveBeenCalledTimes(1);
  });

  it('resets empty counter when any tracked channel is occupied', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });

    const blue = createVoiceChannel('voice-reset-1', 0);
    const red = createVoiceChannel('voice-reset-2', 0);

    await insertTrackedChannel(match.id, blue.id, 'blue');
    await insertTrackedChannel(match.id, red.id, 'red');

    await monitor.runCheck(); // count = 1

    blue.members.size = 1;
    await monitor.runCheck(); // reset to 0

    blue.members.size = 0;
    await monitor.runCheck(); // count = 1, should not delete yet

    const rows = await getPgTestDb().select({ channel_id: autoVoiceChannels.channel_id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, match.id));
    expect(rows).toHaveLength(2);
    expect(blue.delete).not.toHaveBeenCalled();
    expect(red.delete).not.toHaveBeenCalled();
  });

  it('requires all tracked channels to be empty before counting toward deletion', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });

    const blue = createVoiceChannel('voice-all-empty-1', 0);
    const red = createVoiceChannel('voice-all-empty-2', 2);

    await insertTrackedChannel(match.id, blue.id, 'blue');
    await insertTrackedChannel(match.id, red.id, 'red');

    await monitor.runCheck();
    await monitor.runCheck();

    const rows = await getPgTestDb().select({ channel_id: autoVoiceChannels.channel_id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, match.id));
    expect(rows).toHaveLength(2);
    expect(blue.delete).not.toHaveBeenCalled();
    expect(red.delete).not.toHaveBeenCalled();
  });

  it('retains all channels when a fetch fails instead of treating uncertainty as empty', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });

    const existing = createVoiceChannel('voice-partial-1', 0);
    const failingChannelId = 'voice-partial-2';
    fetchErrorIds.add(failingChannelId);

    await insertTrackedChannel(match.id, existing.id, 'blue');
    await insertTrackedChannel(match.id, failingChannelId, 'red');

    await monitor.runCheck();
    await monitor.runCheck();

    const rows = await getPgTestDb().select({ channel_id: autoVoiceChannels.channel_id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, match.id));
    expect(rows).toHaveLength(2);
    expect(existing.delete).not.toHaveBeenCalled();
  });

  it('prunes stale in-memory state when tracked rows disappear', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });

    const firstChannel = createVoiceChannel('voice-prune-1', 0);
    await insertTrackedChannel(match.id, firstChannel.id, 'all');

    await monitor.runCheck(); // count = 1

    await getPgTestDb().delete(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, match.id));
    await monitor.runCheck(); // should clear stale counter state

    const secondChannel = createVoiceChannel('voice-prune-2', 0);
    await insertTrackedChannel(match.id, secondChannel.id, 'all');

    await monitor.runCheck(); // should be treated as first empty cycle again

    let rows = await getPgTestDb().select({ channel_id: autoVoiceChannels.channel_id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, match.id));
    expect(rows).toHaveLength(1);
    expect(secondChannel.delete).not.toHaveBeenCalled();

    await monitor.runCheck();

    rows = await getPgTestDb().select({ channel_id: autoVoiceChannels.channel_id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, match.id));
    expect(rows).toHaveLength(0);
    expect(secondChannel.delete).toHaveBeenCalledTimes(1);
  });

  it('ignores tracked channels for matches not complete/cancelled', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'battle' });

    const channel = createVoiceChannel('voice-battle-1', 0);
    await insertTrackedChannel(match.id, channel.id, 'all');
    await getPgTestDb().update(autoVoiceChannels).set({ cleanup_after: null }).where(eq(autoVoiceChannels.match_id, match.id));

    await monitor.runCheck();
    await monitor.runCheck();
    await monitor.runCheck();

    const rows = await getPgTestDb().select({ channel_id: autoVoiceChannels.channel_id }).from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, match.id));
    expect(rows).toHaveLength(1);
    expect(channel.delete).not.toHaveBeenCalled();
  });
  it('honors the saved deadline, survives a monitor restart, and never extends it', async () => {
    const ex = getPgTestDb();
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });
    await ex.insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't', voice_channel_cleanup_delay_minutes: 10 });
    const channel = createVoiceChannel('delayed', 0);
    await trackAutoVoiceChannels(ex, match.id, [{ channelId: channel.id, teamName: 'all' }]);
    await scheduleVoiceCleanup(ex, match.id);
    const [before] = await ex.select().from(autoVoiceChannels);
    await ex.update(discordSettings).set({ voice_channel_cleanup_delay_minutes: 0 });
    await scheduleVoiceCleanup(ex, match.id);
    expect((await ex.select().from(autoVoiceChannels))[0].cleanup_after).toEqual(before.cleanup_after);
    await monitor.runCheck(); await monitor.runCheck();
    expect(channel.delete).not.toHaveBeenCalled();
    await ex.update(autoVoiceChannels).set({ cleanup_after: new Date(0) });
    monitor = new VoiceChannelEmptinessMonitor(mockDiscordClient as any);
    await monitor.runCheck(); await monitor.runCheck();
    expect(channel.delete).toHaveBeenCalledTimes(1);
  });

  it('retains only failed deletions, backs off, then retries after restart', async () => {
    const ex = getPgTestDb();
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });
    const first = createVoiceChannel('success', 0);
    const second = createVoiceChannel('retry', 0);
    second.delete.mockRejectedValueOnce(Object.assign(new Error('Missing Permissions'), { code: 50013 }));
    await insertTrackedChannel(match.id, first.id, 'blue');
    await insertTrackedChannel(match.id, second.id, 'red');
    await monitor.runCheck(); await monitor.runCheck();
    const rows = await ex.select().from(autoVoiceChannels);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel_id: second.id, cleanup_attempts: 1, last_error: 'Missing Permissions' });
    monitor = new VoiceChannelEmptinessMonitor(mockDiscordClient as any);
    await monitor.runCheck(); await monitor.runCheck();
    expect(second.delete).toHaveBeenCalledTimes(1);
    await ex.update(autoVoiceChannels).set({ next_attempt_at: new Date(0) });
    await monitor.runCheck(); await monitor.runCheck();
    expect(second.delete).toHaveBeenCalledTimes(2);
    expect(await ex.select().from(autoVoiceChannels)).toHaveLength(0);
  });

  it('cleans deleted matches and preserves the deadline for channels recorded afterward', async () => {
    const ex = getPgTestDb();
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'battle' });
    await ex.insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't', voice_channel_cleanup_delay_minutes: 0 });
    await deleteMatch(ex, match.id);
    const channel = createVoiceChannel('late', 0);
    await trackAutoVoiceChannels(ex, match.id, [{ channelId: channel.id, teamName: 'all' }]);
    await monitor.runCheck(); await monitor.runCheck();
    expect(channel.delete).toHaveBeenCalledTimes(1);
  });

  it('only treats explicit Unknown Channel errors as confirmed absence', async () => {
    const ex = getPgTestDb();
    await insertTrackedChannel('deleted-match', 'gone', 'all');
    mockDiscordClient.channels.fetch.mockRejectedValue(Object.assign(new Error('Unknown Channel'), { code: 10003 }));
    await monitor.runCheck(); await monitor.runCheck();
    expect(await ex.select().from(autoVoiceChannels)).toHaveLength(0);
  });

  it('does not overlap checks or delete when someone joins during the final recheck', async () => {
    await insertTrackedChannel('deleted-match', 'joining', 'all');
    const channel = createVoiceChannel('joining', 0);
    let release!: () => void;
    mockDiscordClient.channels.fetch.mockImplementationOnce(async () => { await new Promise<void>((r) => { release = r; }); return channel; });
    const first = monitor.runCheck();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await monitor.runCheck(); // must not advance the empty-check counter
    release(); await first;
    expect(channel.delete).not.toHaveBeenCalled();
    mockDiscordClient.channels.fetch.mockResolvedValueOnce(channel).mockImplementationOnce(async () => { channel.members.size = 1; return channel; });
    await monitor.runCheck();
    expect(channel.delete).not.toHaveBeenCalled();
  });

});
