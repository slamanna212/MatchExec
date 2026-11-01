/**
 * Registry of every queue / job table a worker polls (plan 1.4). All 19 share the same worker columns:
 * status, attempts, max_attempts, claimed_at, claimed_by, next_attempt_at, last_error, processed_at.
 */
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
  discordAnnouncementQueue, discordBotRequests, discordDeletionQueue, discordHealthAlertQueue, discordMapCodeQueue,
  discordMatchEditQueue, discordMatchReminderQueue, discordMatchStartQueue, discordMatchWinnerQueue,
  discordPlayerReminderQueue, discordReminderQueue, discordScoreNotificationQueue, discordScorecardPromptQueue,
  discordStatsReportQueue, discordStatusUpdateQueue, discordVoiceAnnouncementQueue, discordWinnerVoteQueue,
  statsImageQueue, statsProcessingQueue,
} from '../../../lib/db/schema';

export const QUEUE_TABLES = {
  announcement: discordAnnouncementQueue,
  botRequest: discordBotRequests,
  deletion: discordDeletionQueue,
  healthAlert: discordHealthAlertQueue,
  mapCode: discordMapCodeQueue,
  matchEdit: discordMatchEditQueue,
  matchReminder: discordMatchReminderQueue,
  matchStart: discordMatchStartQueue,
  matchWinner: discordMatchWinnerQueue,
  playerReminder: discordPlayerReminderQueue,
  reminder: discordReminderQueue,
  scoreNotification: discordScoreNotificationQueue,
  scorecardPrompt: discordScorecardPromptQueue,
  statsReport: discordStatsReportQueue,
  statusUpdate: discordStatusUpdateQueue,
  voiceAnnouncement: discordVoiceAnnouncementQueue,
  winnerVote: discordWinnerVoteQueue,
  statsImage: statsImageQueue,
  statsProcessing: statsProcessingQueue,
} as const;

export type QueueName = keyof typeof QUEUE_TABLES;
export type QueueRow<N extends QueueName> = (typeof QUEUE_TABLES)[N]['$inferSelect'];

export const QUEUE_NAMES = Object.keys(QUEUE_TABLES) as QueueName[];

/** Terminal "success" status: `sent` for the two prompt queues, `completed` for the rest. */
export type FinalStatus = 'completed' | 'sent';

export interface QueueConfig {
  /** A claim older than this is considered abandoned (worker crashed). */
  abandonAfterMs: number;
  /** What to do with an abandoned claim: put it back to pending (default) or fail it (non-idempotent work). */
  onAbandon: 'retry' | 'fail';
}

const DEFAULT_CONFIG: QueueConfig = { abandonAfterMs: 5 * 60_000, onAbandon: 'retry' };

const OVERRIDES: Partial<Record<QueueName, Partial<QueueConfig>>> = {
  // Voice lines are short; the old per-row timeout was 2 minutes.
  voiceAnnouncement: { abandonAfterMs: 2 * 60_000 },
  // Bot requests are RPC calls (create/delete channels); replaying one would duplicate side effects and the
  // caller has long given up (it polls for <= 45s), so an abandoned one just fails.
  botRequest: { abandonAfterMs: 5 * 60_000, onAbandon: 'fail' },
  // AI extraction can legitimately run for a few minutes.
  statsProcessing: { abandonAfterMs: 10 * 60_000 },
  statsImage: { abandonAfterMs: 10 * 60_000 },
};

export function queueConfig(queue: QueueName): QueueConfig {
  return { ...DEFAULT_CONFIG, ...OVERRIDES[queue] };
}

/** Queues that record the id of the Discord message they posted (`external_message_id`). */
export const EXTERNAL_RESULT_QUEUES = [
  'announcement', 'healthAlert', 'matchReminder', 'matchStart', 'matchWinner', 'playerReminder', 'reminder',
  'scoreNotification', 'scorecardPrompt', 'winnerVote',
] as const satisfies readonly QueueName[];
export type ExternalResultQueue = (typeof EXTERNAL_RESULT_QUEUES)[number];

/** The columns every queue table shares, loosely typed so generic worker code can build queries. */
export interface WorkerColumns {
  id: AnyPgColumn;
  status: AnyPgColumn;
  attempts: AnyPgColumn;
  max_attempts: AnyPgColumn;
  claimed_at: AnyPgColumn;
  claimed_by: AnyPgColumn;
  next_attempt_at: AnyPgColumn;
  last_error: AnyPgColumn;
  processed_at: AnyPgColumn;
  created_at: AnyPgColumn;
}

export function workerColumns(queue: QueueName): { table: PgTable; c: WorkerColumns } {
  const table = QUEUE_TABLES[queue];
  return { table, c: table as unknown as WorkerColumns };
}
