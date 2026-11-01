/**
 * @module reminder-helpers
 * @description Helper functions for processing match reminders and announcements
 *
 * This module provides utilities for parsing announcement data from the database,
 * calculating announcement times, and checking announcement status.
 */

import type { Executor } from '../../lib/db';
import { getTimedAnnouncement } from './discord-queues';

interface Announcement {
  id: string;
  value: number;
  unit: 'minutes' | 'hours' | 'days';
}

interface ScheduledAnnouncement {
  id: string;
  match_id: string;
  reminder_time: string;
  status: string;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  type: 'timed_announcement';
  description: string;
  timing: { value: number; unit: string };
}

/**
 * Parses the announcements field from a match record
 *
 * Handles multiple formats:
 * - JSON string (array of announcements)
 * - Boolean/number (uses defaults if truthy)
 * - Object (returns as-is)
 *
 * @param announcements - The announcements field from the database
 * @returns Array of announcements or null if disabled/invalid
 *
 * @example
 * const announcements = parseAnnouncementsField('[{"id":"1hour","value":1,"unit":"hours"}]');
 */
export function parseAnnouncementsField(announcements: unknown): Announcement[] | null {
  if (typeof announcements === 'string') {
    try {
      return JSON.parse(announcements);
    } catch {
      return null;
    }
  }

  if (typeof announcements === 'number' || typeof announcements === 'boolean') {
    if (announcements) {
      return [
        { id: 'default_1hour', value: 1, unit: 'hours' },
        { id: 'default_30min', value: 30, unit: 'minutes' }
      ];
    }
    return null;
  }

  if (typeof announcements === 'object' && announcements !== null) {
    return announcements as Announcement[];
  }

  return null;
}

/**
 * Calculates when an announcement should be sent
 *
 * Subtracts the specified time offset from the match start date.
 *
 * @param startDate - Match start date
 * @param value - Time offset value
 * @param unit - Time unit ('minutes', 'hours', or 'days')
 * @returns Date when announcement should be sent
 *
 * @example
 * const matchStart = new Date('2025-12-01T15:00:00Z');
 * const announceTime = calculateAnnouncementTime(matchStart, 1, 'hours');
 * // Returns: 2025-12-01T14:00:00Z
 */
export function calculateAnnouncementTime(startDate: Date, value: number, unit: string): Date {
  let millisecondsOffset = 0;

  switch (unit) {
    case 'minutes':
      millisecondsOffset = value * 60 * 1000;
      break;
    case 'hours':
      millisecondsOffset = value * 60 * 60 * 1000;
      break;
    case 'days':
      millisecondsOffset = value * 24 * 60 * 60 * 1000;
      break;
  }

  return new Date(startDate.getTime() - millisecondsOffset);
}

/**
 * Retrieves the status of an announcement from the Discord queue
 *
 * Checks if the announcement has been queued, sent, or failed.
 *
 * @param ex - Postgres executor (the queue tables live in Postgres)
 * @param matchId - ID of the match
 * @param announcement - Announcement object
 * @param announcementTime - Calculated time for announcement
 * @returns Object with status, sentAt, and errorMessage
 */
export async function getAnnouncementStatus(
  ex: Executor,
  matchId: string,
  announcement: Announcement,
  announcementTime: Date
): Promise<{ status: string; sentAt: string | null; errorMessage: string | null }> {
  const queuedAnnouncement = await getTimedAnnouncement(ex, matchId, announcement as unknown as Record<string, unknown>);

  if (queuedAnnouncement) {
    return {
      status: queuedAnnouncement.status === 'completed' ? 'sent' : queuedAnnouncement.status,
      sentAt: queuedAnnouncement.posted_at ? queuedAnnouncement.posted_at.toISOString() : null,
      errorMessage: queuedAnnouncement.last_error || null
    };
  }

  if (announcementTime <= new Date()) {
    return {
      status: 'scheduled',
      sentAt: null,
      errorMessage: null
    };
  }

  return {
    status: 'pending',
    sentAt: null,
    errorMessage: null
  };
}

/**
 * Creates a scheduled announcement object for API response
 *
 * @param matchId - ID of the match
 * @param announcement - Announcement definition
 * @param announcementTime - When announcement should be sent
 * @param status - Current status of announcement
 * @param sentAt - When announcement was sent (if applicable)
 * @param errorMessage - Error message (if failed)
 * @param now - Current timestamp
 * @returns Formatted scheduled announcement object
 */
export function createScheduledAnnouncement(
  matchId: string,
  announcement: Announcement,
  announcementTime: Date,
  status: string,
  sentAt: string | null,
  errorMessage: string | null,
  now: string
): ScheduledAnnouncement {
  return {
    id: `announcement_${announcement.id}`,
    match_id: matchId,
    reminder_time: announcementTime.toISOString(),
    status,
    error_message: errorMessage,
    created_at: now,
    sent_at: sentAt,
    type: 'timed_announcement',
    description: `${announcement.value} ${announcement.unit} before start`,
    timing: { value: announcement.value, unit: announcement.unit }
  };
}

/**
 * Processes all announcements configured for a match
 *
 * Parses the announcements field, calculates timing, checks status,
 * and returns formatted scheduled announcements.
 *
 * @param ex - Postgres executor (the queue tables live in Postgres)
 * @param matchId - ID of the match
 * @param announcementsField - Raw announcements data from database
 * @param startDate - Match start date (ISO string)
 * @param now - Current timestamp (ISO string)
 * @returns Array of scheduled announcements
 *
 * @example
 * const announcements = await processMatchAnnouncements(
 *   db,
 *   'match_123',
 *   '[{"id":"1hour","value":1,"unit":"hours"}]',
 *   '2025-12-01T15:00:00Z',
 *   new Date().toISOString()
 * );
 */
export async function processMatchAnnouncements(
  ex: Executor,
  matchId: string,
  announcementsField: unknown,
  startDate: string,
  now: string
): Promise<ScheduledAnnouncement[]> {
  const announcements = parseAnnouncementsField(announcementsField);

  if (!announcements) {
    return [];
  }

  const scheduledAnnouncements: ScheduledAnnouncement[] = [];
  const matchStartDate = new Date(startDate);

  for (const announcement of announcements) {
    const announcementTime = calculateAnnouncementTime(
      matchStartDate,
      announcement.value,
      announcement.unit
    );

    const { status, sentAt, errorMessage } = await getAnnouncementStatus(
      ex,
      matchId,
      announcement,
      announcementTime
    );

    scheduledAnnouncements.push(
      createScheduledAnnouncement(
        matchId,
        announcement,
        announcementTime,
        status,
        sentAt,
        errorMessage,
        now
      )
    );
  }

  return scheduledAnnouncements;
}
