/** `/api/debug/*`: developer tools, 404 unless `ENABLE_DEBUG_ROUTES=true`. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { db } from '../../../lib/db';
import { DiscordBotService } from '../../../lib/discord-bot-service';
import { AIExtractor } from '../../../processes/stats-processor/modules/ai-extractor';
import { AI_PROVIDER_CALLS } from '../../../processes/stats-processor/modules/providers';
import type { GameStatDefinition } from '../../../shared/types';
import { getGame, listGamesWithStatDefinitions, listStatDefinitions } from '@/lib/games';
import { getStatsSettings, parseProvidersConfig, providerApiKey } from '@/lib/stats';
import { getDiscordSettings } from '@/lib/settings';
import { logFeedEvent } from '@/lib/feed-helpers';
import { resolveModelId } from '@/lib/ai-model-resolver';
import { isAllowedImageType } from '@/lib/uploads';
import { logger } from '@/lib/logger';
import { jsonError } from '../http';

const PROVIDER_TIMEOUT_MS = 30_000;
const MAX_TEST_IMAGE_BYTES = 10 * 1024 * 1024;

export const debug = new Hono()
  .use('*', async (c, next) => {
    if (process.env.ENABLE_DEBUG_ROUTES !== 'true') return jsonError(c, 'Not found', 404);
    return next();
  })

  .get('/scoring-ai-test', async (c) => {
    try {
      return c.json(await listGamesWithStatDefinitions(db));
    } catch (error) {
      logger.error('Error fetching AI test games:', error);
      return jsonError(c, 'Failed to fetch games');
    }
  })

  .post('/scoring-ai-test', async (c) => {
    try {
      const form = await c.req.formData();
      const gameId = form.get('game');
      const imageFile = form.get('image');

      if (!gameId || typeof gameId !== 'string') return jsonError(c, 'Game ID is required', 400);
      if (!imageFile || typeof imageFile === 'string') return jsonError(c, 'Image file is required', 400);
      if (!isAllowedImageType(imageFile.type)) return jsonError(c, 'Invalid file type. Must be jpeg, png, webp, or gif.', 400);
      if (imageFile.size > MAX_TEST_IMAGE_BYTES) return jsonError(c, 'File too large. Maximum size is 10MB.', 400);

      const statDefs = await listStatDefinitions(db, gameId) as GameStatDefinition[];
      if (!statDefs || statDefs.length === 0) return jsonError(c, `No stat definitions found for game ${gameId}`, 400);

      const game = await getGame(db, gameId);
      if (!game) return jsonError(c, `Game ${gameId} not found`, 404);

      const settings = await getStatsSettings(db);

      // Stored config is either the current format or the old { id, model, enabled } one (parseProvidersConfig handles both)
      let enabledProviders = parseProvidersConfig(settings?.ai_providers_config) ?? [];
      if (!settings?.ai_providers_config && settings?.ai_api_key) {
        enabledProviders = [{ instanceId: 'anthropic', providerId: 'anthropic', model: settings.ai_model || 'sonnet', sortOrder: 0 }];
      }
      enabledProviders = [...enabledProviders].sort((a, b) => a.sortOrder - b.sortOrder);
      if (enabledProviders.length === 0) return jsonError(c, 'No providers enabled. Configure them in Stats Settings.', 400);

      const imageBase64 = Buffer.from(await imageFile.arrayBuffer()).toString('base64');
      const mimeType = imageFile.type;
      const prompt = new AIExtractor().buildPrompt(statDefs, game.name);

      const results = await Promise.all(enabledProviders.map(async (provider) => {
        const apiKey = providerApiKey(settings, provider.providerId);
        if (!apiKey) return { provider: provider.providerId, model: provider.model, error: 'API key not configured' };
        const callProvider = AI_PROVIDER_CALLS[provider.providerId];
        if (!callProvider) return { provider: provider.providerId, model: provider.model, error: `Unknown provider: ${provider.providerId}` };
        const resolvedModel = resolveModelId(provider.providerId, provider.model);
        logger.debug(`AI test: calling ${provider.providerId} with model ${resolvedModel}`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
        try {
          const rawResponse = await callProvider(apiKey, resolvedModel, imageBase64, mimeType, prompt, controller.signal);
          logger.debug(`AI test: ${provider.providerId} (${resolvedModel}) succeeded`);
          return { provider: provider.providerId, model: provider.model, rawResponse };
        } catch (err) {
          const isTimeout = err instanceof Error && err.name === 'AbortError';
          const message = isTimeout ? `Timed out after ${PROVIDER_TIMEOUT_MS / 1000}s` : (err instanceof Error ? err.message : String(err));
          logger.warning(`AI test: ${provider.providerId} (${resolvedModel}) failed: ${message}`);
          return { provider: provider.providerId, model: provider.model, error: message };
        } finally {
          clearTimeout(timer);
        }
      }));

      return c.json({ results });
    } catch (error) {
      logger.error('Error running AI extraction test:', error);
      return jsonError(c, 'Failed to run AI test');
    }
  })

  .post('/test-voice', async (c) => {
    try {
      const settings = await getDiscordSettings(db);
      if (!settings?.voice_announcements_enabled) return jsonError(c, 'Voice announcements are disabled in settings', 400);

      const botService = new DiscordBotService();
      const requestId = await botService.requestVoiceTest('123546381628604420', settings.announcer_voice || 'wrestling-announcer');
      const result = await botService.waitForRequestCompletion(requestId);

      if (result.status === 'completed') return c.json(JSON.parse(result.result || '{}'));
      const errorData = JSON.parse(result.result || '{}');
      return jsonError(c, errorData.message || 'Voice test failed');
    } catch (error) {
      logger.error('Error testing voice lines:', error);
      return jsonError(c, 'Failed to test voice lines');
    }
  })

  .post('/trigger-update-event', async (c) => {
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      const currentVersion = `v${pkg.version}`;
      await logFeedEvent({
        eventType: 'update_available',
        priority: 2,
        title: 'MatchExec v9.9.9 is available',
        description: `You are running ${currentVersion}. A new release is available. (Debug event)`,
        metadata: {
          currentVersion,
          latestVersion: 'v9.9.9',
          releaseUrl: 'https://github.com/slamanna212/matchexec/releases/tag/v9.9.9',
        },
      });
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error triggering update event:', error);
      return jsonError(c, 'Failed to trigger update event');
    }
  });
