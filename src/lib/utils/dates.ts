/**
 * Parse a SQLite UTC timestamp string to a Date object.
 *
 * SQLite's CURRENT_TIMESTAMP returns "2025-08-08 22:52:51" with no timezone marker.
 * The values are stored as UTC, so we append 'Z' to ensure correct parsing.
 * Strings that already include timezone info (trailing Z or ±HH:MM) are passed through.
 */
export function parseDbTimestamp(timestamp: string | null | undefined): Date | null {
  if (!timestamp) return null;
  if (timestamp.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }
  return new Date(`${timestamp}Z`);
}
