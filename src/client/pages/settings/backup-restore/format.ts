export type BackupPreset = 'daily' | '12h' | 'weekly' | 'custom';

export const PRESET_OPTIONS: Array<{ value: BackupPreset; label: string; line: string }> = [
  { value: 'daily', label: 'Daily', line: 'Daily at 04:00' },
  { value: '12h', label: 'Every 12 hours', line: 'Every 12 hours (04:00 and 16:00)' },
  { value: 'weekly', label: 'Weekly', line: 'Weekly on Sunday at 04:00' },
  { value: 'custom', label: 'Custom', line: 'Custom schedule' },
];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const time = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "Today, 04:00" / "Yesterday, 04:00" / "Wed, Nov 4, 04:00". */
export function formatBackupDate(date: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 864e5);
  if (days === 0) return `Today, ${time(date)}`;
  if (days === 1) return `Yesterday, ${time(date)}`;
  return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${time(date)}`;
}

/** Lower-cased prose form: "today at 04:00", "yesterday at 04:00", "Wed, Nov 4 at 04:00". */
export function formatBackupDateProse(date: Date, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 864e5);
  if (days === 0) return `today at ${time(date)}`;
  if (days === 1) return `yesterday at ${time(date)}`;
  return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${time(date)}`;
}

/**
 * Next scheduled run for the three presets, as prose ("today at 16:00", "tomorrow at 04:00", "Sunday at 04:00").
 * Computed from the browser clock, so it assumes the browser and the server share a time zone. Returns null for custom
 * cron expressions (the server is the only thing that can evaluate those).
 */
export function nextRunLabel(preset: BackupPreset, now: Date = new Date()): string | null {
  const minutes = now.getHours() * 60 + now.getMinutes();
  switch (preset) {
    case 'daily':
      return minutes < 4 * 60 ? 'today at 04:00' : 'tomorrow at 04:00';
    case '12h':
      if (minutes < 4 * 60) return 'today at 04:00';
      if (minutes < 16 * 60) return 'today at 16:00';
      return 'tomorrow at 04:00';
    case 'weekly':
      return now.getDay() === 0 && minutes < 4 * 60 ? 'today at 04:00' : 'Sunday at 04:00';
    default:
      return null;
  }
}
