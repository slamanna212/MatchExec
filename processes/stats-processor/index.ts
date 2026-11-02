import { logger } from '../../src/lib/logger/server';
import { setAppSetting } from '../../src/lib/settings';
import { db as pgDb } from '../../lib/db';
import { waitForSystemReady } from '../../lib/db/system-status';
import { isPaused, startWorkerControl, type WorkerControl } from '../../lib/maintenance';
import { claimJobs, makeWorkerId, nonOverlapping, releaseJob, resetAbandonedClaims } from '../../src/lib/discord-queues';
import { AIExtractor } from './modules/ai-extractor';
import { StatImageGenerator } from './modules/stat-image-generator';

class StatsProcessor {
  private isRunning = false;
  private aiExtractor: AIExtractor | null = null;
  private imageGenerator: StatImageGenerator | null = null;
  private intervals: ReturnType<typeof setInterval>[] = [];
  private readonly workerId = makeWorkerId('stats-processor');
  private workerControl: WorkerControl | null = null;
  // A poll never starts while the previous one is still running (AI extraction can take minutes)
  private runExtractionTick = nonOverlapping(
    () => this.processExtractionQueue(),
    (error) => logger.error('Error in extraction queue poll:', error),
  );
  private runImageTick = nonOverlapping(
    () => this.processImageQueue(),
    (error) => logger.error('Error in image queue poll:', error),
  );

  async start() {
    logger.debug('📊 Starting MatchExec Stats Processor...');

    try {
      logger.debug('⏳ Waiting for database to be ready...');
      await waitForSystemReady();

      this.isRunning = true;

      // Backup restore coordination (plan 6.4): heartbeat into control.workers; ticks pause themselves (nonOverlapping)
      this.workerControl = startWorkerControl({
        service: 'stats',
        log: (message, error) => logger.debug(`[worker-control] ${message}`, error),
      });

      this.aiExtractor = new AIExtractor(pgDb);
      this.imageGenerator = new StatImageGenerator(pgDb);

      // Send initial heartbeat
      try {
        const now = new Date().toISOString();
        await setAppSetting('stats_processor_last_heartbeat', now);
        logger.debug('💓 Initial stats processor heartbeat sent');
      } catch (error) {
        logger.error('Failed to send initial stats processor heartbeat:', error);
      }

      // Poll extraction queue every 5 seconds
      const extractionInterval = setInterval(async () => {
        if (!this.isRunning) return;
        await this.runExtractionTick();
      }, 5000);

      // Poll image queue every 5 seconds
      const imageInterval = setInterval(async () => {
        if (!this.isRunning) return;
        await this.runImageTick();
      }, 5000);

      // Heartbeat every 5 minutes
      const heartbeatInterval = setInterval(async () => {
        if (!this.isRunning || isPaused()) return;
        try {
          const now = new Date().toISOString();
          await setAppSetting('stats_processor_last_heartbeat', now);
          logger.debug('💓 Stats processor heartbeat sent');
        } catch (error) {
          logger.error('Failed to persist stats processor heartbeat:', error);
        }
      }, 5 * 60 * 1000);

      this.intervals = [extractionInterval, imageInterval, heartbeatInterval];

      logger.debug('✅ Stats Processor started successfully');

      // Keep alive
      process.stdin.resume();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Failed to start stats processor:', { message: errorMessage });
      process.exit(1);
    }
  }

  private async processExtractionQueue() {
    // Claims left behind by a crashed run go back to pending (or fail once attempts are exhausted)
    await resetAbandonedClaims(pgDb, ['statsProcessing', 'statsImage']);

    const [item] = await claimJobs(pgDb, 'statsProcessing', { limit: 1, workerId: this.workerId });
    if (!item) return;
    if (!this.aiExtractor) {
      await releaseJob(pgDb, 'statsProcessing', item.id);
      return;
    }

    logger.debug(`🤖 Processing AI extraction for submission: ${item.submission_id}`);
    await this.aiExtractor.processSubmission(item.submission_id, item.id);
  }

  private async processImageQueue() {
    const [item] = await claimJobs(pgDb, 'statsImage', { limit: 1, workerId: this.workerId });
    if (!item) return;
    if (!this.imageGenerator) {
      await releaseJob(pgDb, 'statsImage', item.id);
      return;
    }

    logger.debug(`🖼️ Processing image generation for match: ${item.match_id}`);
    await this.imageGenerator.generateMatchStatImages(item.id, item.match_id);
  }

  private shutdown() {
    logger.debug('👋 Stats Processor shutting down...');
    this.isRunning = false;
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    void (this.workerControl?.stop() ?? Promise.resolve()).finally(() => process.exit(0));
  }
}

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in stats processor:', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection in stats processor:', reason);
});

const processor = new StatsProcessor();

process.on('SIGTERM', () => processor['shutdown']());
process.on('SIGINT', () => processor['shutdown']());

processor.start().catch((error) => {
  logger.error('Fatal error starting stats processor:', error);
  process.exit(1);
});
