import * as cron from 'node-cron';
import { logger } from '../../../src/lib/logger/server';
import { getBackupSettings } from '../../../src/lib/backup-settings';
import { runAutoBackup } from '../../../src/lib/backup-service';
import { nonOverlapping } from '../../../src/lib/discord-queues';

const REFRESH_MS = 60_000;

/**
 * Automatic database backups (plan 6.2). The schedule, the enabled flag and the retention come from the backup settings; they are
 * re-read every minute (and after a restore) so changes made on the settings page apply without restarting the scheduler.
 * The cron runs in the container's local timezone (no `timezone` option), unlike the other scheduler jobs which use UTC.
 */
export class AutoBackupJob {
  private task: cron.ScheduledTask | null = null;
  private scheduledCron: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  // Goes through nonOverlapping: skipped while a restore is draining, and counted as in-flight work (the restore waits for it).
  private readonly run = nonOverlapping(
    async () => { await runAutoBackup('schedule'); },
    (error) => logger.error('Automatic backup tick failed:', error),
  );

  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, REFRESH_MS);
    this.timer.unref();
  }

  async refresh(): Promise<void> {
    try {
      const settings = await getBackupSettings();
      const wanted = settings.enabled ? settings.schedule : null;
      if (wanted === this.scheduledCron) return;
      this.stopTask();
      if (!wanted) {
        logger.info(`Automatic backups are disabled${settings.enabledIsDefault ? ` (default for ${settings.embedded ? 'the embedded' : 'an external'} database)` : ''}`);
        return;
      }
      this.task = cron.schedule(wanted, () => { void this.run(); });
      this.scheduledCron = wanted;
      logger.info(`Automatic backups scheduled: ${wanted} (${settings.enabledIsDefault ? 'default: embedded database' : 'enabled in settings'})`);
    } catch (error) {
      logger.error('Could not load the backup settings:', error);
    }
  }

  private stopTask(): void {
    this.task?.stop();
    this.task = null;
    this.scheduledCron = null;
  }

  stop(): void {
    this.stopTask();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
