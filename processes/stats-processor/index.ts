// @ts-nocheck - Database method calls have complex typing issues
import { waitForDatabaseReady } from '../../lib/database';
import { logger } from '../../src/lib/logger/server';
import { AIExtractor } from './modules/ai-extractor';
import { StatImageGenerator } from './modules/stat-image-generator';

class StatsProcessor {
  private isRunning = false;
  private db: unknown;
  private aiExtractor: AIExtractor | null = null;
  private imageGenerator: StatImageGenerator | null = null;
  private intervals: ReturnType<typeof setInterval>[] = [];

  async start() {
    logger.debug('📊 Starting MatchExec Stats Processor...');

    try {
      logger.debug('⏳ Waiting for database to be ready...');
      this.db = await waitForDatabaseReady();

      this.isRunning = true;

      this.aiExtractor = new AIExtractor(this.db);
      this.imageGenerator = new StatImageGenerator(this.db);

      // Send initial heartbeat
      try {
        const now = new Date().toISOString();
        await this.db.run(
          `INSERT INTO app_settings (setting_key, setting_value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?, updated_at = CURRENT_TIMESTAMP`,
          ['stats_processor_last_heartbeat', now, now]
        );
      } catch {
        // ignore heartbeat errors
      }

      // Poll extraction queue every 5 seconds
      const extractionInterval = setInterval(async () => {
        if (!this.isRunning) return;
        try {
          await this.processExtractionQueue();
        } catch (error) {
          logger.error('Error in extraction queue poll:', error);
        }
      }, 5000);

      // Poll image queue every 5 seconds
      const imageInterval = setInterval(async () => {
        if (!this.isRunning) return;
        try {
          await this.processImageQueue();
        } catch (error) {
          logger.error('Error in image queue poll:', error);
        }
      }, 5000);

      // Heartbeat every 5 minutes
      const heartbeatInterval = setInterval(async () => {
        if (!this.isRunning) return;
        try {
          const now = new Date().toISOString();
          await this.db.run(
            `INSERT INTO app_settings (setting_key, setting_value, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(setting_key) DO UPDATE SET setting_value = ?, updated_at = CURRENT_TIMESTAMP`,
            ['stats_processor_last_heartbeat', now, now]
          );
        } catch {
          // ignore heartbeat errors
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
    const item = await this.db.get(
      `SELECT * FROM stats_processing_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
    );
    if (!item || !this.aiExtractor) return;

    logger.debug(`🤖 Processing AI extraction for submission: ${item.submission_id}`);
    await this.aiExtractor.processSubmission(item.submission_id, item.id);
  }

  private async processImageQueue() {
    const item = await this.db.get(
      `SELECT * FROM stats_image_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
    );
    if (!item || !this.imageGenerator) return;

    logger.debug(`🖼️ Processing image generation for match: ${item.match_id}`);
    await this.imageGenerator.generateMatchStatImages(item.id, item.match_id);
  }

  private shutdown() {
    logger.debug('👋 Stats Processor shutting down...');
    this.isRunning = false;
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    process.exit(0);
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
