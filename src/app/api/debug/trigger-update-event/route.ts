import { readFileSync } from 'fs';
import { join } from 'path';
import { logFeedEvent } from '@/lib/feed-helpers';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';

export async function POST() {
  if (process.env.ENABLE_DEBUG_ROUTES !== 'true') {
    return apiError('Not found', 404);
  }

  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    const currentVersion = `v${pkg.version}`;

    await logFeedEvent({
      eventType: 'update_available',
      priority: 2,
      title: 'MatchExec v9.9.9 is available',
      description: `You are running ${currentVersion}. A new release is available. (Debug event)`,
      metadata: {
        currentVersion,
        latestVersion: 'v9.9.9',
        releaseUrl: 'https://github.com/slamanna212/matchexec/releases/tag/v9.9.9',
      }
    });

    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error triggering update event:', error);
    return apiError('Failed to trigger update event');
  }
}
