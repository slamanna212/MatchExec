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

interface ProviderInstanceConfig {
  instanceId: string;
  providerId: string;
  model: string;
  sortOrder: number;
}

interface LegacyProviderConfig {
  id: string;
  model: string;
  enabled: boolean;
  sortOrder: number;
}

function parseProvidersConfig(
  raw: string | null,
  anthropicKey: string | null,
  anthropicModel: string
): ProviderInstanceConfig[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Case 1: New format (has instanceId)
        if ((parsed[0] as Record<string, unknown>).instanceId !== undefined) {
          return parsed as ProviderInstanceConfig[];
        }
        // Case 2: Old format (has id + enabled) — migrate enabled providers only
        const legacy = parsed as LegacyProviderConfig[];
        return legacy
          .filter(p => p.enabled)
          .map(p => ({
            instanceId: `${p.id}-${p.model}`,
            providerId: p.id,
            model: p.model,
            sortOrder: p.sortOrder,
          }));
      }
    } catch {
      // fall through
    }
  }
  // Case 3: No config — legacy: if anthropicKey exists, produce one instance
  if (anthropicKey) {
    return [{
      instanceId: `anthropic-${anthropicModel}`,
      providerId: 'anthropic',
      model: anthropicModel,
      sortOrder: 0,
    }];
  }
  return [];
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
        providers: [],
      });
    }

    const providersConfig = parseProvidersConfig(
      settings.ai_providers_config,
      settings.ai_api_key,
      settings.ai_model || 'claude-sonnet-4-20250514'
    );

    const providers = providersConfig.map(p => ({
      instanceId: p.instanceId,
      providerId: p.providerId,
      model: p.model,
      hasKey: p.providerId === 'anthropic' ? !!settings.ai_api_key : !!settings.google_api_key,
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
      const providers = body.providers as Array<{ instanceId: string; providerId: string; model: string; sortOrder: number; apiKey?: string }>;

      // Store config without API keys
      const configToStore: ProviderInstanceConfig[] = providers.map(p => ({
        instanceId: p.instanceId,
        providerId: p.providerId,
        model: p.model,
        sortOrder: p.sortOrder,
      }));
      updateFields.push('ai_providers_config = ?');
      updateValues.push(JSON.stringify(configToStore));

      // Update API keys per provider type (one key shared across all instances of that provider)
      const anthropicInstance = providers.find(p => p.providerId === 'anthropic' && p.apiKey !== undefined);
      if (anthropicInstance?.apiKey !== undefined) {
        updateFields.push('ai_api_key = ?');
        updateValues.push(anthropicInstance.apiKey || null);
      }

      const googleInstance = providers.find(p => p.providerId === 'google' && p.apiKey !== undefined);
      if (googleInstance?.apiKey !== undefined) {
        updateFields.push('google_api_key = ?');
        updateValues.push(googleInstance.apiKey || null);
      }

      // Keep legacy fields in sync with the first provider
      const firstProvider = [...providers].sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (firstProvider) {
        updateFields.push('ai_provider = ?');
        updateValues.push(firstProvider.providerId);
        updateFields.push('ai_model = ?');
        updateValues.push(firstProvider.model);
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
