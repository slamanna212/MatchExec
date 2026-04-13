import type { NextRequest } from 'next/server';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { queueScoreNotification } from '@/lib/scoring-functions';
import type { MatchResult } from '@/shared/types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; submissionId: string }> }
) {
  try {
    const { matchId, submissionId } = await params;
    const body = await request.json();
    const { assignments } = body as { assignments: Array<{ playerStatId: string; participantId: string }> };

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return apiError('assignments array is required', 400);
    }

    const db = await getDbInstance();

    const submission = await db.get<{ id: string }>(
      'SELECT id FROM scorecard_submissions WHERE id = ? AND match_id = ?',
      [submissionId, matchId]
    );

    if (!submission) {
      return apiError('Submission not found', 404);
    }

    for (const assignment of assignments) {
      await db.run(
        `UPDATE scorecard_player_stats SET participant_id = ?, assignment_status = 'assigned' WHERE id = ? AND submission_id = ?`,
        [assignment.participantId, assignment.playerStatId, submissionId]
      );
    }

    // Trigger held Discord notification for stats-enabled matches
    try {
      const submissionRow = await db.get<{ match_game_id: string }>(
        'SELECT match_game_id FROM scorecard_submissions WHERE id = ?', [submissionId]
      );
      if (submissionRow) {
        const gameRow = await db.get<{
          discord_notified: number;
          winner_id: string;
          is_ffa_mode: number;
          participant_winner_id: string | null;
          match_stats_enabled: number;
        }>(`SELECT mg.discord_notified, mg.winner_id, mg.is_ffa_mode,
            mg.participant_winner_id, m.stats_enabled as match_stats_enabled
            FROM match_games mg JOIN matches m ON mg.match_id = m.id
            WHERE mg.id = ?`, [submissionRow.match_game_id]);

        if (gameRow?.match_stats_enabled && !gameRow.discord_notified) {
          const result: MatchResult = {
            matchId,
            gameId: submissionRow.match_game_id,
            winner: gameRow.winner_id as 'team1' | 'team2',
            isFfaMode: Boolean(gameRow.is_ffa_mode),
            participantWinnerId: gameRow.participant_winner_id ?? undefined,
            completedAt: new Date(),
          };
          await queueScoreNotification(submissionRow.match_game_id, result);
          await db.run('UPDATE match_games SET discord_notified = 1 WHERE id = ?', [submissionRow.match_game_id]);
          logger.info(`Queued held Discord notification for stats-enabled map: ${submissionRow.match_game_id}`);
        }
      }
    } catch (notifError) {
      logger.error('Error triggering held Discord notification after stats assignment:', notifError);
      // Non-critical — don't fail the assignment
    }

    return apiOk({ success: true });
  } catch (error) {
    logger.error('Error assigning participants:', error);
    return apiError('Failed to assign participants');
  }
}
