/** `/api/stats` (dashboard totals) and `/api/settings/stats` (AI providers + stats switches). */
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import { logger } from '@/lib/logger';
import { getTournamentCounts } from '@/lib/tournaments';
import { getDiscordSettings, updateDiscordSettings } from '@/lib/settings';
import {
  getMatchOverviewCounts, getStatsSettings, listConfiguredProviders, providerApiKey, saveStatsSettings, type ProviderInput,
} from '@/lib/stats';
import { jsonError } from '../http';

export const stats = new Hono().get('/', async (c) => {
  try {
    const [matchCounts, tournaments] = await Promise.all([getMatchOverviewCounts(db), getTournamentCounts(db)]);
    return c.json({
      totalMatches: matchCounts.totalMatches,
      totalTournaments: tournaments.tournaments,
      totalSignups: matchCounts.matchParticipants + tournaments.participants,
    });
  } catch (error) {
    logger.error('Error fetching stats:', error);
    return jsonError(c, 'Failed to fetch stats');
  }
});

export const statsSettingsRoutes = new Hono()
  .get('/', async (c) => {
    try {
      const [settings, discord] = await Promise.all([getStatsSettings(db), getDiscordSettings(db)]);
      const winnerVoteEnabled = Boolean(discord?.winner_vote_enabled ?? true);

      if (!settings) return c.json({ enabled: false, providers: [], winner_vote_enabled: winnerVoteEnabled });

      const providers = listConfiguredProviders(settings).map((p) => ({
        instanceId: p.instanceId,
        providerId: p.providerId,
        model: p.model,
        hasKey: !!providerApiKey(settings, p.providerId),
      }));

      return c.json({
        enabled: Boolean(settings.enabled),
        providers,
        both_sides_required: Boolean(settings.both_sides_required),
        auto_advance_on_match: Boolean(settings.auto_advance_on_match),
        winner_vote_enabled: winnerVoteEnabled,
        stats_report_dm_enabled: Boolean(settings.stats_report_dm_enabled),
      });
    } catch (error) {
      logger.error('Error fetching stats settings:', error);
      return jsonError(c, 'Failed to fetch stats settings');
    }
  })
  .put('/', async (c) => {
    try {
      const body = await c.req.json();
      await db.transaction(async (tx) => {
        await saveStatsSettings(tx, {
          enabled: body.enabled !== undefined ? !!body.enabled : undefined,
          providers: Array.isArray(body.providers) ? (body.providers as ProviderInput[]) : undefined,
          stats_report_dm_enabled: body.stats_report_dm_enabled !== undefined ? !!body.stats_report_dm_enabled : undefined,
        });
        if (body.winner_vote_enabled !== undefined) await updateDiscordSettings({ winner_vote_enabled: !!body.winner_vote_enabled }, tx);
      });
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error updating stats settings:', error);
      return jsonError(c, 'Failed to update stats settings');
    }
  });
