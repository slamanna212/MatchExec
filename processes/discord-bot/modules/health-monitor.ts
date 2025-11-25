import type { Database } from '../../../lib/database/connection';
import type { AnnouncementHandler } from './announcement-handler';
import { logger } from '../../../src/lib/logger/server';

interface HealthAlertConfig {
  type: string;
  severity: 'critical' | 'warning';
  title: string;
  description: string;
}

export class HealthMonitor {
  private monitoringIntervals: NodeJS.Timeout[] = [];
  private lastSchedulerHeartbeat: Date | null = null;
  private readonly SCHEDULER_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
  private readonly SCHEDULER_TIMEOUT_THRESHOLD = 10 * 60 * 1000; // 10 minutes
  private readonly RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

  constructor(
    private db: Database,
    private announcementHandler: AnnouncementHandler
  ) {}

  /**
   * Start all health monitoring tasks
   */
  async start(): Promise<void> {
    logger.info('🏥 Starting health monitoring...');

    // Monitor scheduler heartbeat every 2 minutes
    const schedulerInterval = setInterval(() => {
      this.checkSchedulerHeartbeat();
    }, this.SCHEDULER_CHECK_INTERVAL);
    this.monitoringIntervals.push(schedulerInterval);

    logger.info('✅ Health monitoring started');
  }

  /**
   * Stop all health monitoring tasks
   */
  stop(): void {
    logger.info('🛑 Stopping health monitoring...');
    this.monitoringIntervals.forEach(interval => clearInterval(interval));
    this.monitoringIntervals = [];
  }

  /**
   * Report a health issue and send alert if not rate-limited
   */
  async reportHealthIssue(config: HealthAlertConfig): Promise<void> {
    try {
      // Check if we can send this alert (rate limiting)
      const canSend = await this.checkRateLimit(config.type);

      if (!canSend) {
        logger.debug(`Health alert rate-limited: ${config.type}`);
        return;
      }

      // Send the alert
      await this.announcementHandler.postHealthAlert({
        severity: config.severity,
        title: config.title,
        description: config.description
      });

      // Update last sent timestamp
      await this.updateRateLimit(config.type);

      logger.info(`Health alert sent: ${config.type} - ${config.title}`);
    } catch (error) {
      logger.error('Error reporting health issue:', error);
    }
  }

  /**
   * Check scheduler heartbeat and alert if missing
   */
  private async checkSchedulerHeartbeat(): Promise<void> {
    try {
      // Fetch last heartbeat from database
      const result = await this.db.get<{ setting_value: string }>(
        'SELECT setting_value FROM app_settings WHERE setting_key = ?',
        ['scheduler_last_heartbeat']
      );

      if (!result?.setting_value) {
        logger.debug('No scheduler heartbeat found in database yet');
        return;
      }

      const lastHeartbeat = new Date(result.setting_value);
      const now = new Date();
      const timeSinceHeartbeat = now.getTime() - lastHeartbeat.getTime();

      // Check if heartbeat is missing (exceeded threshold)
      if (timeSinceHeartbeat > this.SCHEDULER_TIMEOUT_THRESHOLD) {
        const minutesAgo = Math.floor(timeSinceHeartbeat / 60000);

        await this.reportHealthIssue({
          type: 'scheduler_heartbeat_missing',
          severity: 'critical',
          title: 'Scheduler Heartbeat Missing',
          description: `The scheduler has not sent a heartbeat in ${minutesAgo} minutes. Last heartbeat: ${lastHeartbeat.toISOString()}`
        });
      }
    } catch (error) {
      logger.error('Error checking scheduler heartbeat:', error);
    }
  }

  /**
   * Check if an alert can be sent based on rate limiting (1 per hour)
   */
  private async checkRateLimit(alertType: string): Promise<boolean> {
    try {
      const result = await this.db.get<{ last_sent_at: string }>(
        'SELECT last_sent_at FROM health_alerts_sent WHERE alert_type = ?',
        [alertType]
      );

      if (!result) {
        // No record exists, can send
        return true;
      }

      const lastSent = new Date(result.last_sent_at);
      const now = new Date();
      const timeSinceLastAlert = now.getTime() - lastSent.getTime();

      // Can send if more than 1 hour has passed
      return timeSinceLastAlert > this.RATE_LIMIT_WINDOW;
    } catch (error) {
      logger.error('Error checking rate limit:', error);
      // On error, allow sending to ensure critical alerts get through
      return true;
    }
  }

  /**
   * Update the last sent timestamp for an alert type
   */
  private async updateRateLimit(alertType: string): Promise<void> {
    try {
      await this.db.run(
        `INSERT INTO health_alerts_sent (alert_type, last_sent_at)
         VALUES (?, CURRENT_TIMESTAMP)
         ON CONFLICT(alert_type) DO UPDATE SET last_sent_at = CURRENT_TIMESTAMP`,
        [alertType]
      );
    } catch (error) {
      logger.error('Error updating rate limit:', error);
    }
  }

  /**
   * Report database error
   */
  async reportDatabaseError(errorDetails: string): Promise<void> {
    await this.reportHealthIssue({
      type: 'database_error',
      severity: 'critical',
      title: 'Database Error',
      description: `A critical database error occurred: ${errorDetails}`
    });
  }

  /**
   * Report process crash
   */
  async reportProcessCrash(processName: string, errorDetails: string): Promise<void> {
    await this.reportHealthIssue({
      type: `process_crash_${processName}`,
      severity: 'critical',
      title: `Process Crash: ${processName}`,
      description: `The ${processName} process has crashed: ${errorDetails}`
    });
  }

  /**
   * Report queue overflow
   */
  async reportQueueOverflow(queueSize: number, threshold: number): Promise<void> {
    await this.reportHealthIssue({
      type: 'queue_overflow',
      severity: 'warning',
      title: 'Discord Queue Overflow',
      description: `Discord operation queue has ${queueSize} items (threshold: ${threshold}). This may indicate the bot is falling behind on processing requests.`
    });
  }
}
