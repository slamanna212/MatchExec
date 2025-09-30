import { BaseLogger, LogLevel } from './base';
import { getDbInstance } from '../database-init';

class ServerLogger extends BaseLogger {
  protected async loadLogLevel(): Promise<void> {
    try {
      // Check cache first
      if (this.levelCache && Date.now() - this.levelCache.timestamp < this.cacheDuration) {
        this.currentLevel = this.levelCache.level;
        return;
      }

      const db = await getDbInstance();
      const result = await db.get(
        'SELECT setting_value FROM app_settings WHERE setting_key = ?',
        ['log_level']
      ) as { setting_value: string } | undefined;

      if (result && this.isValidLogLevel(result.setting_value)) {
        this.currentLevel = result.setting_value as LogLevel;
        this.levelCache = {
          level: this.currentLevel,
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      // Fallback to warning if database not available
      this.currentLevel = 'warning';
    }
  }
}

// Export singleton instance
export const logger = new ServerLogger();
export type { LogLevel };
