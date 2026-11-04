// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupPgTestFile, getPgTestDb } from '../../utils/pg-test-db';
import { createMatch, seedBasicTestData } from '../../utils/pg-fixtures';
import { autoVoiceChannels, discordSettings, matches } from '../../../lib/db/schema';
import { applyVoiceRecovery, classifyVoiceRecovery, type RecoveryCandidate } from '../../../src/lib/matches/voice-recovery';

setupPgTestFile();
const candidate = (matchId: string, channelId = 'orphan'): RecoveryCandidate => ({ matchId, channelId, name: 'Test', evidence: ['log'], disposition: 'eligible' });

describe('voice recovery apply', () => {
  it('dry-run classification writes nothing; repeated apply preserves ownership and deadline', async () => {
    const ex = getPgTestDb();
    const report = classifyVoiceRecovery({ evidence: [{ channelId: 'orphan', matchId: 'gone', source: 'log' }], channels: [{ id: 'orphan', name: 'Test', type: 2 }], matches: [], permanentIds: new Set(), activeChannelIds: new Set() });
    expect(await ex.select().from(autoVoiceChannels)).toHaveLength(0);
    expect(await applyVoiceRecovery(ex, report)).toBe(1);
    const [before] = await ex.select().from(autoVoiceChannels);
    await ex.insert(discordSettings).values({ id: 1, guild_id: 'g', bot_token: 't', voice_channel_cleanup_delay_minutes: 0 });
    expect(await applyVoiceRecovery(ex, report)).toBe(1);
    expect(await ex.select().from(autoVoiceChannels)).toEqual([before]);
  });

  it('rechecks match activity at apply time and skips ambiguous candidates', async () => {
    const ex = getPgTestDb();
    const { game, mode } = await seedBasicTestData();
    const match = await createMatch(game.id, mode.id, { status: 'complete' });
    const report = [candidate(match.id), { ...candidate('gone', 'unknown'), disposition: 'ambiguous' as const }];
    await ex.update(matches).set({ status: 'battle' }).where(eq(matches.id, match.id));
    expect(await applyVoiceRecovery(ex, report)).toBe(0);
    expect(await ex.select().from(autoVoiceChannels)).toHaveLength(0);
  });
});
