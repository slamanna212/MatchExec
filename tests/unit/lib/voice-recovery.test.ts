// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifyVoiceRecovery, parseVoiceCreationLog } from '../../../src/lib/matches/voice-recovery';

describe('voice recovery evidence', () => {
  it('extracts exact IDs and match association from creation logs, never channel names', () => {
    expect(parseVoiceCreationLog('Creating 2 voice channel(s) for match m1 in category cat\nVoice channel(s) created: 1566809211109777610, 1566809212938358826\n', 'log'))
      .toEqual([{ channelId: '1566809211109777610', matchId: 'm1', source: 'log' }, { channelId: '1566809212938358826', matchId: 'm1', source: 'log' }]);
    expect(parseVoiceCreationLog('Voice channel(s) created: 1566809211109777610', 'log')).toEqual([]);
  });
  it('excludes active, permanent, conflicting, missing and unattributed channels', () => {
    const input = {
      evidence: [
        { channelId: 'safe', matchId: 'gone', source: 'log' },
        { channelId: 'active', matchId: 'active-match', source: 'tracking' },
        { channelId: 'permanent', matchId: 'gone', source: 'request' },
        { channelId: 'conflict', matchId: 'one', source: 'log' },
        { channelId: 'conflict', matchId: 'two', source: 'tracking' },
        { channelId: 'missing', matchId: 'gone', source: 'tracking' },
        { channelId: 'reused', matchId: 'gone', source: 'log' },
      ],
      channels: ['safe', 'active', 'permanent', 'conflict', 'unattributed', 'reused'].map((id) => ({ id, name: 'test', type: 2, parent_id: 'cat' })),
      matches: [{ id: 'active-match', status: 'battle' }], permanentIds: new Set(['permanent']), activeChannelIds: new Set(['reused']), categoryId: 'cat',
    };
    const report = classifyVoiceRecovery(input);
    expect(Object.fromEntries(report.map((r) => [r.channelId, r.disposition]))).toEqual({ safe: 'eligible', active: 'active', permanent: 'permanent', conflict: 'ambiguous', missing: 'missing', reused: 'active', unattributed: 'ambiguous' });
    expect(classifyVoiceRecovery(input)).toEqual(report);
  });
});
