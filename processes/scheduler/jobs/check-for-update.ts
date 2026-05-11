import { readFileSync } from 'fs';
import { join } from 'path';
import type { Database } from '../../../lib/database/connection';
import { logger } from '../../../src/lib/logger/server';
import { logFeedEvent } from '../../../src/lib/feed-helpers';

const GITHUB_API_URL = 'https://api.github.com/repos/slamanna212/matchexec/releases/latest';
const CHECK_INTERVAL_HOURS = 23;
const RATE_LIMIT_SECONDS = 60;

function parseVersion(tag: string): [number, number, number] | null {
  const clean = tag.replace(/^v/, '');
  const parts = clean.split('.');
  if (parts.length !== 3) return null;
  const nums = parts.map(p => parseInt(p, 10));
  if (nums.some(isNaN)) return null;
  return [nums[0], nums[1], nums[2]];
}

function isNewer(latest: [number, number, number], current: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (latest[i] > current[i]) return true;
    if (latest[i] < current[i]) return false;
  }
  return false;
}

export class UpdateCheckJob {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async checkForUpdate(): Promise<void> {
    try {
      const enabledRow = await this.db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'update_check_enabled'`
      );
      if (enabledRow?.setting_value === 'false') {
        logger.debug('Update check disabled, skipping');
        return;
      }

      const lastRunRow = await this.db.get<{ setting_value: string }>(
        `SELECT setting_value FROM app_settings WHERE setting_key = 'update_check_last_run'`
      );
      if (lastRunRow?.setting_value) {
        const lastRun = new Date(lastRunRow.setting_value).getTime();
        const hoursSince = (Date.now() - lastRun) / (1000 * 60 * 60);
        if (hoursSince < CHECK_INTERVAL_HOURS) {
          logger.debug(`Update check ran ${hoursSince.toFixed(1)}h ago, skipping`);
          return;
        }
      }

      logger.info('Checking for MatchExec updates...');
      const response = await fetch(GITHUB_API_URL, {
        headers: { 'User-Agent': 'MatchExec' }
      });

      if (response.status === 429) {
        logger.warning('GitHub API rate limited during update check');
        return;
      }

      if (!response.ok) {
        logger.warning(`GitHub API returned ${response.status} during update check`);
        return;
      }

      const data = await response.json() as { tag_name?: string };
      const tag = data.tag_name;

      if (!tag || tag.includes('-')) {
        logger.debug(`Skipping update check: tag "${tag}" is absent or pre-release`);
        return;
      }

      const latestParts = parseVersion(tag);
      if (!latestParts) {
        logger.warning(`Malformed release tag from GitHub: "${tag}"`);
        return;
      }

      const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      const currentParts = parseVersion(`v${packageJson.version}`);
      if (!currentParts) {
        logger.warning(`Malformed current version in package.json: "${packageJson.version}"`);
        return;
      }

      const nowIso = new Date().toISOString();
      const updateAvailable = isNewer(latestParts, currentParts);

      await this.db.run(
        `UPDATE app_settings SET setting_value = ? WHERE setting_key = 'latest_version'`,
        [tag]
      );
      await this.db.run(
        `UPDATE app_settings SET setting_value = ? WHERE setting_key = 'update_check_last_run'`,
        [nowIso]
      );
      await this.db.run(
        `UPDATE app_settings SET setting_value = ? WHERE setting_key = 'update_available'`,
        [updateAvailable ? 'true' : 'false']
      );

      if (!updateAvailable) {
        logger.info(`MatchExec is up to date (${tag})`);
        return;
      }

      logger.info(`New version available: ${tag} (current: v${packageJson.version})`);

      const existing = await this.db.get<{ id: string }>(
        `SELECT id FROM activity_feed
         WHERE event_type = 'update_available'
         AND json_extract(metadata, '$.latestVersion') = ?`,
        [tag]
      );

      if (existing) {
        logger.debug(`Feed event for ${tag} already exists, skipping duplicate`);
        return;
      }

      await logFeedEvent({
        eventType: 'update_available',
        priority: 2,
        title: `MatchExec ${tag} is available`,
        description: `You are running v${packageJson.version}. A new release is available.`,
        metadata: {
          currentVersion: `v${packageJson.version}`,
          latestVersion: tag,
          releaseUrl: `https://github.com/slamanna212/matchexec/releases/tag/${tag}`,
        }
      });
    } catch (error) {
      logger.error('Update check failed:', error);
    }
  }

  isWithinRateLimit(): boolean {
    return false;
  }

  async isRateLimited(): Promise<boolean> {
    const row = await this.db.get<{ setting_value: string }>(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'update_check_last_run'`
    );
    if (!row?.setting_value) return false;
    const lastRun = new Date(row.setting_value).getTime();
    return (Date.now() - lastRun) < RATE_LIMIT_SECONDS * 1000;
  }
}
