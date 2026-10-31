/**
 * `/api/settings/*` (discord, announcer, ui, scheduler, log-level, feed-retention, update-check) plus the aggregate
 * `GET /api/settings`. Backup/restore and stats settings are still the old Next routes (Stage 6 / Stats domain).
 */
import { Hono, type Context } from 'hono';
import { logger } from '@/lib/logger';
import { validateNumberRange } from '@/lib/utils/validation';
import { restartDiscordBot } from '@/lib/discord-bot-restart';
import {
  getAnyDiscordSettings, getAppSetting, getAppSettings, getDiscordSettings, getSchedulerSettings, getUiSettings, listVoices,
  setAutoRefreshInterval, updateAppSetting, updateDiscordSettings, updateSchedulerCrons, type DiscordSettingsPatch,
} from '@/lib/settings';
import { UpdateCheckJob } from '../../../processes/scheduler/jobs/check-for-update';
import { jsonError } from '../http';
import { clientKey, checkRateLimit } from '../middleware/rate-limit';

const MASK = '••••••••';

async function readBody(c: Context): Promise<Record<string, any>> {
  const body = await c.req.json();
  return body && typeof body === 'object' ? body : {};
}

// ─── Discord settings ────────────────────────────────────────────────────────

const DISCORD_DURATION_FIELDS: Array<{ key: string; min: number; max: number }> = [
  { key: 'event_duration_minutes', min: 5, max: 720 },
  { key: 'match_reminder_minutes', min: 1, max: 1440 },
  { key: 'player_reminder_minutes', min: 1, max: 10080 },
];

const DISCORD_STRING_FIELDS = ['application_id', 'guild_id', 'announcement_role_id', 'voice_channel_category_id'] as const;
const DISCORD_BOOLEAN_FIELDS = [
  ['mention_everyone', false], ['voice_announcements_enabled', false], ['winner_vote_enabled', true],
  ['signup_dm_enabled', true], ['commander_dm_enabled', true],
] as const;
const DISCORD_NUMBER_FIELDS = [
  ['event_duration_minutes', 45], ['match_reminder_minutes', 10], ['player_reminder_minutes', 120],
] as const;

/** Builds the update patch from a request body (falsy values fall back to the field default, as before). */
function buildDiscordPatch(body: Record<string, any>): DiscordSettingsPatch {
  const patch: Record<string, unknown> = {};
  for (const key of DISCORD_STRING_FIELDS) {
    if (body[key] !== undefined) patch[key] = String(body[key] || '').trim();
  }
  for (const [key, fallback] of DISCORD_NUMBER_FIELDS) {
    if (body[key] !== undefined) patch[key] = Number(body[key] || fallback);
  }
  if (body.announcer_voice !== undefined) patch.announcer_voice = String(body.announcer_voice || 'wrestling-announcer').trim();
  for (const [key] of DISCORD_BOOLEAN_FIELDS) {
    if (body[key] !== undefined) patch[key] = Boolean(body[key]);
  }
  // Bot token: never overwrite with the masked placeholder
  if (body.bot_token && body.bot_token !== MASK) patch.bot_token = String(body.bot_token).trim();
  return patch as DiscordSettingsPatch;
}

type DiscordRow = Awaited<ReturnType<typeof getDiscordSettings>>;

function safeDiscordSettings(settings: DiscordRow) {
  return {
    application_id: settings?.application_id || '',
    bot_token: settings?.bot_token ? MASK : '',
    guild_id: settings?.guild_id || '',
    announcement_role_id: settings?.announcement_role_id || '',
    mention_everyone: Boolean(settings?.mention_everyone),
    event_duration_minutes: settings?.event_duration_minutes || 45,
    match_reminder_minutes: settings?.match_reminder_minutes || 10,
    player_reminder_minutes: settings?.player_reminder_minutes || 120,
    announcer_voice: settings?.announcer_voice || 'wrestling-announcer',
    voice_announcements_enabled: settings ? Boolean(settings.voice_announcements_enabled) : false,
    voice_channel_category_id: settings?.voice_channel_category_id || '',
    winner_vote_enabled: settings?.winner_vote_enabled ?? true,
    signup_dm_enabled: settings?.signup_dm_enabled ?? true,
    commander_dm_enabled: settings?.commander_dm_enabled ?? true,
  };
}

