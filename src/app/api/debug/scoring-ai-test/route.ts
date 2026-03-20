import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '../../../../lib/database-init';
import { AIExtractor } from '../../../../../processes/stats-processor/modules/ai-extractor';
import type { GameStatDefinition } from '../../../../../shared/types';
import { logger } from '@/lib/logger';

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

    const settings = await db.get<{ ai_providers_config?: string; ai_api_key?: string; ai_model: string; google_api_key?: string }>(
      'SELECT ai_providers_config, ai_api_key, ai_model, google_api_key FROM stats_settings WHERE id = 1'
    );

    const providersConfig = settings?.ai_providers_config
      ? JSON.parse(settings.ai_providers_config)
      : [{ id: 'anthropic', enabled: !!settings?.ai_api_key, model: settings?.ai_model || 'claude-sonnet-4-20250514', sortOrder: 0 }];
    const enabledProviders = (providersConfig as Array<{ id: string; model: string; enabled: boolean; sortOrder: number }>)
      .filter(p => p.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (enabledProviders.length === 0) {
      return NextResponse.json({ error: 'No providers enabled. Configure them in Stats Settings.' }, { status: 400 });
    }

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = imageFile.type;

    const extractor = new AIExtractor(null);
    const prompt = extractor.buildPrompt(statDefs, game.name);

    const results: Array<{ provider: string; model: string; rawResponse?: string; error?: string }> = [];

    for (const provider of enabledProviders) {
      const apiKey = provider.id === 'anthropic' ? settings?.ai_api_key : settings?.google_api_key;
      if (!apiKey) {
        results.push({ provider: provider.id, model: provider.model, error: 'API key not configured' });
        continue;
      }
      try {
        const rawResponse = provider.id === 'google'
          ? await extractor.callGeminiVisionAPI(apiKey, provider.model, imageBase64, mimeType, prompt)
          : await extractor.callClaudeVisionAPI(apiKey, provider.model, imageBase64, mimeType, prompt);
        results.push({ provider: provider.id, model: provider.model, rawResponse });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ provider: provider.id, model: provider.model, error: message });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    logger.error('Error running AI extraction test:', error);
    return NextResponse.json({ error: 'Failed to run AI test' }, { status: 500 });
  }
}
