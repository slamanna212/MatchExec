import type { LogLevel } from './base';
import { BaseLogger } from './base';
import { getAppSetting } from '../settings';

class ServerLogger extends BaseLogger {
  protected async loadLogLevel(): Promise<void> {
    try {
      // Check cache first
      if (this.levelCache && Date.now() - this.levelCache.timestamp < this.cacheDuration) {
        this.currentLevel = this.levelCache.level;
        return;
      }

      const result = await getAppSetting('log_level');

      if (result && this.isValidLogLevel(result)) {
        this.currentLevel = result;
        this.levelCache = {
          level: this.currentLevel,
          timestamp: Date.now(),
        };
      }
    } catch {
      // Fallback to warning if database not available
      this.currentLevel = 'warning';
    }
  }
}

// Export singleton instance
export const logger = new ServerLogger();
export type { LogLevel };
