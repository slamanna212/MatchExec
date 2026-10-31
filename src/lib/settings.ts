/**
 * Settings domain module: `app_settings` (key/value), `discord_settings`, `ui_settings`, `scheduler_settings`
 * and the `voices` list. Hono routes, the logger, the bot, the scheduler and the stats-processor all go through
 * here. Every function takes an `Executor` first so it can run inside a transaction.
 */
import { eq, inArray, asc } from 'drizzle-orm';
import { db as defaultDb, type Executor } from '../../lib/db';
import { appSettings, discordSettings, schedulerSettings, uiSettings, voices } from '../../lib/db/schema';

export type DiscordSettingsRow = typeof discordSettings.$inferSelect;
export type UiSettingsRow = typeof uiSettings.$inferSelect;
export type SchedulerSettingsRow = typeof schedulerSettings.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;

const SINGLETON_ID = 1;

// ─── app_settings (key/value) ────────────────────────────────────────────────

export async function getAppSettingRow(key: string, ex: Executor = defaultDb): Promise<AppSettingRow | undefined> {
  const rows = await ex.select().from(appSettings).where(eq(appSettings.setting_key, key)).limit(1);
  return rows[0];
}

/** Value of one setting, or `undefined` when the row does not exist. */
export async function getAppSetting(key: string, ex: Executor = defaultDb): Promise<string | undefined> {
  return (await getAppSettingRow(key, ex))?.setting_value;
}

/** Values for several keys as a map; missing keys are absent. */
export async function getAppSettings(keys: readonly string[], ex: Executor = defaultDb): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const rows = await ex
    .select({ k: appSettings.setting_key, v: appSettings.setting_value })
    .from(appSettings)
    .where(inArray(appSettings.setting_key, [...keys]));
  return Object.fromEntries(rows.map((r) => [r.k, r.v]));
}

/** Update an EXISTING setting. Returns false when the row does not exist (no row is created). */
export async function updateAppSetting(
  key: string,
  value: string,
  ex: Executor = defaultDb,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const rows = await ex
    .update(appSettings)
    .set({ setting_value: value, updated_at: new Date(), ...(metadata === undefined ? {} : { metadata }) })
    .where(eq(appSettings.setting_key, key))
    .returning({ k: appSettings.setting_key });
  return rows.length > 0;
}

/** Insert or update a setting (heartbeats and other process-owned keys). */
export async function setAppSetting(key: string, value: string, ex: Executor = defaultDb): Promise<void> {
  await ex
    .insert(appSettings)
    .values({ setting_key: key, setting_value: value })
    .onConflictDoUpdate({ target: appSettings.setting_key, set: { setting_value: value, updated_at: new Date() } });
}

// ─── discord_settings ────────────────────────────────────────────────────────

export async function getDiscordSettings(ex: Executor = defaultDb): Promise<DiscordSettingsRow | undefined> {
  const rows = await ex.select().from(discordSettings).where(eq(discordSettings.id, SINGLETON_ID)).limit(1);
  return rows[0];
}

/** First discord_settings row of any id (announcer GET and the voice/queue code used `LIMIT 1`). */
export async function getAnyDiscordSettings(ex: Executor = defaultDb): Promise<DiscordSettingsRow | undefined> {
  const rows = await ex.select().from(discordSettings).orderBy(asc(discordSettings.id)).limit(1);
  return rows[0];
}

export async function ensureDiscordSettingsRow(ex: Executor = defaultDb): Promise<void> {
  await ex.insert(discordSettings).values({ id: SINGLETON_ID, guild_id: '', bot_token: '' }).onConflictDoNothing();
}

export type DiscordSettingsPatch = Partial<Omit<typeof discordSettings.$inferInsert, 'id' | 'created_at' | 'updated_at'>>;

/** Ensure the singleton row exists, then apply `patch` (no-op when empty). */
export async function updateDiscordSettings(patch: DiscordSettingsPatch, ex: Executor = defaultDb): Promise<void> {
  await ensureDiscordSettingsRow(ex);
  if (Object.keys(patch).length === 0) return;
  await ex.update(discordSettings).set({ ...patch, updated_at: new Date() }).where(eq(discordSettings.id, SINGLETON_ID));
}

// ─── ui_settings ─────────────────────────────────────────────────────────────

export async function getUiSettings(ex: Executor = defaultDb): Promise<UiSettingsRow | undefined> {
  const rows = await ex.select().from(uiSettings).where(eq(uiSettings.id, SINGLETON_ID)).limit(1);
  return rows[0];
}

export async function setAutoRefreshInterval(seconds: number, ex: Executor = defaultDb): Promise<void> {
  await ex
    .insert(uiSettings)
    .values({ id: SINGLETON_ID, auto_refresh_interval_seconds: seconds })
    .onConflictDoUpdate({ target: uiSettings.id, set: { auto_refresh_interval_seconds: seconds, updated_at: new Date() } });
}

// ─── scheduler_settings ──────────────────────────────────────────────────────

export async function getSchedulerSettings(ex: Executor = defaultDb): Promise<SchedulerSettingsRow | undefined> {
  const rows = await ex.select().from(schedulerSettings).where(eq(schedulerSettings.id, SINGLETON_ID)).limit(1);
  return rows[0];
}

/** Update the cron expressions on the singleton row (creating it with defaults first when missing). */
export async function updateSchedulerCrons(
  crons: { match_check_cron?: string; channel_refresh_cron?: string },
  ex: Executor = defaultDb,
): Promise<SchedulerSettingsRow> {
  const set = {
    ...(crons.match_check_cron === undefined ? {} : { match_check_cron: crons.match_check_cron }),
    ...(crons.channel_refresh_cron === undefined ? {} : { channel_refresh_cron: crons.channel_refresh_cron }),
    updated_at: new Date(),
  };
  const [row] = await ex
    .insert(schedulerSettings)
    .values({ id: SINGLETON_ID, ...set })
    .onConflictDoUpdate({ target: schedulerSettings.id, set })
    .returning();
  return row;
}

// ─── voices ──────────────────────────────────────────────────────────────────

export async function listVoices(ex: Executor = defaultDb): Promise<Array<{ id: string; name: string; path: string }>> {
  return ex.select({ id: voices.id, name: voices.name, path: voices.path }).from(voices).orderBy(asc(voices.name));
}
