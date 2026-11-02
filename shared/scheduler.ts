/**
 * Scheduler defaults, shared by the settings API, the settings page and the scheduler process, so the page shows what
 * the scheduler actually runs. (The table's own column defaults were different, so the first save used to change them.)
 */
/** Match start check + reminders: every minute. */
export const DEFAULT_MATCH_CHECK_CRON = '0 */1 * * * *';
/** Channel name refresh: daily at midnight. */
export const DEFAULT_CHANNEL_REFRESH_CRON = '0 0 0 * * *';
/** A cron for these jobs may not fire more often than this; `* * * * * *` would run them every second. */
export const MIN_CRON_INTERVAL_SECONDS = 10;
