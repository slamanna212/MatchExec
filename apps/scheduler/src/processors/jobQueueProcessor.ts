import { getPrismaClient, log } from '@matchexec/shared';

export async function processJobQueue(): Promise<void> {
  const prisma = getPrismaClient();

  try {
    // Get pending jobs from the queue
    const jobs = await prisma.jobQueue.findMany({
      where: {
        status: 'pending',
        scheduledAt: {
          lte: new Date(),
        },
      },
      orderBy: [
        { priority: 'desc' },
        { scheduledAt: 'asc' },
      ],
      take: 10, // Process up to 10 jobs at a time
    });

    if (jobs.length === 0) {
      return; // No jobs to process
    }

    log.info('Processing job queue', { jobCount: jobs.length });

    for (const job of jobs) {
      await processJob(job.id);
    }

    log.info('Job queue processing completed');
  } catch (error) {
    log.error('Job queue processing failed', { error: (error as Error).message });
    throw error;
  }
}

async function processJob(jobId: string): Promise<void> {
  const prisma = getPrismaClient();

  try {
    // Mark job as processing
    const job = await prisma.jobQueue.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    log.info('Processing job', { 
      jobId: job.id, 
      type: job.jobType,
      attempt: job.attempts,
    });

    // Process different job types
    switch (job.jobType) {
      case 'statistics_update':
        await handleStatisticsJob(job);
        break;
      case 'embed_update':
        await handleEmbedJob(job);
        break;
      case 'ocr_process':
        await handleOcrJob(job);
        break;
      case 'match_import':
        await handleMatchImportJob(job);
        break;
      case 'player_sync':
        await handlePlayerSyncJob(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.jobType}`);
    }

    // Mark job as completed
    await prisma.jobQueue.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        error: null,
      },
    });

    log.info('Job completed successfully', { jobId, type: job.jobType });

  } catch (error) {
    const errorMessage = (error as Error).message;
    
    // Get current job to check attempts
    const currentJob = await prisma.jobQueue.findUnique({
      where: { id: jobId },
    });
    
    if (!currentJob) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    // Update job with error
    const updatedJob = await prisma.jobQueue.update({
      where: { id: jobId },
      data: {
        status: currentJob.attempts >= currentJob.maxAttempts ? 'failed' : 'pending',
        error: errorMessage,
        scheduledAt: currentJob.attempts < currentJob.maxAttempts 
          ? new Date(Date.now() + Math.pow(2, currentJob.attempts) * 60000) // Exponential backoff
          : undefined,
      },
    });

    log.error('Job processing failed', {
      jobId,
      type: currentJob.jobType,
      attempt: currentJob.attempts,
      maxAttempts: currentJob.maxAttempts,
      error: errorMessage,
      willRetry: currentJob.attempts < currentJob.maxAttempts,
    });

    if (currentJob.attempts >= currentJob.maxAttempts) {
      log.error('Job permanently failed after max attempts', { jobId, type: currentJob.jobType });
    }
  }
}

// Job type handlers
async function handleStatisticsJob(job: any): Promise<void> {
  // Implement statistics job processing
  log.debug('Processing statistics job', { jobId: job.id });
}

async function handleEmbedJob(job: any): Promise<void> {
  // Implement embed job processing
  log.debug('Processing embed job', { jobId: job.id });
}

async function handleOcrJob(job: any): Promise<void> {
  // Implement OCR job processing
  log.debug('Processing OCR job', { jobId: job.id });
}

async function handleMatchImportJob(job: any): Promise<void> {
  // Implement match import job processing
  log.debug('Processing match import job', { jobId: job.id });
}

async function handlePlayerSyncJob(job: any): Promise<void> {
  // Implement player sync job processing
  log.debug('Processing player sync job', { jobId: job.id });
} 