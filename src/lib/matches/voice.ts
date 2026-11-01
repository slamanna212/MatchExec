/** Voice-channel state tied to matches: auto-created channel tracking, announcement alternation and channel lookups. */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { autoVoiceChannels, matchTeams, matchVoiceAlternation, matches } from '../../../lib/db/schema';
import { genId } from './ids';

export type AutoVoiceChannelRow = typeof autoVoiceChannels.$inferSelect;

export async function listAutoVoiceChannels(ex: Executor, matchId: string): Promise<AutoVoiceChannelRow[]> {
  return ex.select().from(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, matchId)).orderBy(asc(autoVoiceChannels.created_at), asc(autoVoiceChannels.id));
}

/** Track auto-created channels for later cleanup. `team_name` is 'blue' | 'red' | 'teamN' | 'all'. */
export async function trackAutoVoiceChannels(ex: Executor, matchId: string, channels: Array<{ channelId: string; teamName: string }>): Promise<void> {
  if (channels.length === 0) return;
  await ex.insert(autoVoiceChannels).values(channels.map((c) => ({ id: genId('auto_voice'), match_id: matchId, channel_id: c.channelId, team_name: c.teamName })));
}

export async function clearAutoVoiceChannels(ex: Executor, matchId: string): Promise<void> {
  await ex.delete(autoVoiceChannels).where(eq(autoVoiceChannels.match_id, matchId));
}

/** Auto-created channels of matches that are complete or cancelled (or gone), for the bot's emptiness monitor. */
export async function listAutoVoiceChannelsByMatches(ex: Executor, matchIds: string[]): Promise<AutoVoiceChannelRow[]> {
  if (matchIds.length === 0) return [];
  return ex.select().from(autoVoiceChannels).where(inArray(autoVoiceChannels.match_id, matchIds));
}

/** Which team announced first last time ('blue' | 'red'), for alternating voice announcements. */
export async function getLastFirstTeam(ex: Executor, matchId: string): Promise<string | undefined> {
  const [row] = await ex.select({ last_first_team: matchVoiceAlternation.last_first_team }).from(matchVoiceAlternation).where(eq(matchVoiceAlternation.match_id, matchId));
  return row?.last_first_team ?? undefined;
}

/** The team that should be announced first this time: blue unless blue went first last time... (red -> blue, else red). */
export async function nextFirstTeam(ex: Executor, matchId: string): Promise<'blue' | 'red'> {
  const last = await getLastFirstTeam(ex, matchId);
  return !last || last === 'red' ? 'blue' : 'red';
}

export async function recordFirstTeam(ex: Executor, matchId: string, firstTeam: 'blue' | 'red'): Promise<void> {
  const now = new Date();
  await ex.insert(matchVoiceAlternation)
    .values({ match_id: matchId, current_team: firstTeam, last_first_team: firstTeam, last_updated_at: now, updated_at: now })
    .onConflictDoUpdate({ target: matchVoiceAlternation.match_id, set: { current_team: firstTeam, last_first_team: firstTeam, last_updated_at: now, updated_at: now } });
}

/** Voice channel ids of the first two active teams: blue (team_order 0) and red (team_order 1). */
export async function getBlueRedChannels(ex: Executor, matchId: string): Promise<{ blue?: string; red?: string }> {
  const rows = await ex.select({ team_order: matchTeams.team_order, voice_channel_id: matchTeams.voice_channel_id }).from(matchTeams)
    .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false), inArray(matchTeams.team_order, [0, 1])));
  return {
    blue: rows.find((r) => r.team_order === 0)?.voice_channel_id ?? undefined,
    red: rows.find((r) => r.team_order === 1)?.voice_channel_id ?? undefined,
  };
}

/** Distinct voice channel ids across a match's non-reserve teams, in team order (N-team aware). */
export async function listTeamVoiceChannelIds(ex: Executor, matchId: string): Promise<string[]> {
  const rows = await ex.select({ voice_channel_id: matchTeams.voice_channel_id }).from(matchTeams)
    .where(and(eq(matchTeams.match_id, matchId), eq(matchTeams.is_reserve, false))).orderBy(asc(matchTeams.team_order));
  return [...new Set(rows.map((r) => r.voice_channel_id).filter((id): id is string => !!id))];
}

/** Auto-created channels of matches that are complete or cancelled (candidates for the emptiness monitor). */
export async function listFinishedMatchVoiceChannels(ex: Executor): Promise<Array<{ match_id: string; channel_id: string }>> {
  return ex.select({ match_id: autoVoiceChannels.match_id, channel_id: autoVoiceChannels.channel_id })
    .from(autoVoiceChannels).innerJoin(matches, eq(matches.id, autoVoiceChannels.match_id))
    .where(inArray(matches.status, ['complete', 'cancelled']))
    .orderBy(asc(autoVoiceChannels.created_at), asc(autoVoiceChannels.id));
}
