// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  debug: '\x1b[90m',      // Gray
  info: '\x1b[36m',       // Cyan
  warning: '\x1b[33m',    // Yellow
  error: '\x1b[31m',      // Red
  critical: '\x1b[1m\x1b[91m', // Bold Bright Red
};

// Log level hierarchy
export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
  critical: 4,
};

export type LogFormat = 'text' | 'json';

export abstract class BaseLogger {
  protected currentLevel: LogLevel = 'warning';
  protected levelCache: { level: LogLevel; timestamp: number } | null = null;
  protected cacheDuration = 5000; // 5 seconds
  protected supportsColor: boolean;
  protected logFormat: LogFormat;
  protected reloadInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Detect if terminal supports colors
    this.supportsColor =
      typeof process !== 'undefined' &&
      process.stdout &&
      process.stdout.isTTY !== false &&
      process.env.TERM !== 'dumb';

    // Determine log format from environment variable (infrastructure-level config)
    const envFormat = typeof process !== 'undefined' ? process.env.LOG_FORMAT : undefined;
    this.logFormat = envFormat === 'json' ? 'json' : 'text';

    // Load initial level from database (async, completes in background)
    this.loadLogLevel();

    // Set up periodic reload every 5 seconds
    this.reloadInterval = setInterval(() => {
      this.loadLogLevel();
    }, this.cacheDuration);
  }

  // Abstract method - subclasses must implement
  protected abstract loadLogLevel(): Promise<void>;

  protected isValidLogLevel(level: string): level is LogLevel {
    return level in LOG_LEVELS;
  }

  protected shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.currentLevel];
  }

  protected formatMessage(level: LogLevel, args: unknown[]): string {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const levelStr = `[${level.toUpperCase()}]`;
    const message = args.map(arg => {
      if (arg instanceof Error) {
        // Serialize Error objects with message, stack, and other properties
        const errorObj: Record<string, unknown> = {
          message: arg.message,
          name: arg.name,
          stack: arg.stack,
        };
        // Include any additional enumerable properties
        Object.keys(arg).forEach(key => {
          errorObj[key] = (arg as unknown as Record<string, unknown>)[key];
        });
        return JSON.stringify(errorObj);
      }
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }).join(' ');

    return `[${timestamp}] ${levelStr} ${message}`;
  }

  protected formatJsonMessage(level: LogLevel, args: unknown[]): string {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: level,
      severity: LOG_LEVELS[level],
    };

    // Separate errors from other args
    const errors: Error[] = [];
    const messages: string[] = [];

    for (const arg of args) {
      if (arg instanceof Error) {
        errors.push(arg);
      } else if (typeof arg === 'object' && arg !== null) {
        // Merge object properties directly into the log entry
        Object.assign(entry, arg);
      } else {
        messages.push(String(arg));
      }
    }

    if (messages.length > 0) {
      entry.message = messages.join(' ');
    }

    if (errors.length > 0) {
      const err = errors[0];
      entry.error = {
        message: err.message,
        name: err.name,
        stack: err.stack,
      };
    }

    return JSON.stringify(entry);
  }

  protected log(level: LogLevel, args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    if (this.logFormat === 'json') {
      const jsonLine = this.formatJsonMessage(level, args);
      // In JSON mode, always use console.log for consistent machine parsing
      // (stderr vs stdout distinction is handled by log level field)
      switch (level) {
        case 'error':
        case 'critical':
          console.error(jsonLine);
          break;
        default:
          console.log(jsonLine);
          break;
      }
      return;
    }

    const formattedMessage = this.formatMessage(level, args);
    const colorCode = this.supportsColor ? colors[level] : '';
    const resetCode = this.supportsColor ? colors.reset : '';

    // Output to appropriate console method
    const output = `${colorCode}${formattedMessage}${resetCode}`;

    switch (level) {
      case 'debug':
      case 'info':
        console.log(output);
        break;
      case 'warning':
        console.warn(output);
        break;
      case 'error':
      case 'critical':
        console.error(output);
        break;
    }
  }

  public debug(...args: unknown[]): void {
    this.log('debug', args);
  }

  public info(...args: unknown[]): void {
    this.log('info', args);
  }

  public warning(...args: unknown[]): void {
    this.log('warning', args);
  }

  public error(...args: unknown[]): void {
    this.log('error', args);
  }

  public critical(...args: unknown[]): void {
    this.log('critical', args);
  }

  // Force reload log level from database (call after updating settings)
  public async reload(): Promise<void> {
    this.levelCache = null;
    await this.loadLogLevel();
  }

  // Get current log level
  public getCurrentLevel(): LogLevel {
    return this.currentLevel;
  }

  // Cleanup method to stop the reload interval
  public destroy(): void {
    if (this.reloadInterval) {
      clearInterval(this.reloadInterval);
      this.reloadInterval = null;
    }
  }
}
