import { logger } from '@/lib/logger';

/**
 * Restarts the Discord bot process after its settings changed.
 * Development: PM2 restart (starts it if it is not running).
 * Production: SIGTERM the process; s6-overlay restarts it.
 */
export async function restartDiscordBot(): Promise<void> {
  try {
    const { execFile } = await import('child_process');
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
      const processName = 'discord-bot-dev';
      execFile('pnpm', ['exec', 'pm2', 'describe', processName], (error) => {
        if (error) {
          logger.debug(`🚀 Starting ${processName} process (not currently running)`);
          execFile('pnpm', ['exec', 'pm2', 'start', 'ecosystem.config.js', '--only', processName], (startError) => {
            if (startError) logger.error(`❌ Error starting ${processName}:`, startError.message);
            else logger.debug(`✅ Successfully started ${processName} process`);
          });
        } else {
          logger.debug(`🔄 Restarting ${processName} process due to Discord settings change`);
          execFile('pnpm', ['exec', 'pm2', 'restart', processName], (restartError) => {
            if (restartError) logger.error(`❌ Error restarting ${processName}:`, restartError.message);
            else logger.debug(`✅ Successfully restarted ${processName} process`);
          });
        }
      });
    } else {
      logger.debug('🔄 Restarting Discord bot process due to Discord settings change');
      execFile('pkill', ['-TERM', '-f', 'node dist/discord-bot.js'], (error) => {
        if (error) {
          const exitCode = (error as NodeJS.ErrnoException & { code?: number }).code;
          if (exitCode === 1) {
            logger.debug('ℹ️ Discord bot was not running when restart triggered (will be restarted automatically)');
          } else {
            logger.error('❌ Error restarting Discord bot:', error.message);
          }
        } else {
          logger.debug('✅ Discord bot restart triggered');
        }
      });
    }
  } catch (error) {
    logger.error('❌ Error managing Discord bot process:', error);
  }
}
