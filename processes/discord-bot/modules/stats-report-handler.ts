import type { Client } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { Database } from '../../../lib/database/connection';
import { sendDM } from './dm-builder';
import { logger } from '../../../src/lib/logger/server';

interface StatsSettingsRow {
  enabled: number;
  stats_report_dm_enabled: number;
}

interface MatchInfoRow {
  id: string;
  name: string;
  game_id: string;
  game_name: string;
  game_color: string | null;
}

interface ParticipantStatsRow {
  participant_id: string;
  discord_user_id: string;
  username: string;
  team_assignment: string | null;
  signup_data: string | null;
  total_stats_json: string;
  maps_played: number;
}

interface GameStatDefinition {
  id: string;
  name: string;
  display_name: string;
  stat_type: string;
  category: string | null;
  sort_order: number;
  is_primary: number;
  format: string | null;
}

/**
 * Returns the player's primary role from their signup_data JSON.
 * Handles the per-game field name differences.
 */
export function getPlayerRole(signupData: string | null, gameId: string): string | null {
  if (!signupData) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(signupData) as Record<string, unknown>;
  } catch {
    return null;
  }

  let rawRole: unknown;

  if (gameId === 'overwatch2' || gameId === 'marvelrivals') {
    rawRole = parsed['roles'];
  } else if (gameId === 'valorant' || gameId === 'leagueoflegends' || gameId === 'r6siege') {
    rawRole = parsed['role_preference'];
  } else if (gameId === 'counterstrike2') {
    rawRole = parsed['preferred_role'];
  } else {
    return null;
  }

  if (!rawRole) return null;

  // May be a JSON array string (e.g. '["Tank","DPS"]') or plain string
  if (typeof rawRole === 'string') {
    const trimmed = rawRole.trim();
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed) as unknown[];
        if (Array.isArray(arr) && arr.length > 0) {
          return String(arr[0]).trim() || null;
        }
      } catch {
        // fall through
      }
    }
    // Comma-separated: "Tank, DPS, Support" → take first
    const first = trimmed.split(',')[0].trim();
    return first || null;
  }

  if (Array.isArray(rawRole) && rawRole.length > 0) {
    return String(rawRole[0]).trim() || null;
  }

  return null;
}

/**
 * Returns the ordered list of stat categories to prioritize for a given game/role.
 * Categories listed first will appear first in the DM.
 */
export function getRoleCategoryPriority(gameId: string, role: string | null): string[] {
  if (!role) return [];

  const normalized = role.toLowerCase().trim();

  if (gameId === 'overwatch2') {
    if (normalized.includes('tank')) return ['tank', 'combat', 'support'];
    if (normalized.includes('dps') || normalized.includes('damage')) return ['combat', 'tank', 'support'];
    if (normalized.includes('support') || normalized.includes('heal')) return ['support', 'combat', 'tank'];
    return [];
  }

  if (gameId === 'marvelrivals') {
    // Vanguard = tank role
    if (normalized.includes('vanguard') || normalized.includes('tank')) return ['combat', 'support'];
    // Duelist = DPS
    if (normalized.includes('duelist') || normalized.includes('dps') || normalized.includes('damage')) return ['combat', 'support'];
    // Strategist = support/healer
    if (normalized.includes('strategist') || normalized.includes('support') || normalized.includes('heal')) return ['support', 'combat'];
    return [];
  }

  return [];
}

/**
 * Sorts stat definitions by category priority, then by is_primary DESC and sort_order ASC within each category.
 */
export function sortStatDefs(
  statDefs: GameStatDefinition[],
  categoryPriority: string[]
): GameStatDefinition[] {
  if (categoryPriority.length === 0) {
    // No reordering — sort by is_primary DESC, sort_order ASC
    return [...statDefs].sort((a, b) => {
      if (b.is_primary !== a.is_primary) return b.is_primary - a.is_primary;
      return a.sort_order - b.sort_order;
    });
  }

  // Group by category
  const grouped = new Map<string, GameStatDefinition[]>();
  for (const def of statDefs) {
    const cat = def.category ?? '__none__';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(def);
  }

  // Sort within each group
  for (const [, group] of grouped) {
    group.sort((a, b) => {
      if (b.is_primary !== a.is_primary) return b.is_primary - a.is_primary;
      return a.sort_order - b.sort_order;
    });
  }

  // Determine ordered category list: prioritized first, then remaining in insertion order
  const remaining = [...grouped.keys()].filter(c => !categoryPriority.includes(c));
  const orderedCategories = [...categoryPriority.filter(c => grouped.has(c)), ...remaining];

  const result: GameStatDefinition[] = [];
  for (const cat of orderedCategories) {
    result.push(...(grouped.get(cat) ?? []));
  }

  return result;
}

/**
 * Formats a stat value according to its format specifier.
 */
export function formatStatValue(value: number, format: string | null): string {
  if (format === 'thousands') {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return String(Math.round(value));
  }
  if (format === 'decimal') {
    return value.toFixed(2);
  }
  if (format === 'percentage') {
    return `${Math.round(value)}%`;
  }
  return String(Math.round(value));
}

/**
 * Builds the personalized stats embed for a player.
 */