const discord = new Hono()
  .get('/', async (c) => {
    try {
      return c.json(safeDiscordSettings(await getDiscordSettings()));
    } catch (error) {
      logger.error('Error fetching Discord settings:', error);
      return jsonError(c, 'Failed to fetch Discord settings');
    }
  })
  .put('/', async (c) => {
    checkRateLimit(clientKey(c, 'discord-settings'), 20, 10 * 60 * 1000);
    try {
      const body = await readBody(c);
      for (const field of DISCORD_DURATION_FIELDS) {
        if (body[field.key] !== undefined) {
          const check = validateNumberRange(body[field.key], field.min, field.max, field.key);
          if (!check.valid) return jsonError(c, check.error!, 400);
        }
      }

      const patch = buildDiscordPatch(body);
      // The singleton row is created on first save even when nothing else changes.
      await updateDiscordSettings(patch);
      if (Object.keys(patch).length > 0) await restartDiscordBot();
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error updating Discord settings:', error);
      return jsonError(c, 'Failed to update Discord settings');
    }
  });

// ─── Announcer settings (stored on discord_settings) ─────────────────────────

const announcer = new Hono()
  .get('/', async (c) => {
    try {
      const result = await getAnyDiscordSettings();
      return c.json({
        announcer_voice: result?.announcer_voice || 'wrestling-announcer',
        voice_announcements_enabled: Boolean(result?.voice_announcements_enabled),
        match_start_delay_seconds: result?.match_start_delay_seconds ?? 45,
      });
    } catch (error) {
      logger.error('Error fetching announcer settings:', error);
      return jsonError(c, 'Failed to fetch announcer settings');
    }
  })
  .put('/', async (c) => {
    try {
      const { announcer_voice, voice_announcements_enabled, match_start_delay_seconds } = await readBody(c);

      if (match_start_delay_seconds !== undefined) {
        if (typeof match_start_delay_seconds !== 'number' || match_start_delay_seconds < 0 || match_start_delay_seconds > 300) {
          return jsonError(c, 'match_start_delay_seconds must be a number between 0 and 300', 400);
        }
      }

      const patch: DiscordSettingsPatch = {};
      if (announcer_voice !== undefined) patch.announcer_voice = announcer_voice;
      if (voice_announcements_enabled !== undefined) patch.voice_announcements_enabled = Boolean(voice_announcements_enabled);
      if (match_start_delay_seconds !== undefined) patch.match_start_delay_seconds = match_start_delay_seconds;
      await updateDiscordSettings(patch);
      return c.json({ success: true });
    } catch (error) {
      logger.error('Error updating announcer settings:', error);
      return jsonError(c, 'Failed to update announcer settings');
    }
  });

// ─── UI settings ─────────────────────────────────────────────────────────────

const ui = new Hono()
  .get('/', async (c) => {
    try {
      return c.json((await getUiSettings()) ?? { auto_refresh_interval_seconds: 10 });
    } catch (error) {
      logger.error('Error fetching UI settings:', error);
      return jsonError(c, 'Failed to fetch UI settings');
    }
  })
  .put('/', async (c) => {
    try {
      const { auto_refresh_interval_seconds } = await readBody(c);
      if (!auto_refresh_interval_seconds || auto_refresh_interval_seconds < 5 || auto_refresh_interval_seconds > 300) {
        return jsonError(c, 'Auto refresh interval must be between 5 and 300 seconds', 400);
      }
      await setAutoRefreshInterval(Number(auto_refresh_interval_seconds));
      return c.json({ message: 'UI settings updated successfully' });
    } catch (error) {
      logger.error('Error updating UI settings:', error);
      return jsonError(c, 'Failed to update UI settings');
    }
  });

