import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { AIExtractor } from '../../../../../processes/stats-processor/modules/ai-extractor';
import { AI_PROVIDER_CALLS } from '../../../../../processes/stats-processor/modules/providers';
import type { GameStatDefinition } from '../../../../../shared/types';
import { logger } from '@/lib/logger';
import { resolveModelId } from '@/lib/ai-model-resolver';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const db = await getDbInstance();
    const games = await db.all<{ id: string; name: string }>(
      `SELECT DISTINCT g.id, g.name
       FROM games g
       INNER JOIN game_stat_definitions gsd ON g.id = gsd.game_id
       ORDER BY g.name`
    );
    return NextResponse.json(games);
  } catch (error) {
    logger.error('Error fetching AI test games:', error);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const gameId = formData.get('game') as string;
    const imageFile = formData.get('image') as File | null;

    if (!gameId) {
      return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
    }
    if (!imageFile) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json({ error: 'Invalid file type. Must be jpeg, png, webp, or gif.' }, { status: 400 });
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (imageFile.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    const db = await getDbInstance();

    const statDefs = await db.all<GameStatDefinition>(
      'SELECT * FROM game_stat_definitions WHERE game_id = ? ORDER BY sort_order',
      [gameId]
    );
    if (!statDefs || statDefs.length === 0) {
      return NextResponse.json({ error: `No stat definitions found for game ${gameId}` }, { status: 400 });
    }

    const game = await db.get<{ name: string }>('SELECT name FROM games WHERE id = ?', [gameId]);
    if (!game) {
      return NextResponse.json({ error: `Game ${gameId} not found` }, { status: 404 });
    }

    const settings = await db.get<{ ai_providers_config?: string; ai_api_key?: string; ai_model: string; google_api_key?: string; openrouter_api_key?: string }>(
      'SELECT ai_providers_config, ai_api_key, ai_model, google_api_key, openrouter_api_key FROM stats_settings WHERE id = 1'
    );

    // Parse provider config supporting both old format ({ id, model, enabled }) and new format ({ instanceId, providerId, model })
    type EnabledProvider = { providerId: string; model: string; sortOrder: number };
    let enabledProviders: EnabledProvider[] = [];
    if (settings?.ai_providers_config) {
      const parsed = JSON.parse(settings.ai_providers_config) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (parsed[0].instanceId !== undefined) {
          // New format — presence in list means enabled
          enabledProviders = parsed.map((p, i) => ({ providerId: p.providerId as string, model: p.model as string, sortOrder: (p.sortOrder as number) ?? i }));
        } else {
          // Old format — filter by enabled flag
          enabledProviders = (parsed as Array<{ id: string; model: string; enabled: boolean; sortOrder: number }>)
            .filter(p => p.enabled)
            .map(p => ({ providerId: p.id, model: p.model, sortOrder: p.sortOrder }));
        }
      }
    } else if (settings?.ai_api_key) {
      enabledProviders = [{ providerId: 'anthropic', model: settings.ai_model || 'sonnet', sortOrder: 0 }];
    }
    enabledProviders.sort((a, b) => a.sortOrder - b.sortOrder);

    if (enabledProviders.length === 0) {
      return NextResponse.json({ error: 'No providers enabled. Configure them in Stats Settings.' }, { status: 400 });
    }

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = imageFile.type;

    const extractor = new AIExtractor(null);
    const prompt = extractor.buildPrompt(statDefs, game.name);

    const PROVIDER_TIMEOUT_MS = 30_000;
    const results = await Promise.all(
      enabledProviders.map(async (provider) => {
        const apiKey = provider.providerId === 'anthropic' ? settings?.ai_api_key
          : provider.providerId === 'google' ? settings?.google_api_key
          : settings?.openrouter_api_key;
        if (!apiKey) {
          return { provider: provider.providerId, model: provider.model, error: 'API key not configured' };
        }
        const callProvider = AI_PROVIDER_CALLS[provider.providerId];
        if (!callProvider) {
          return { provider: provider.providerId, model: provider.model, error: `Unknown provider: ${provider.providerId}` };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
        try {
          const rawResponse = await callProvider(apiKey, resolveModelId(provider.providerId, provider.model), imageBase64, mimeType, prompt, controller.signal);
          return { provider: provider.providerId, model: provider.model, rawResponse };
        } catch (err) {
          const isTimeout = err instanceof Error && err.name === 'AbortError';
          const message = isTimeout ? `Timed out after ${PROVIDER_TIMEOUT_MS / 1000}s` : (err instanceof Error ? err.message : String(err));
          return { provider: provider.providerId, model: provider.model, error: message };
        } finally {
          clearTimeout(timer);
        }
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    logger.error('Error running AI extraction test:', error);
    return NextResponse.json({ error: 'Failed to run AI test' }, { status: 500 });
  }
}
