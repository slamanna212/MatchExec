/**
 * Parse an API timestamp to a Date.
 *
 * Every timestamp the API returns is a full ISO-8601 string with a UTC marker (`2025-08-08T22:52:51.000Z`),
 * so no timezone guessing is needed. Returns null for empty input.
 */
export function parseDbTimestamp(timestamp: string | null | undefined): Date | null {
  if (!timestamp) return null;
  return new Date(timestamp);
}
