import { getDbInstance } from '../../../../lib/database-init';
import { logger } from '@/lib/logger';
import { apiError, apiOk } from '@/lib/api-response';
import { type NextRequest } from 'next/server';

type NotificationType =
  | 'match_announcement'
  | 'tournament_announcement'
  | 'match_start'
  | 'timed_reminder'
  | 'map_score'
  | 'match_winner'
  | 'tournament_winner'
  | 'health_alert_critical'
  | 'health_alert_warning';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`; // NOSONAR: non-security internal ID generation
}

async function queueMatchAnnouncement(db: Awaited<ReturnType<typeof getDbInstance>>, type: 'standard' | 'match_start' | 'timed', announcementData?: string): Promise<string> {
  const match = await db.get<{ id: string; name: string }>(`SELECT id, name FROM matches ORDER BY created_at DESC LIMIT 1`);
  if (!match) throw new Error('No matches found. Create a match first.');

  const id = generateId('debug_announce');
  await db.run(
    `INSERT INTO discord_announcement_queue (id, match_id, announcement_type, announcement_data, status) VALUES (?, ?, ?, ?, 'pending')`,
    [id, match.id, type, announcementData ?? null]
  );
  return `Queued ${type} announcement for match "${match.name}"`;
}

async function queueTournamentAnnouncement(db: Awaited<ReturnType<typeof getDbInstance>>): Promise<string> {
  const tournament = await db.get<{ id: string; name: string }>(`SELECT id, name FROM tournaments ORDER BY created_at DESC LIMIT 1`);
  if (!tournament) throw new Error('No tournaments found. Create a tournament first.');

  const id = generateId('debug_announce');
  await db.run(
    `INSERT INTO discord_announcement_queue (id, match_id, announcement_type, status) VALUES (?, ?, 'tournament', 'pending')`,
    [id, tournament.id]
  );
  return `Queued tournament announcement for "${tournament.name}"`;
}

async function queueMapScore(db: Awaited<ReturnType<typeof getDbInstance>>): Promise<string> {
  const match = await db.get<{ id: string; name: string; game_id: string }>(`SELECT id, name, game_id FROM matches ORDER BY created_at DESC LIMIT 1`);
  if (!match) throw new Error('No matches found. Create a match first.');

  const id = generateId('debug_score');
  await db.run(
    `INSERT INTO discord_score_notification_queue (id, match_id, game_id, map_id, game_number, winner, winning_team_name, winning_players, status)
     VALUES (?, ?, ?, 'unknown', 1, 'team1', 'Blue Team', '["TestPlayer1","TestPlayer2"]', 'pending')`,
    [id, match.id, match.game_id || 'overwatch2']
  );
  return `Queued map score notification for match "${match.name}"`;
}

async function queueMatchWinner(db: Awaited<ReturnType<typeof getDbInstance>>): Promise<string> {
  const match = await db.get<{ id: string; name: string; game_id: string }>(`SELECT id, name, game_id FROM matches ORDER BY created_at DESC LIMIT 1`);
  if (!match) throw new Error('No matches found. Create a match first.');

  const id = generateId('debug_winner');
  await db.run(
    `INSERT INTO discord_match_winner_queue (id, match_id, match_name, game_id, winner, winning_team_name, winning_players, team1_score, team2_score, total_maps, status)
     VALUES (?, ?, ?, ?, 'team1', 'Blue Team', '["TestPlayer1","TestPlayer2"]', 2, 1, 3, 'pending')`,
    [id, match.id, match.name, match.game_id || 'overwatch2']
  );
  return `Queued match winner notification for match "${match.name}" (note: sends after 15s delay)`;
}

async function queueTournamentWinner(db: Awaited<ReturnType<typeof getDbInstance>>): Promise<string> {
  const tournament = await db.get<{ id: string; name: string; game_id: string; max_participants: number }>(`SELECT id, name, game_id, max_participants FROM tournaments ORDER BY created_at DESC LIMIT 1`);
  if (!tournament) throw new Error('No tournaments found. Create a tournament first.');

  const id = generateId('debug_twinner');
  await db.run(
    `INSERT INTO discord_match_winner_queue (id, match_id, match_name, game_id, winner, winning_team_name, winning_players, team1_score, team2_score, total_maps, status)
     VALUES (?, ?, ?, ?, 'tournament', 'Test Team Alpha', '["TestPlayer1","TestPlayer2"]', ?, 0, 0, 'pending')`,
    [id, tournament.id, `🏆 ${tournament.name}`, tournament.game_id || 'overwatch2', tournament.max_participants || 8]
  );
  return `Queued tournament winner notification for "${tournament.name}"`;
}

async function queueHealthAlert(db: Awaited<ReturnType<typeof getDbInstance>>, severity: 'critical' | 'warning'): Promise<string> {
  const id = generateId('debug_health');
  const title = severity === 'critical' ? 'Test Critical Alert' : 'Test Warning Alert';
  const description = severity === 'critical'
    ? 'This is a test critical health alert triggered from the dev page.'
    : 'This is a test warning health alert triggered from the dev page.';

  await db.run(
    `INSERT INTO discord_health_alert_queue (id, severity, title, description, status) VALUES (?, ?, ?, ?, 'pending')`,
    [id, severity, title, description]
  );
  return `Queued ${severity} health alert`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const notificationType = body.type as NotificationType;

    if (!notificationType) {
      return apiError('Missing notification type', 400);
    }

    const db = await getDbInstance();
    let message: string;

    switch (notificationType) {
      case 'match_announcement':
        message = await queueMatchAnnouncement(db, 'standard');
        break;
      case 'tournament_announcement':
        message = await queueTournamentAnnouncement(db);
        break;
      case 'match_start':
        message = await queueMatchAnnouncement(db, 'match_start');
        break;
      case 'timed_reminder':
        message = await queueMatchAnnouncement(db, 'timed', JSON.stringify({ value: 30, unit: 'minutes' }));
        break;
      case 'map_score':
        message = await queueMapScore(db);
        break;
      case 'match_winner':
        message = await queueMatchWinner(db);
        break;
      case 'tournament_winner':
        message = await queueTournamentWinner(db);
        break;
      case 'health_alert_critical':
        message = await queueHealthAlert(db, 'critical');
        break;
      case 'health_alert_warning':
        message = await queueHealthAlert(db, 'warning');
        break;
      default:
        return apiError(`Unknown notification type: ${notificationType}`, 400);
    }

    logger.info(`[Dev] Discord notification test queued: ${notificationType}`);
    return apiOk({ message });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error queuing test Discord notification:', error);
    return apiError(errorMessage);
  }
}
