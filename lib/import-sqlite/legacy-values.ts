/** Value conversions that need more than the generic column-type coercion. */
import type { AnnouncementConfig } from '../db/schema/types';
import { CoerceIssue, parseJson } from './coerce';
import type { RawValue } from './coerce';

/** Default timings for rows where the (misdeclared BOOLEAN) announcements column holds a plain 1. Mirrors parseAnnouncementsField. */
export const DEFAULT_ANNOUNCEMENTS: AnnouncementConfig = [
  { id: 'default_1hour', value: 1, unit: 'hours' },
  { id: 'default_30min', value: 30, unit: 'minutes' },
];

/**
 * `matches.announcements` / `tournaments.announcements`: the SQLite column was declared BOOLEAN DEFAULT 1 but really holds
 * a JSON array of {id,value,unit}, or 0/1 on very old rows. 0 / NULL / '' -> null, 1 -> default timings, JSON array -> as is.
 */
export function announcementsFromLegacy(raw: RawValue): AnnouncementConfig {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw === 0 || raw === 0n || raw === false || raw === '0') return null;
  if (raw === 1 || raw === 1n || raw === true || raw === '1') return structuredClone(DEFAULT_ANNOUNCEMENTS);
  const parsed = parseJson(raw);
  if (parsed === null || parsed === 0 || parsed === false) return null;
  if (parsed === 1 || parsed === true) return structuredClone(DEFAULT_ANNOUNCEMENTS);
  if (!Array.isArray(parsed)) throw new CoerceIssue('invalid_json', `announcements must be a JSON array, found ${JSON.stringify(parsed).slice(0, 60)}`);
  return parsed as AnnouncementConfig;
}
