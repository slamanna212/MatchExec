import cron from 'node-cron';
import dotenv from 'dotenv';
import { loadEnvironmentConfig, validateEnvironment, log } from '@matchexec/shared';

// Load environment variables
dotenv.config();

// Import job processors
import { processStatisticsUpdate } from './processors/statisticsProcessor';
import { processEmbedUpdate } from './processors/embedProcessor';
import { processJobQueue } from './processors/jobQueueProcessor';

class Scheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  async start() {
    const config = loadEnvironmentConfig();

    // Validate environment variables
    try {
      validateEnvironment();
    } catch (error) {
      log.error('Environment validation failed', { error: (error as Error).message });
      process.exit(1);
    }

    log.info('Starting MatchExec Scheduler', {
      process: 'scheduler',
      environment: config.NODE_ENV,
    });

    // Schedule statistics updates every 5 minutes
    this.scheduleJob('statistics-update', '*/5 * * * *', async () => {
      log.info('Running scheduled statistics update');
      await processStatisticsUpdate();
    });

    // Schedule embed updates every 10 minutes
    this.scheduleJob('embed-update', '*/10 * * * *', async () => {
      log.info('Running scheduled embed update');
      await processEmbedUpdate();
    });

    // Process job queue every minute
    this.scheduleJob('job-queue', '* * * * *', async () => {
      await processJobQueue();
    });

    // Schedule database cleanup daily at 2 AM
    this.scheduleJob('database-cleanup', '0 2 * * *', async () => {
      log.info('Running scheduled database cleanup');
      // Add database cleanup logic here
    });

    log.info('All scheduled jobs started', {
      jobCount: this.jobs.size,
      jobs: Array.from(this.jobs.keys()),
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      log.info('SIGTERM received, shutting down scheduler gracefully');
      this.stop();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      log.info('SIGINT received, shutting down scheduler gracefully');
      this.stop();
      process.exit(0);
    });
  }

  private scheduleJob(name: string, cronExpression: string, task: () => Promise<void>) {
    try {
      const job = cron.schedule(cronExpression, async () => {
        try {
          await task();
        } catch (error) {
          log.error(`Job ${name} failed`, {
            job: name,
            error: (error as Error).message,
          });
        }
      }, {
        scheduled: false,
        timezone: 'UTC',
      });

      job.start();
      this.jobs.set(name, job);

      log.info('Scheduled job created', {
        job: name,
        cron: cronExpression,
      });
    } catch (error) {
      log.error(`Failed to schedule job ${name}`, {
        job: name,
        error: (error as Error).message,
      });
    }
  }

  stop() {
    log.info('Stopping all scheduled jobs');
    
    for (const [name, job] of this.jobs) {
      job.stop();
      log.info('Stopped job', { job: name });
    }

    this.jobs.clear();
  }
}

async function startScheduler() {
  try {
    const scheduler = new Scheduler();
    await scheduler.start();
  } catch (error) {
    log.error('Failed to start scheduler', { error: (error as Error).message });
    process.exit(1);
  }
}

// Start scheduler if this file is run directly
if (require.main === module) {
  startScheduler();
}

export { Scheduler, startScheduler }; 