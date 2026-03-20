import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';

interface StatsSettingsRow {
  enabled: number;
  ai_provider: string;
  ai_api_key: string | null;
  ai_model: string;
  ai_providers_config: string | null;
  google_api_key: string | null;
  both_sides_required: number;
  auto_advance_on_match: number;
}

interface ProviderConfig {
  id: string;
  model: string;
  enabled: boolean;
  sortOrder: number;
}

const PROVIDER_DEFAULTS: ProviderConfig[] = [
  { id: 'anthropic', model: 'claude-sonnet-4-20250514', enabled: false, sortOrder: 0 },
  { id: 'google', model: 'gemini-2.0-flash', enabled: false, sortOrder: 1 },
];

function parseProvidersConfig(raw: string | null, anthropicKey: string | null, anthropicModel: string): ProviderConfig[] {
  if (raw) {
    try {
      return JSON.parse(raw) as ProviderConfig[];
    } catch {
      // fall through to legacy migration
    }
  }
  // Migrate from legacy single-provider fields
  return PROVIDER_DEFAULTS.map(p => {
    if (p.id === 'anthropic') {
      return { ...p, model: anthropicModel, enabled: !!anthropicKey };
    }
    return p;
  });
}

export async function GET() {
  try {
    const db = await getDbInstance();

    const settings = await db.get<StatsSettingsRow>(
      'SELECT enabled, ai_provider, ai_api_key, ai_model, ai_providers_config, google_api_key, both_sides_required, auto_advance_on_match FROM stats_settings WHERE id = 1'
    );

    if (!settings) {
      return NextResponse.json({
        enabled: false,
        both_sides_required: false,
        auto_advance_on_match: false,
        providers: PROVIDER_DEFAULTS.map(p => ({ id: p.id, model: p.model, enabled: false, hasKey: false })),
      });
    }

    const providersConfig = parseProvidersConfig(
      settings.ai_providers_config,
      settings.ai_api_key,
      settings.ai_model || 'claude-sonnet-4-20250514'
    );

    const providers = providersConfig.map(p => ({
      id: p.id,
      model: p.model,
      enabled: p.enabled,
      hasKey: p.id === 'anthropic' ? !!settings.ai_api_key : !!settings.google_api_key,
    }));

    return NextResponse.json({
      enabled: Boolean(settings.enabled),
      both_sides_required: Boolean(settings.both_sides_required),
      auto_advance_on_match: Boolean(settings.auto_advance_on_match),
      providers,
    });
  } catch (error) {
    logger.error('Error fetching stats settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await getDbInstance();
    const body = await request.json();

    await db.run('INSERT OR IGNORE INTO stats_settings (id) VALUES (1)');

    const updateFields: string[] = [];
    const updateValues: unknown[] = [];

    if (body.enabled !== undefined) {
      updateFields.push('enabled = ?');
      updateValues.push(body.enabled ? 1 : 0);
    }
    if (body.both_sides_required !== undefined) {
      updateFields.push('both_sides_required = ?');
      updateValues.push(body.both_sides_required ? 1 : 0);
    }
    if (body.auto_advance_on_match !== undefined) {
      updateFields.push('auto_advance_on_match = ?');
      updateValues.push(body.auto_advance_on_match ? 1 : 0);
    }

    if (Array.isArray(body.providers)) {
      const providers = body.providers as Array<{ id: string; model: string; enabled: boolean; sortOrder: number; apiKey?: string }>;

      // Store config without API keys
      const configToStore: ProviderConfig[] = providers.map(p => ({
        id: p.id,
        model: p.model,
        enabled: p.enabled,
        sortOrder: p.sortOrder,
      }));
      updateFields.push('ai_providers_config = ?');
      updateValues.push(JSON.stringify(configToStore));

      // Update API keys per provider
      const anthropic = providers.find(p => p.id === 'anthropic');
      if (anthropic?.apiKey !== undefined) {
        updateFields.push('ai_api_key = ?');
        updateValues.push(anthropic.apiKey || null);
      }

      const google = providers.find(p => p.id === 'google');
      if (google?.apiKey !== undefined) {
        updateFields.push('google_api_key = ?');
        updateValues.push(google.apiKey || null);
      }

      // Keep legacy fields in sync with the first enabled provider
      const firstEnabled = providers.filter(p => p.enabled).sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (firstEnabled) {
        updateFields.push('ai_provider = ?');
        updateValues.push(firstEnabled.id);
        updateFields.push('ai_model = ?');
        updateValues.push(firstEnabled.model);
      }
    }

    if (updateFields.length > 0) {
      await db.run(
        `UPDATE stats_settings SET ${updateFields.join(', ')} WHERE id = 1`,
        updateValues
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating stats settings:', error);
    return NextResponse.json(
      { error: 'Failed to update stats settings' },
      { status: 500 }
    );
  }
}
