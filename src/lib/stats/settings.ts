/** `stats_settings` (singleton row): AI provider configuration and stats feature switches. */
import { eq } from 'drizzle-orm';
import { db as defaultDb, type Executor } from '../../../lib/db';
import { statsSettings } from '../../../lib/db/schema';

export type StatsSettingsRow = typeof statsSettings.$inferSelect;

const SINGLETON_ID = 1;

export interface ProviderInstanceConfig {
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

export async function getStatsSettings(ex: Executor = defaultDb): Promise<StatsSettingsRow | undefined> {
  const [row] = await ex.select().from(statsSettings).where(eq(statsSettings.id, SINGLETON_ID)).limit(1);
  return row;
}

export async function isStatsEnabled(ex: Executor = defaultDb): Promise<boolean> {
  const [row] = await ex.select({ enabled: statsSettings.enabled }).from(statsSettings).where(eq(statsSettings.id, SINGLETON_ID)).limit(1);
  return !!row?.enabled;
}

/**
 * Normalises the stored `ai_providers_config`. Returns null when nothing was ever configured, otherwise the (possibly
 * empty) list of enabled providers. Handles both the current format (`instanceId`, presence = enabled) and the old
 * `{ id, model, enabled }` format (only enabled entries survive).
 */
export function parseProvidersConfig(raw: unknown): ProviderInstanceConfig[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  if ((raw[0] as Record<string, unknown>).instanceId !== undefined) {
    return (raw as Array<Record<string, unknown>>).map((p, i) => ({
      instanceId: String(p.instanceId),
      providerId: p.providerId as string,
      model: p.model as string,
      sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : i,
    }));
  }
  return (raw as unknown as LegacyProviderConfig[])
    .filter((p) => p.enabled)
    .map((p) => ({ instanceId: `${p.id}-${p.model}`, providerId: p.id, model: p.model, sortOrder: p.sortOrder }));
}

/** The settings page's provider list: the stored config, or (nothing configured) one Anthropic instance if a key exists. */
export function listConfiguredProviders(settings: Pick<StatsSettingsRow, 'ai_providers_config' | 'ai_api_key' | 'ai_model'>): ProviderInstanceConfig[] {
  const raw = settings.ai_providers_config;
  if (Array.isArray(raw) && raw.length > 0) return parseProvidersConfig(raw) ?? [];
  if (settings.ai_api_key) {
    const model = settings.ai_model || 'sonnet';
    return [{ instanceId: `anthropic-${model}`, providerId: 'anthropic', model, sortOrder: 0 }];
  }
  return [];
}

/** API key for a provider id (Anthropic, Google; every other id uses the OpenRouter key). */
export function providerApiKey(
  settings: Pick<StatsSettingsRow, 'ai_api_key' | 'google_api_key' | 'openrouter_api_key'> | undefined,
  providerId: string,
): string | null | undefined {
  if (providerId === 'anthropic') return settings?.ai_api_key;
  if (providerId === 'google') return settings?.google_api_key;
  return settings?.openrouter_api_key;
}

export interface ProviderInput {
  instanceId: string;
  providerId: string;
  model: string;
  sortOrder: number;
  /** undefined = leave the stored key alone; '' clears it. */
  apiKey?: string;
}

export interface StatsSettingsUpdate {
  enabled?: boolean;
  providers?: ProviderInput[];
  stats_report_dm_enabled?: boolean;
}

/** Create the singleton row if needed and apply the update in one statement. */
export async function saveStatsSettings(ex: Executor, input: StatsSettingsUpdate): Promise<void> {
  await ex.insert(statsSettings).values({ id: SINGLETON_ID }).onConflictDoNothing();
  const set: Partial<typeof statsSettings.$inferInsert> = {};

  if (input.enabled !== undefined) set.enabled = !!input.enabled;
  if (input.providers) {
    const providers = input.providers;
    // The stored config never contains API keys
    set.ai_providers_config = providers.map((p) => ({ instanceId: p.instanceId, providerId: p.providerId, model: p.model, sortOrder: p.sortOrder }));
    // One key per provider type, shared by all instances of that provider
    const anthropic = providers.find((p) => p.providerId === 'anthropic' && p.apiKey !== undefined);
    if (anthropic) set.ai_api_key = anthropic.apiKey || null;
    const google = providers.find((p) => p.providerId === 'google' && p.apiKey !== undefined);
    if (google) set.google_api_key = google.apiKey || null;
    const openrouter = providers.find((p) => p.providerId === 'openrouter' && p.apiKey !== undefined);
    if (openrouter) set.openrouter_api_key = openrouter.apiKey || null;
    // Legacy columns follow the first provider
    const first = [...providers].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (first) {
      set.ai_provider = first.providerId;
      set.ai_model = first.model;
    }
  }
  if (input.stats_report_dm_enabled !== undefined) set.stats_report_dm_enabled = !!input.stats_report_dm_enabled;

  if (Object.keys(set).length === 0) return;
  await ex.update(statsSettings).set({ ...set, updated_at: new Date() }).where(eq(statsSettings.id, SINGLETON_ID));
}
