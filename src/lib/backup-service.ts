/**
 * Runs one automatic backup (plan 6.2): dump to `auto/`, prune by the retention settings, record the outcome in the settings
 * and, on failure, log at error level and add an activity-feed event. Used by the scheduler's cron job and by "Back up now".
 */
import { createBackup, pruneAutoBackups, type BackupFileInfo } from '../../lib/backup';
import { logger } from '@/lib/logger';
import { logFeedEvent } from './feed-helpers';
import { getBackupSettings, recordBackupRun } from './backup-settings';

export type AutoBackupOutcome =
  | { ok: true; backup: BackupFileInfo; pruned: string[] }
  | { ok: false; error: string };

let running: Promise<AutoBackupOutcome> | null = null;

async function runOnce(trigger: 'schedule' | 'manual'): Promise<AutoBackupOutcome> {
  try {
    const settings = await getBackupSettings();
    const backup = await createBackup('auto');
    let pruned: string[] = [];
    try {
      pruned = pruneAutoBackups(settings.retention);
    } catch (error) {
      logger.warning('Backup retention pruning failed:', error);
    }
    await recordBackupRun({ ok: true, file: backup.filename, size: backup.size });
    logger.info(`Database backup created (${trigger}): ${backup.filename}, ${backup.size} bytes${pruned.length ? `, pruned ${pruned.length} old` : ''}`);
    return { ok: true, backup, pruned };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Automatic database backup failed:', error);
    await recordBackupRun({ ok: false, error: message }).catch((e) => logger.error('Could not record the backup failure:', e));
    await logFeedEvent({
      eventType: 'backup_failed',
      priority: 3,
      title: 'Database backup failed',
      description: message.slice(0, 500),
      metadata: { trigger },
    });
    return { ok: false, error: message };
  }
}

/** Never runs two backups at once in this process; a concurrent caller gets the running one's outcome. */
export function runAutoBackup(trigger: 'schedule' | 'manual' = 'schedule'): Promise<AutoBackupOutcome> {
  running ??= runOnce(trigger).finally(() => { running = null; });
  return running;
}
