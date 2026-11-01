// @vitest-environment node
/** Web <-> bot contract: what the enqueue functions write is exactly what a bot claim reads (typed, jsonb parsed, Dates). */
import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { setupPgTestFile } from '../../utils/pg-test-db';
import { seedQueueFixtures } from '../../utils/pg-queue-fixtures';
import { db } from '../../../lib/db';
import {
  claimJobs, enqueueAnnouncement, enqueueBotRequest, enqueueDeletion, enqueueHealthAlert, enqueueMapCode, enqueueMatchEdit,
  enqueueMatchReminder, enqueueMatchStart, enqueueMatchWinner, enqueuePlayerReminder, enqueueScoreNotification,
  enqueueScorecardPrompt, enqueueStatsImage, enqueueStatsProcessing, enqueueStatsReport, enqueueStatusUpdate,
  enqueueVoiceAnnouncement, enqueueWinnerVote,
} from '../../../src/lib/discord-queues';

setupPgTestFile();
beforeEach(async () => { await seedQueueFixtures(); });

describe('enqueue -> claim round trips', () => {
  it('announcement (timed): jsonb payload and scheduled_for survive', async () => {
    const data = { id: '1hour', value: 1, unit: 'hours' };
    await enqueueAnnouncement(db, { matchId: 'm1', type: 'timed', data, scheduledFor: new Date(Date.now() - 1000) });
    const [row] = await claimJobs(db, 'announcement');
    expect(row).toMatchObject({ match_id: 'm1', announcement_type: 'timed', announcement_data: data, status: 'processing' });
    expect(row!.scheduled_for).toBeInstanceOf(Date);
  });

  it('tournament announcement / status update / winner accept a tournament id', async () => {
    await enqueueAnnouncement(db, { matchId: 'tournament_1', type: 'tournament' });
    await enqueueStatusUpdate(db, 'tournament_1', 'assign');
    await enqueueMatchWinner(db, { matchId: 'tournament_1', matchName: '🏆 Cup', gameId: 'overwatch2', winner: 'tournament', winningTeamName: 'A', winningPlayers: ['<@1>', 'bob'], team1Score: 8, team2Score: 1, totalMaps: 1 });
    expect((await claimJobs(db, 'announcement'))[0]!.match_id).toBe('tournament_1');
    expect((await claimJobs(db, 'statusUpdate'))[0]).toMatchObject({ match_id: 'tournament_1', new_status: 'assign' });
    expect((await claimJobs(db, 'matchWinner'))[0]).toMatchObject({ winner: 'tournament', winning_players: ['<@1>', 'bob'], team1_score: 8, team2_score: 1, total_maps: 1 });
  });

  it('score notification stores the GAME id (not a match_games FK) and jsonb players', async () => {
    await enqueueScoreNotification(db, { matchId: 'm1', gameId: 'overwatch2', mapId: 'map', gameNumber: 2, winner: 'team1', winningTeamName: 'Blue', winningPlayers: ['a'] });
    expect((await claimJobs(db, 'scoreNotification'))[0]).toMatchObject({ game_id: 'overwatch2', game_number: 2, winner: 'team1', winning_players: ['a'] });
  });

  it('simple per-match queues', async () => {
    await enqueueDeletion(db, 'gone');
    await enqueueMatchEdit(db, 'm1');
    await enqueueMatchStart(db, 'm1');
    await enqueueMapCode(db, { matchId: 'm1', mapName: 'Hanamura', mapCode: 'ABC' });
    await enqueueStatsImage(db, 'm1');
    expect((await claimJobs(db, 'deletion'))[0]!.match_id).toBe('gone');
    expect((await claimJobs(db, 'matchEdit'))[0]!.match_id).toBe('m1');
    expect((await claimJobs(db, 'matchStart'))[0]!.match_id).toBe('m1');
    expect((await claimJobs(db, 'mapCode'))[0]).toMatchObject({ map_name: 'Hanamura', map_code: 'ABC' });
    expect((await claimJobs(db, 'statsImage'))[0]!.match_id).toBe('m1');
  });

  it('reminders, voice, prompts, stats, health, bot requests', async () => {
    const when = new Date(Date.now() - 1000);
    await enqueueMatchReminder(db, { matchId: 'm1', minutesBefore: 30, reminderTime: when });
    await enqueuePlayerReminder(db, { matchId: 'm1', reminderTime: when });
    await enqueueVoiceAnnouncement(db, { matchId: 'm1', type: 'welcome', blueChannel: 'b', redChannel: 'r', firstTeam: 'red' });
    await enqueueScorecardPrompt(db, { matchId: 'm', matchGameId: 'g', mapName: 'X' });
    await enqueueWinnerVote(db, { matchId: 'm', matchGameId: 'g', mapName: 'X' });
    await enqueueStatsProcessing(db, { submissionId: 'sub', matchId: 'm', matchGameId: 'g' });
    await enqueueStatsReport(db, 'm1');
    await enqueueHealthAlert(db, { title: 'T' });
    await enqueueBotRequest(db, 'voice_channel_create', { matchId: 'm1', channelNames: ['a', 'b'] });

    expect((await claimJobs(db, 'reminder'))[0]).toMatchObject({ reminder_type: 'match_reminder', minutes_before: 30 });
    expect((await claimJobs(db, 'playerReminder'))[0]).toMatchObject({ user_id: 'all', reminder_type: 'player_reminder' });
    expect((await claimJobs(db, 'voiceAnnouncement'))[0]).toMatchObject({ announcement_type: 'welcome', blue_team_voice_channel: 'b', red_team_voice_channel: 'r', first_team: 'red' });
    expect((await claimJobs(db, 'scorecardPrompt'))[0]).toMatchObject({ match_game_id: 'g', map_name: 'X' });
    expect((await claimJobs(db, 'winnerVote'))[0]).toMatchObject({ match_game_id: 'g' });
    expect((await claimJobs(db, 'statsProcessing'))[0]).toMatchObject({ submission_id: 'sub' });
    expect((await claimJobs(db, 'statsReport'))[0]!.match_id).toBe('m1');
    expect((await claimJobs(db, 'healthAlert'))[0]).toMatchObject({ severity: 'critical', title: 'T' });
    expect((await claimJobs(db, 'botRequest'))[0]).toMatchObject({ type: 'voice_channel_create', data: { matchId: 'm1', channelNames: ['a', 'b'] } });
  });

  it('status is a checked enum', async () => {
    await enqueueDeletion(db, 'x');
    await expect(db.execute(sql`UPDATE discord_deletion_queue SET status = 'bogus'`)).rejects.toThrow();
  });
});
