/**
 * Automatic-backup settings (plan 6.2), stored as keys in `app_settings` (no schema of their own, so they travel with dumps and
 * the SQLite importer needs no new mapping):
 *
 *   backup_auto_enabled          'true' | 'false'   (absent: on for the embedded database, off for an external DATABASE_URL)
 *   backup_schedule              cron expression    (default `0 4 * * *`, evaluated in the container's TZ)
 *   backup_retention_daily       integer            (default 14)
 *   backup_retention_weekly      integer            (default 4)
 *   backup_last_run_at / _status / _size / _file / _error   written after every automatic or "Back up now" run
 */
import * as cron from 'node-cron';
import { DEFAULT_RETENTION, isEmbeddedDatabase } from '../../lib/backup';
import { db as defaultDb, type Executor } from '../../lib/db';
import { getAppSettings, setAppSetting } from './settings';

export const DEFAULT_BACKUP_CRON = '0 4 * * *';

export const BACKUP_SCHEDULE_PRESETS = {
  daily: '0 4 * * *',
  '12h': '0 4,16 * * *',
  weekly: '0 4 * * 0',
} as const;
export type BackupSchedulePreset = keyof typeof BACKUP_SCHEDULE_PRESETS;

const KEYS = [
  'backup_auto_enabled', 'backup_schedule', 'backup_retention_daily', 'backup_retention_weekly',
  'backup_last_run_at', 'backup_last_status', 'backup_last_size', 'backup_last_file', 'backup_last_error',
] as const;

export interface BackupSettings {
  enabled: boolean;
  /** True when `enabled` is the default for this deployment rather than an explicit choice. */
  enabledIsDefault: boolean;
  embedded: boolean;
  schedule: string;
  /** daily / 12h / weekly when the cron matches a preset, else `custom`. */
  preset: BackupSchedulePreset | 'custom';
  retention: { daily: number; weekly: number };
  last: { at: string | null; status: 'success' | 'failed' | null; size: number | null; file: string | null; error: string | null };
}

export function presetForSchedule(schedule: string): BackupSchedulePreset | 'custom' {
  const hit = (Object.entries(BACKUP_SCHEDULE_PRESETS) as Array<[BackupSchedulePreset, string]>).find(([, c]) => c === schedule.trim());
  return hit ? hit[0] : 'custom';
}

/** Accepts a preset name or a 5/6-field cron expression; returns the cron or null when invalid. */
export function normalizeSchedule(input: string): string | null {
  const v = input.trim();
  if (v in BACKUP_SCHEDULE_PRESETS) return BACKUP_SCHEDULE_PRESETS[v as BackupSchedulePreset];
  return v && cron.validate(v) ? v : null;
}

const toInt = (v: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export async function getBackupSettings(ex: Executor = defaultDb, env: Record<string, string | undefined> = process.env): Promise<BackupSettings> {
  const raw = await getAppSettings(KEYS, ex);
  const embedded = isEmbeddedDatabase(env);
  const explicit = raw.backup_auto_enabled;
  const schedule = raw.backup_schedule && cron.validate(raw.backup_schedule) ? raw.backup_schedule : DEFAULT_BACKUP_CRON;
  const size = Number.parseInt(raw.backup_last_size ?? '', 10);
  return {
    enabled: explicit === undefined ? embedded : explicit === 'true',
    enabledIsDefault: explicit === undefined,
    embedded,
    schedule,
    preset: presetForSchedule(schedule),
    retention: {
      daily: toInt(raw.backup_retention_daily, DEFAULT_RETENTION.daily, 1, 365),
      weekly: toInt(raw.backup_retention_weekly, DEFAULT_RETENTION.weekly, 0, 52),
    },
    last: {
      at: raw.backup_last_run_at || null,
      status: raw.backup_last_status === 'success' || raw.backup_last_status === 'failed' ? raw.backup_last_status : null,
      size: Number.isFinite(size) ? size : null,
      file: raw.backup_last_file || null,
      error: raw.backup_last_error || null,
    },
  };
}

export interface BackupSettingsPatch {
  enabled?: boolean;
  schedule?: string;
  retention?: { daily?: number; weekly?: number };
}

export class BackupSettingsError extends Error {}

export async function updateBackupSettings(patch: BackupSettingsPatch, ex: Executor = defaultDb): Promise<void> {
  if (patch.schedule !== undefined) {
    const cronExpr = normalizeSchedule(patch.schedule);
    if (!cronExpr) throw new BackupSettingsError('Invalid schedule: use daily, 12h, weekly or a valid cron expression');
    await setAppSetting('backup_schedule', cronExpr, ex);
  }
  if (patch.retention?.daily !== undefined) {
    const n = patch.retention.daily;
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new BackupSettingsError('Daily retention must be a whole number between 1 and 365');
    await setAppSetting('backup_retention_daily', String(n), ex);
  }
  if (patch.retention?.weekly !== undefined) {
    const n = patch.retention.weekly;
    if (!Number.isInteger(n) || n < 0 || n > 52) throw new BackupSettingsError('Weekly retention must be a whole number between 0 and 52');
    await setAppSetting('backup_retention_weekly', String(n), ex);
  }
  if (patch.enabled !== undefined) await setAppSetting('backup_auto_enabled', patch.enabled ? 'true' : 'false', ex);
}

export async function recordBackupRun(
  result: { ok: true; file: string; size: number } | { ok: false; error: string },
  ex: Executor = defaultDb,
  now = new Date(),
): Promise<void> {
  await setAppSetting('backup_last_run_at', now.toISOString(), ex);
  if (result.ok) {
    await setAppSetting('backup_last_status', 'success', ex);
    await setAppSetting('backup_last_size', String(result.size), ex);
    await setAppSetting('backup_last_file', result.file, ex);
    await setAppSetting('backup_last_error', '', ex);
  } else {
    await setAppSetting('backup_last_status', 'failed', ex);
    await setAppSetting('backup_last_error', result.error.slice(0, 1000), ex);
  }
}
