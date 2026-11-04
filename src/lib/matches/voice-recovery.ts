import { eq } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { matches } from '../../../lib/db/schema';
import { listAutoVoiceChannels, protectedVoiceChannelIds, scheduleVoiceCleanup, trackAutoVoiceChannels } from './voice';

/** Recovery decisions are separate from Discord/database IO so dry runs and apply share the same checks. */
export interface VoiceEvidence { channelId: string; matchId: string; source: string }
export interface RecoveryChannel { id: string; name: string; type: number; parent_id?: string | null }
export interface RecoveryCandidate {
  channelId: string; name: string; matchId?: string; evidence: string[];
  disposition: 'eligible' | 'active' | 'permanent' | 'ambiguous' | 'missing';
}

export function parseVoiceCreationLog(log: string, source: string): VoiceEvidence[] {
  const evidence: VoiceEvidence[] = [];
  let matchId: string | undefined;
  for (const line of log.split('\n')) {
    const individual = line.match(/Created auto voice channel (\d{17,20}) for match (\S+)/);
    if (individual) evidence.push({ channelId: individual[1], matchId: individual[2].replace(/\x1b\[[0-9;]*m/g, ''), source });
    const start = line.match(/Creating \d+ voice channel\(s\) for match (\S+) in category/);
    if (start) matchId = start[1];
    const created = line.match(/Voice channel\(s\) created: ([\d, ]+)/);
    if (created && matchId) {
      for (const channelId of created[1].trim().split(/,\s*/)) {
        if (/^\d{17,20}$/.test(channelId)) evidence.push({ channelId, matchId, source });
      }
      matchId = undefined;
    }
    if (line.includes('Error creating voice channels')) matchId = undefined;
  }
  return evidence;
}

export function classifyVoiceRecovery(input: {
  evidence: VoiceEvidence[]; channels: RecoveryChannel[]; permanentIds: Set<string>;
  matches: Array<{ id: string; status: string }>; activeChannelIds: Set<string>; categoryId?: string | null;
}): RecoveryCandidate[] {
  const channels = new Map(input.channels.map((c) => [c.id, c]));
  const statuses = new Map(input.matches.map((m) => [m.id, m.status]));
  const grouped = new Map<string, VoiceEvidence[]>();
  for (const e of input.evidence) grouped.set(e.channelId, [...(grouped.get(e.channelId) ?? []), e]);
  // Unattributed channels in the app category are visible, never implicitly owned.
  for (const c of input.channels) if (c.type === 2 && c.parent_id === input.categoryId && !grouped.has(c.id)) grouped.set(c.id, []);
  return [...grouped].map(([channelId, evidence]) => {
    const channel = channels.get(channelId);
    const ids = [...new Set(evidence.map((e) => e.matchId))];
    const matchId = ids.length === 1 ? ids[0] : undefined;
    let disposition: RecoveryCandidate['disposition'] = 'eligible';
    if (!channel) disposition = 'missing';
    else if (input.permanentIds.has(channelId)) disposition = 'permanent';
    else if (input.activeChannelIds.has(channelId) || (matchId && statuses.has(matchId) && !['complete', 'cancelled'].includes(statuses.get(matchId)!))) disposition = 'active';
    else if (channel.type !== 2 || !matchId) disposition = 'ambiguous';
    return { channelId, name: channel?.name ?? '(not in guild)', matchId, evidence: evidence.map((e) => e.source), disposition };
  });
}

/** Apply only verified candidates, rechecking database protection inside each transaction. No Discord calls. */
export async function applyVoiceRecovery(ex: Executor, candidates: RecoveryCandidate[]): Promise<number> {
  let scheduled = 0;
  for (const candidate of candidates) {
    if (candidate.disposition !== 'eligible' || !candidate.matchId) continue;
    const matchId = candidate.matchId;
    await ex.transaction(async (tx) => {
      const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for('update');
      if (match && !['complete', 'cancelled'].includes(match.status)) return;
      if ((await protectedVoiceChannelIds(tx)).has(candidate.channelId)) return;
      await trackAutoVoiceChannels(tx, matchId, [{ channelId: candidate.channelId, teamName: 'all' }]);
      if (!(await listAutoVoiceChannels(tx, matchId)).some((r) => r.channel_id === candidate.channelId)) return;
      await scheduleVoiceCleanup(tx, matchId);
      scheduled++;
    });
  }
  return scheduled;
}