// ─── Scheduler settings ──────────────────────────────────────────────────────

const CRON_PART_RANGES = [
  { name: 'second', min: 0, max: 59 },
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'dayOfWeek', min: 0, max: 7 },
] as const;

function isValidCronPart(token: string, min: number, max: number): boolean {
  if (token === '*') return true;
  const stepMatch = /^\*\/(\d+)$/.exec(token);
  if (stepMatch) {
    const step = Number(stepMatch[1]);
    return step >= 1 && step <= max;
  }
  const num = Number(token);
  return Number.isInteger(num) && num >= min && num <= max;
}

function validateCronExpression(cronExpression: string, fieldName: string): { valid: boolean; error?: string } {
  const cronParts = cronExpression.split(' ');
  if (cronParts.length !== 6) {
    return { valid: false, error: `Invalid cron expression for ${fieldName}. Expected 6 parts (second minute hour day month dayOfWeek)` };
  }
  for (let i = 0; i < CRON_PART_RANGES.length; i++) {
    const { name, min, max } = CRON_PART_RANGES[i];
    if (!isValidCronPart(cronParts[i], min, max)) {
      return { valid: false, error: `Invalid cron expression for ${fieldName}: ${name} part "${cronParts[i]}" is out of range (${min}–${max})` };
    }
  }
  return { valid: true };
}

function validateCronFields(body: Record<string, unknown>): { valid: boolean; error?: string } {
  for (const field of ['match_check_cron', 'channel_refresh_cron']) {
    if (body[field] && typeof body[field] === 'string') {
      const validation = validateCronExpression(body[field] as string, field);
      if (!validation.valid) return validation;
    }
  }
  return { valid: true };
}

const scheduler = new Hono()
  .get('/', async (c) => {
    try {
      const settings = await getSchedulerSettings();
      return c.json(settings ?? { match_check_cron: '0 */1 * * * *', channel_refresh_cron: '0 0 0 * * *' });
    } catch (error) {
      logger.error('Error fetching scheduler settings:', error);
      return jsonError(c, 'Failed to fetch scheduler settings');
    }
  })
  .put('/', async (c) => {
    try {
      const body = await readBody(c);
      const validation = validateCronFields(body);
      if (!validation.valid) return jsonError(c, validation.error!, 400);

      const updated = await updateSchedulerCrons({
        match_check_cron: body.match_check_cron || undefined,
        channel_refresh_cron: body.channel_refresh_cron || undefined,
      });
      return c.json(updated);
    } catch (error) {
      logger.error('Error updating scheduler settings:', error);
      return jsonError(c, 'Failed to update scheduler settings');
    }
  });

// ─── Log level ───────────────────────────────────────────────────────────────

const VALID_LOG_LEVELS = ['debug', 'info', 'warning', 'error', 'critical'];

const logLevel = new Hono()
  .get('/', async (c) => {
    try {
      return c.json({ log_level: (await getAppSetting('log_level')) || 'warning' });
    } catch (error) {
      logger.error('Error fetching log level:', error);
      return jsonError(c, 'Failed to fetch log level');
    }
  })
  .put('/', async (c) => {
    try {
      const { log_level } = await readBody(c);
      if (!log_level || !VALID_LOG_LEVELS.includes(log_level)) {
        return jsonError(c, 'Invalid log level. Must be one of: debug, info, warning, error, critical', 400);
      }
      await updateAppSetting('log_level', log_level);
      await logger.reload();
      return c.json({ success: true, log_level });
    } catch (error) {
      logger.error('Error updating log level:', error);
      return jsonError(c, 'Failed to update log level');
    }
  });

// ─── Feed retention ──────────────────────────────────────────────────────────

const DEFAULT_RETENTION_DAYS = 180;

