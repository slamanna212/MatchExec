import type { LogLevel } from './base';
import { BaseLogger } from './base';

class ClientLogger extends BaseLogger {
  constructor() {
    super();
    // Disable colors in browser
    this.supportsColor = false;
  }

  protected async loadLogLevel(): Promise<void> {
    // Client side uses default 'warning' level
    // Could be enhanced to fetch from API or localStorage if needed
    this.currentLevel = 'warning';
  }
}

// Export singleton instance
export const logger = new ClientLogger();
export type { LogLevel };
