// Helpers that build match_teams rows per scoring_type at the gather→assign transition.

import { getDbInstance } from './database-init';
import { logger } from './logger';

export const MAX_VOICE_CHANNELS_PER_MATCH = 8;

const NORMAL_TEAMS = [
  { name: 'Blue', color: '#4A90E2', order: 0 },
  { name: 'Red', color: '#E04A4A', order: 1 },
];

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // NOSONAR
}

/**
 * Create match_teams rows for a match based on its game mode's scoring_type.
 * Idempotent — skips if rows already exist.
 */
export async function createMatchTeams(matchId: string, teamCount?: number): Promise<void> {
  const db = await getDbInstance();

  const existing = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM match_teams WHERE match_id = ? AND is_reserve = 0`,
    [matchId]
  );
  if (existing && existing.cnt > 0) {
    logger.debug(`match_teams already exist for match ${matchId}, skipping`);
    return;
  }

  const modeRow = await db.get<{ scoring_type?: string; mode_id?: string }>(
    `SELECT gm.scoring_type, m.mode_id
     FROM matches m
     LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
     WHERE m.id = ?`,
    [matchId]
  );
  const scoringType = modeRow?.scoring_type ?? 'Normal';

  if (scoringType === 'Normal') {
    await createNormalTeams(db, matchId, teamCount ?? 2);
  } else {
    // FFA and Position: one team per participant (auto-created)
    await createPerParticipantTeams(db, matchId);
  }

  // Update denormalized team_count
  const count = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM match_teams WHERE match_id = ? AND is_reserve = 0`, [matchId]
  );
  await db.run(`UPDATE matches SET team_count = ? WHERE id = ?`, [count?.cnt ?? 2, matchId]);
}

async function createNormalTeams(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string,
  teamCount: number
): Promise<void> {
  const teams = teamCount <= 2
    ? NORMAL_TEAMS
    : Array.from({ length: teamCount }, (_, i) => ({
        name: `Team ${i + 1}`,
        color: null as string | null,
        order: i,
      }));

  for (const t of teams) {
    await db.run(
      `INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, is_reserve)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [genId('mt'), matchId, t.name, t.color ?? null, t.order]
    );
  }

  // Always ensure a reserve slot exists
  await db.run(
    `INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, is_reserve)
     VALUES (?, ?, 'Reserve', NULL, 99, 1)`,
    [genId('mt'), matchId]
  );
}

async function createPerParticipantTeams(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string
): Promise<void> {
  const participants = await db.all<{ id: string; username: string }>(
    `SELECT id, username FROM match_participants WHERE match_id = ? ORDER BY joined_at ASC`,
    [matchId]
  );

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    await db.run(
      `INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, is_reserve)
       VALUES (?, ?, ?, NULL, ?, 0)`,
      [genId('mt'), matchId, p.username, i]
    );
    // Point the participant at their own team
    await db.run(
      `UPDATE match_participants SET team_id = (
         SELECT id FROM match_teams WHERE match_id = ? AND team_order = ? AND is_reserve = 0 LIMIT 1
       ) WHERE id = ?`,
      [matchId, i, p.id]
    );
  }
}

/**
 * Assign a participant to a named team within a match.
 * Accepts either legacy 'blue'/'red' names or a match_teams.id directly.
 */
export async function assignParticipantToTeam(
  matchId: string,
  participantId: string,
  teamRef: string  // match_teams.id  OR  legacy 'blue'/'red'/'reserve'
): Promise<void> {
  const db = await getDbInstance();

  let teamId = teamRef;

  // Resolve legacy names to actual row IDs
  if (teamRef === 'blue') {
    const row = await db.get<{ id: string }>(
      `SELECT id FROM match_teams WHERE match_id = ? AND team_order = 0 AND is_reserve = 0`, [matchId]
    );
    teamId = row?.id ?? teamRef;
  } else if (teamRef === 'red') {
    const row = await db.get<{ id: string }>(
      `SELECT id FROM match_teams WHERE match_id = ? AND team_order = 1 AND is_reserve = 0`, [matchId]
    );
    teamId = row?.id ?? teamRef;
  } else if (teamRef === 'reserve') {
    const row = await db.get<{ id: string }>(
      `SELECT id FROM match_teams WHERE match_id = ? AND is_reserve = 1`, [matchId]
    );
    teamId = row?.id ?? teamRef;
  }

  await db.run(
    `UPDATE match_participants SET team_assignment = ?, team_id = ? WHERE id = ? AND match_id = ?`,
    [
      // Keep legacy team_assignment for dual-write compat (drop in Phase 8)
      teamRef === 'blue' || teamRef === 'red' || teamRef === 'reserve' ? teamRef : null,
      teamId,
      participantId,
      matchId,
    ]
  );
}

/**
 * Get all non-reserve match_teams for a match, ordered by team_order.
 */
export async function getMatchTeams(matchId: string): Promise<Array<{
  id: string;
  team_name: string;
  team_color?: string;
  team_order: number;
  voice_channel_id?: string;
  is_reserve: boolean;
}>> {
  const db = await getDbInstance();
  const rows = await db.all<{
    id: string; team_name: string; team_color?: string;
    team_order: number; voice_channel_id?: string; is_reserve: number;
  }>(
    `SELECT id, team_name, team_color, team_order, voice_channel_id, is_reserve
     FROM match_teams WHERE match_id = ? ORDER BY is_reserve ASC, team_order ASC`,
    [matchId]
  );
  return rows.map(r => ({ ...r, is_reserve: Boolean(r.is_reserve) }));
}

/**
 * Update the voice_channel_id on a match_teams row.
 */
export async function setTeamVoiceChannel(teamId: string, channelId: string | null): Promise<void> {
  const db = await getDbInstance();
  await db.run(`UPDATE match_teams SET voice_channel_id = ? WHERE id = ?`, [channelId, teamId]);
}
