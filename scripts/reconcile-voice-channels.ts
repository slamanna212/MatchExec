/** Read-only by default. --apply restores tracking; only the bot performs deletion after delay/empty checks. */
import { readFile } from 'node:fs/promises';
import { REST, Routes } from 'discord.js';
import { db, closeDb } from '../lib/db';
import { autoVoiceChannels, discordBotRequests, discordChannels, matches, matchTeams, teamVoiceChannels } from '../lib/db/schema';
import { getAnyDiscordSettings } from '../src/lib/settings';
import { applyVoiceRecovery, classifyVoiceRecovery, parseVoiceCreationLog, type VoiceEvidence, type RecoveryChannel } from '../src/lib/matches/voice-recovery';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const logs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--log' && args[i + 1]) logs.push(args[++i]);
    else if (args[i] !== '--apply') throw new Error('Usage: pnpm reconcile:voice [--log bot-output.log] [--apply]');
  }
  const settings = await getAnyDiscordSettings(db);
  if (!settings?.bot_token || !settings.guild_id) throw new Error('Discord settings are missing');
  const rest = new REST().setToken(settings.bot_token);
  const channels = await rest.get(Routes.guildChannels(settings.guild_id)) as RecoveryChannel[];
  const evidence: VoiceEvidence[] = (await db.select().from(autoVoiceChannels)).map((r) => ({ channelId: r.channel_id, matchId: r.match_id, source: 'tracking' }));
  for (const r of await db.select().from(discordBotRequests)) {
    const data = r.data as { matchId?: string; channelId?: string } | null;
    const result = r.result as { channelIds?: string[]; blueChannelId?: string; redChannelId?: string } | null;
    if (!data?.matchId) continue;
    const ids = r.type === 'voice_channel_create' ? result?.channelIds ?? [result?.blueChannelId, result?.redChannelId] : r.type === 'voice_channel_delete' ? [data.channelId] : [];
    for (const channelId of ids) if (channelId) evidence.push({ channelId, matchId: data.matchId, source: `request:${r.id}` });
  }
  for (const path of logs) evidence.push(...parseVoiceCreationLog(await readFile(path, 'utf8'), `log:${path}`));
  const warnings: string[] = [];
  try {
    const self = await rest.get(Routes.user('@me')) as { id: string };
    let before: string | undefined;
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ action_type: '10', limit: '100', user_id: self.id, ...(before ? { before } : {}) });
      const result = await rest.get(Routes.guildAuditLog(settings.guild_id), { query }) as { audit_log_entries: Array<{ id: string; user_id?: string; target_id?: string; reason?: string }> };
      for (const entry of result.audit_log_entries) {
        const matchId = entry.reason?.match(/^MatchExec voice match (\S+)$/)?.[1];
        if (entry.user_id === self.id && entry.target_id && matchId) evidence.push({ channelId: entry.target_id, matchId, source: `audit:${entry.id}` });
      }
      if (result.audit_log_entries.length < 100) break;
      before = result.audit_log_entries.at(-1)!.id;
      if (page === 9) warnings.push('Audit scan capped at 1,000 entries; older crash-gap channels may remain unattributed.');
    }
  } catch {
    warnings.push('Audit history unavailable; crash-gap channels without recorded IDs remain ambiguous.');
  }
  async function classify() {
    const matchRows = await db.select({ id: matches.id, status: matches.status }).from(matches);
    const active = new Set(matchRows.filter((m) => !['complete', 'cancelled'].includes(m.status)).map((m) => m.id));
    const permanentIds = new Set((await db.select().from(discordChannels)).map((c) => c.discord_channel_id));
    const legacy = await db.select().from(teamVoiceChannels);
    const teams = await db.select().from(matchTeams);
    const activeChannelIds = new Set([
      ...legacy.filter((r) => active.has(r.match_id)).map((r) => r.channel_id),
      ...teams.filter((r) => active.has(r.match_id)).map((r) => r.voice_channel_id).filter((id): id is string => !!id),
    ]);
    return classifyVoiceRecovery({ evidence, channels, permanentIds, matches: matchRows, activeChannelIds, categoryId: settings!.voice_channel_category_id });
  }
  const report = await classify();
  const scheduled = apply ? await applyVoiceRecovery(db, await classify()) : 0;
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', scheduled, warnings, channels: report }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Recovery failed'); process.exitCode = 1; }).finally(closeDb);
