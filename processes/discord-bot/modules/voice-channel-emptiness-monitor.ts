import type { Client } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db, type Executor } from '../../../lib/db';
import { autoVoiceChannels } from '../../../lib/db/schema';
import { forgetVoiceChannel, listFinishedMatchVoiceChannels, scheduleVoiceCleanup, protectedVoiceChannelIds, type AutoVoiceChannelRow } from '../../../src/lib/matches/voice';
import { logger } from '../../../src/lib/logger/server';

export function isUnknownChannel(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 10003;
}

async function recordFailure(ex: Executor, row: AutoVoiceChannelRow, error: unknown) {
  const attempts = row.cleanup_attempts + 1;
  const message = error instanceof Error ? error.message : String(error);
  const next = new Date(Date.now() + Math.min(60_000 * 2 ** Math.min(attempts - 1, 6), 3_600_000));
  await ex.update(autoVoiceChannels).set({ cleanup_attempts: attempts, last_error: message, next_attempt_at: next })
    .where(eq(autoVoiceChannels.channel_id, row.channel_id));
  logger.warning(`Voice cleanup failed for match ${row.match_id}, channel ${row.channel_id}; retry ${next.toISOString()}:`, error);
}

/** Only confirmed deletion/missing channels release ownership. */
export async function deleteTrackedVoiceChannel(client: Client, ex: Executor, row: AutoVoiceChannelRow): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(row.channel_id, { force: true });
    if (channel) {
      if ((await protectedVoiceChannelIds(ex)).has(row.channel_id)) return false;
      const members = (channel as unknown as { members?: { size: number } }).members;
      if (!members || members.size > 0) return false;
      await channel.delete();
    }
  } catch (error) {
    if (!isUnknownChannel(error)) {
      await recordFailure(ex, row, error);
      return false;
    }
  }
  await forgetVoiceChannel(ex, row.channel_id);
  logger.info(`Deleted auto-created voice channel ${row.channel_id} for match ${row.match_id}`);
  return true;
}

export class VoiceChannelEmptinessMonitor {
  private emptyCheckCounts = new Map<string, number>();
  private running = false;

  constructor(private client: Client, private requiredEmptyChecks = 2, private executor: Executor = db) {}

  async runCheck(): Promise<void> {
    if (this.running || !this.client.isReady()) return;
    this.running = true;
    try {
      let tracked = await listFinishedMatchVoiceChannels(this.executor);
      for (const matchId of new Set(tracked.filter((r) => !r.cleanup_after).map((r) => r.match_id))) {
        await scheduleVoiceCleanup(this.executor, matchId);
      }
      tracked = await listFinishedMatchVoiceChannels(this.executor);
      const groups = new Map<string, AutoVoiceChannelRow[]>();
      for (const row of tracked) groups.set(row.match_id, [...(groups.get(row.match_id) ?? []), row]);
      for (const key of this.emptyCheckCounts.keys()) if (!groups.has(key)) this.emptyCheckCounts.delete(key);
      for (const [matchId, rows] of groups) {
        const now = Date.now();
        if (rows.some((r) => !r.cleanup_after || r.cleanup_after.getTime() > now || (r.next_attempt_at && r.next_attempt_at.getTime() > now))) {
          this.emptyCheckCounts.delete(matchId);
          continue;
        }
        const protectedIds = await protectedVoiceChannelIds(this.executor);
        if (rows.some((r) => protectedIds.has(r.channel_id)) || await this.hasOccupants(rows)) {
          this.emptyCheckCounts.delete(matchId);
          continue;
        }
        const count = (this.emptyCheckCounts.get(matchId) ?? 0) + 1;
        this.emptyCheckCounts.set(matchId, count);
        if (count < this.requiredEmptyChecks) continue;
        for (const row of rows) {
          // Recheck occupancy immediately before deletion, including between team deletions.
          const occupied = await this.hasOccupants(rows);
          if (occupied) break;
          await deleteTrackedVoiceChannel(this.client, this.executor, row);
        }
        this.emptyCheckCounts.delete(matchId);
      }
    } catch (error) {
      logger.error('Error running voice channel cleanup:', error);
    } finally {
      this.running = false;
    }
  }

  private async hasOccupants(rows: AutoVoiceChannelRow[]): Promise<boolean> {
    for (const row of rows) {
      try {
        const channel = await this.client.channels.fetch(row.channel_id, { force: true });
        if (channel) {
          const members = (channel as unknown as { members?: { size: number } }).members;
          if (!members || members.size > 0) return true;
        }
      } catch (error) {
        if (!isUnknownChannel(error)) { await recordFailure(this.executor, row, error); return true; }
      }
    }
    return false;
  }
}
