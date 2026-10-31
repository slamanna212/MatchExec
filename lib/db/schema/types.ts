// Shared TypeScript shapes for jsonb columns (used with .$type<...>()).

/** `games.scoring_config`, `matches.position_scoring_override`, `tournaments.position_scoring_override`. */
export interface PositionScoringConfig {
  type: 'Position';
  pointsPerPosition: Record<string, number>;
}

/** One reminder/announcement timing entry (see `parseAnnouncementsField` in src/lib/reminder-helpers.ts). */
export interface Announcement {
  id: string;
  value: number;
  unit: 'minutes' | 'hours' | 'days';
  [key: string]: unknown;
}

/**
 * `matches.announcements` / `tournaments.announcements`.
 * `null` = no announcements. The legacy SQLite column was declared BOOLEAN but really held a JSON array
 * (or 0/1 on very old rows); the SQLite importer maps 0 -> null and 1 -> the default timings.
 */
export type AnnouncementConfig = Announcement[] | null;