const feedRetention = new Hono()
  .get('/', async (c) => {
    try {
      const value = await getAppSetting('feed_retention_days');
      return c.json({ feed_retention_days: value ? Number.parseInt(value, 10) : DEFAULT_RETENTION_DAYS });
    } catch (error) {
      logger.error('Error fetching feed retention days:', error);
      return jsonError(c, 'Failed to fetch feed retention days');
    }
  })
  .put('/', async (c) => {
    try {
      const { feed_retention_days } = await readBody(c);
      const parsed = Number.parseInt(feed_retention_days, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 3650) {
        return jsonError(c, 'Invalid value. Must be an integer between 1 and 3650.', 400);
      }
      await updateAppSetting('feed_retention_days', String(parsed));
      return c.json({ success: true, feed_retention_days: parsed });
    } catch (error) {
      logger.error('Error updating feed retention days:', error);
      return jsonError(c, 'Failed to update feed retention days');
    }
  });

// ─── Update check ────────────────────────────────────────────────────────────

const UPDATE_CHECK_RATE_LIMIT_SECONDS = 60;

const updateCheck = new Hono()
  .get('/', async (c) => {
    try {
      const map = await getAppSettings(['update_check_enabled', 'latest_version', 'update_check_last_run', 'update_available']);
      return c.json({
        update_check_enabled: map['update_check_enabled'] === 'true',
        update_available: map['update_available'] === 'true',
        latest_version: map['latest_version'] ?? '',
        update_check_last_run: map['update_check_last_run'] ?? '',
      });
    } catch (error) {
      logger.error('Error fetching update check settings:', error);
      return jsonError(c, 'Failed to fetch update check settings');
    }
  })
  .put('/', async (c) => {
    try {
      const { update_check_enabled } = await readBody(c);
      if (typeof update_check_enabled !== 'boolean') return jsonError(c, 'update_check_enabled must be a boolean', 400);
      await updateAppSetting('update_check_enabled', update_check_enabled ? 'true' : 'false');
      return c.json({ success: true, update_check_enabled });
    } catch (error) {
      logger.error('Error updating update check settings:', error);
      return jsonError(c, 'Failed to update update check settings');
    }
  })
  .post('/', async (c) => {
    try {
      const lastRun = await getAppSetting('update_check_last_run');
      if (lastRun) {
        const secondsSince = (Date.now() - new Date(lastRun).getTime()) / 1000;
        if (secondsSince < UPDATE_CHECK_RATE_LIMIT_SECONDS) return jsonError(c, 'Rate limited — wait before checking again', 429);
      }
      await new UpdateCheckJob().checkForUpdate();
      return c.json({ success: true, checked_at: new Date().toISOString() });
    } catch (error) {
      logger.error('Error running update check:', error);
      return jsonError(c, 'Failed to run update check');
    }
  });

// ─── Aggregate + mount ───────────────────────────────────────────────────────

export const settings = new Hono()
  .get('/', async (c) => {
    try {
      const [discordRow, uiRow, schedulerRow, voices] = await Promise.all([
        getDiscordSettings(), getUiSettings(), getSchedulerSettings(), listVoices(),
      ]);
      const safeDiscord = safeDiscordSettings(discordRow);
      return c.json({
        discord: safeDiscord,
        announcer: {
          announcer_voice: safeDiscord.announcer_voice,
          voice_announcements_enabled: safeDiscord.voice_announcements_enabled,
        },
        ui: uiRow ?? { auto_refresh_interval_seconds: 10 },
        scheduler: schedulerRow ?? {
          match_check_cron: '0 */1 * * * *',
          cleanup_check_cron: '0 0 2 * * *',
          channel_refresh_cron: '0 0 0 * * *',
        },
        voices,
      });
    } catch (error) {
      logger.error('Error fetching settings:', error);
      return jsonError(c, 'Failed to fetch settings');
    }
  })
  .route('/discord', discord)
  .route('/announcer', announcer)
  .route('/ui', ui)
  .route('/scheduler', scheduler)
  .route('/log-level', logLevel)
  .route('/feed-retention', feedRetention)
  .route('/update-check', updateCheck);
