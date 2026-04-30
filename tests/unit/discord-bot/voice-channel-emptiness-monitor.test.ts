import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockDiscordClient, resetDiscordMocks } from '../../mocks/discord';
import { getTestDb } from '../../utils/test-db';
import { createMatch, seedBasicTestData } from '../../utils/fixtures';

vi.mock('../../../src/lib/logger/server', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

import { VoiceChannelEmptinessMonitor } from '../../../processes/discord-bot/modules/voice-channel-emptiness-monitor';

type MockVoiceChannel = {
  id: string;
  members: { size: number };
  delete: ReturnType<typeof vi.fn>;
};

describe('VoiceChannelEmptinessMonitor', () => {
  let db: any;
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
    await db.run(
      `INSERT INTO auto_voice_channels (id, match_id, channel_id, team_name)
       VALUES (?, ?, ?, ?)`,
      [`avc_${matchId}_${channelId}`, matchId, channelId, teamName]
    );
  };

  beforeEach(async () => {
    resetDiscordMocks();
    db = getTestDb();

    channelMap = new Map<string, MockVoiceChannel>();
    fetchErrorIds = new Set<string>();

    mockDiscordClient.channels.fetch.mockImplementation(async (channelId: string) => {
      if (fetchErrorIds.has(channelId)) {
        throw new Error('Fetch failed');
      }
      return channelMap.get(channelId) ?? null;
    });

    monitor = new VoiceChannelEmptinessMonitor(mockDiscordClient as any, db as any);
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

    const rows = await db.all(`SELECT channel_id FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
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

    const rows = await db.all(`SELECT channel_id FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
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

    const rows = await db.all(`SELECT channel_id FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
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

    const rows = await db.all(`SELECT channel_id FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
    expect(rows).toHaveLength(2);
    expect(blue.delete).not.toHaveBeenCalled();
    expect(red.delete).not.toHaveBeenCalled();
  });

  it('handles missing or fetch-failed channels as empty and still cleans up', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });

    const existing = createVoiceChannel('voice-partial-1', 0);
    const failingChannelId = 'voice-partial-2';
    fetchErrorIds.add(failingChannelId);

    await insertTrackedChannel(match.id, existing.id, 'blue');
    await insertTrackedChannel(match.id, failingChannelId, 'red');

    await monitor.runCheck();
    await monitor.runCheck();

    const rows = await db.all(`SELECT channel_id FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
    expect(rows).toHaveLength(0);
    expect(existing.delete).toHaveBeenCalledTimes(1);
  });

  it('prunes stale in-memory state when tracked rows disappear', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });

    const firstChannel = createVoiceChannel('voice-prune-1', 0);
    await insertTrackedChannel(match.id, firstChannel.id, 'all');

    await monitor.runCheck(); // count = 1

    await db.run('DELETE FROM auto_voice_channels WHERE match_id = ?', [match.id]);
    await monitor.runCheck(); // should clear stale counter state

    const secondChannel = createVoiceChannel('voice-prune-2', 0);
    await insertTrackedChannel(match.id, secondChannel.id, 'all');

    await monitor.runCheck(); // should be treated as first empty cycle again

    let rows = await db.all(`SELECT channel_id FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
    expect(rows).toHaveLength(1);
    expect(secondChannel.delete).not.toHaveBeenCalled();

    await monitor.runCheck();

    rows = await db.all(`SELECT channel_id FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
    expect(rows).toHaveLength(0);
    expect(secondChannel.delete).toHaveBeenCalledTimes(1);
  });

  it('ignores tracked channels for matches not complete/cancelled', async () => {
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'battle' });

    const channel = createVoiceChannel('voice-battle-1', 0);
    await insertTrackedChannel(match.id, channel.id, 'all');

    await monitor.runCheck();
    await monitor.runCheck();
    await monitor.runCheck();

    const rows = await db.all(`SELECT channel_id FROM auto_voice_channels WHERE match_id = ?`, [match.id]);
    expect(rows).toHaveLength(1);
    expect(channel.delete).not.toHaveBeenCalled();
  });
});