export function buildStatsEmbed(
  participant: Pick<ParticipantStatsRow, 'username' | 'team_assignment' | 'signup_data' | 'maps_played'>,
  totalStats: Record<string, number>,
  statDefs: GameStatDefinition[],
  matchInfo: MatchInfoRow
): EmbedBuilder {
  const teamSide = participant.team_assignment;
  let color: number;
  if (teamSide === 'blue') {
    color = 0x5b9bd5;
  } else if (teamSide === 'red') {
    color = 0xe06c75;
  } else {
    // Parse game color or use a default
    if (matchInfo.game_color) {
      try {
        color = parseInt(matchInfo.game_color.replace('#', ''), 16);
      } catch {
        color = 0x5865F2;
      }
    } else {
      color = 0x5865F2;
    }
  }

  const role = getPlayerRole(participant.signup_data, matchInfo.game_id);
  const categoryPriority = getRoleCategoryPriority(matchInfo.game_id, role);
  const sortedDefs = sortStatDefs(statDefs, categoryPriority);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('📊 Your Match Stats')
    .setDescription(`**${matchInfo.name}** — ${matchInfo.game_name}`)
    .setFooter({ text: 'MatchExec Stats' });

  // Maps played field
  embed.addFields({
    name: '📅 Maps Played',
    value: String(participant.maps_played),
    inline: false,
  });

  // Role field (if available)
  if (role) {
    embed.addFields({
      name: '🎮 Role',
      value: role,
      inline: false,
    });
  }

  // Best stat: highest value primary stat from the first-priority category (or overall)
  const primaryDefs = sortedDefs.filter(d => d.is_primary === 1);
  let bestStat: { name: string; value: string } | null = null;
  if (primaryDefs.length > 0) {
    let bestDef: GameStatDefinition | null = null;
    let bestValue = -Infinity;
    for (const def of primaryDefs) {
      const val = totalStats[def.name];
      if (val !== undefined && val > bestValue) {
        bestValue = val;
        bestDef = def;
      }
    }
    if (bestDef && bestValue > 0) {
      bestStat = {
        name: bestDef.display_name,
        value: formatStatValue(bestValue, bestDef.format),
      };
    }
  }

  if (bestStat) {
    embed.addFields({
      name: '⭐ Best Stat',
      value: `**${bestStat.name}**: ${bestStat.value}`,
      inline: false,
    });
  }

  // Stat fields — cap at 21 to stay within Discord's 25-field limit
  // (3 fields already added above: Maps Played, Role, Best Stat)
  const statFields: Array<{ name: string; value: string; inline: boolean }> = [];
  for (const def of sortedDefs) {
    if (statFields.length >= 21) break;
    const val = totalStats[def.name];
    if (val === undefined) continue;
    statFields.push({
      name: def.display_name,
      value: formatStatValue(val, def.format),
      inline: true,
    });
  }

  if (statFields.length > 0) {
    embed.addFields(...statFields);
  }

  return embed;
}

export class StatsReportHandler {
  constructor(
    private db: Database,
    private client: Client
  ) {}

  async processMatch(matchId: string): Promise<void> {
    // Check settings
    const settings = await this.db.get<StatsSettingsRow>(
      'SELECT enabled, stats_report_dm_enabled FROM stats_settings WHERE id = 1'
    );
    if (!settings?.enabled || !settings?.stats_report_dm_enabled) {
      logger.debug(`📊 Stats report DMs disabled for match ${matchId}`);
      return;
    }

    // Get match info
    const matchInfo = await this.db.get<MatchInfoRow>(
      `SELECT m.id, m.name, m.game_id, g.name as game_name, g.color as game_color
       FROM matches m
       LEFT JOIN games g ON m.game_id = g.id
       WHERE m.id = ?`,
      [matchId]
    );
    if (!matchInfo) {
      logger.warning(`📊 Match ${matchId} not found for stats report DMs`);
      return;
    }

    // Get stat definitions for the game
    const statDefs = await this.db.all<GameStatDefinition>(
      `SELECT id, name, display_name, stat_type, category, sort_order, is_primary, format
       FROM game_stat_definitions
       WHERE game_id = ?
       ORDER BY sort_order ASC`,
      [matchInfo.game_id]
    );
    if (!statDefs || statDefs.length === 0) {
      logger.debug(`📊 No stat definitions for game ${matchInfo.game_id}, skipping stats report DMs`);
      return;
    }

    // Get participants with stats that haven't been DM'd yet
    const participants = await this.db.all<ParticipantStatsRow>(
      `SELECT mps.participant_id, mp.discord_user_id, mp.username,
              mp.team_assignment, mp.signup_data,
              mps.total_stats_json, mps.maps_played
       FROM match_player_stats mps
       JOIN match_participants mp ON mps.participant_id = mp.id
       WHERE mps.match_id = ?
         AND mps.stats_dm_sent = 0
         AND mps.total_stats_json IS NOT NULL
         AND mp.discord_user_id IS NOT NULL
         AND mp.discord_user_id != ''`,
      [matchId]
    );

    if (!participants || participants.length === 0) {
      logger.debug(`📊 No participants to DM for match ${matchId} (all sent or no stats)`);
      return;
    }

    logger.info(`📊 Sending stats report DMs to ${participants.length} participant(s) for match ${matchId}`);

    for (const participant of participants) {
      try {
        let totalStats: Record<string, number> = {};
        try {
          totalStats = JSON.parse(participant.total_stats_json) as Record<string, number>;
        } catch {
          logger.warning(`📊 Could not parse total_stats_json for participant ${participant.participant_id}`);
        }

        const embed = buildStatsEmbed(participant, totalStats, statDefs, matchInfo);
        await sendDM(this.client, participant.discord_user_id, embed);

        // Mark as sent
        await this.db.run(
          'UPDATE match_player_stats SET stats_dm_sent = 1 WHERE match_id = ? AND participant_id = ?',
          [matchId, participant.participant_id]
        );

        logger.debug(`📊 Stats report DM sent to ${participant.username} (${participant.discord_user_id})`);
      } catch (error) {
        logger.error(`📊 Error sending stats report DM to ${participant.username}:`, error);
        // Continue to next participant — don't abort the whole batch
      }
    }
  }
}
