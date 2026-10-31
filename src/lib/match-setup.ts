// Helpers that build match_teams rows per scoring_type at the gather→assign transition.

import { getDbInstance } from './database-init';
import { withTransaction } from './transaction';

export const MAX_VOICE_CHANNELS_PER_MATCH = 8;
export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 16;

const NORMAL_TEAMS = [
  { name: 'Blue', color: '#4A90E2', order: 0 },
  { name: 'Red', color: '#E04A4A', order: 1 },
];

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; // NOSONAR
}

type Db = Awaited<ReturnType<typeof getDbInstance>>;

/** Typed error for invalid team references so API routes can answer 400 instead of 500. */
export class TeamAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamAssignmentError';
  }
}

function clampTeamCount(n: number): number {
  if (!Number.isFinite(n)) return 2;
  return Math.min(MAX_TEAM_COUNT, Math.max(MIN_TEAM_COUNT, Math.floor(n)));
}

/**
 * Derive the legacy `team_assignment` value from a resolved team.
 * order 0 -> 'blue', 1 -> 'red', reserve -> 'reserve', anything else -> NULL.
 */
export function deriveTeamAssignment(team: { team_order: number; is_reserve: number | boolean }): 'blue' | 'red' | 'reserve' | null {
  if (team.is_reserve) return 'reserve';
  if (team.team_order === 0) return 'blue';
  if (team.team_order === 1) return 'red';
  return null;
}

/**
 * Create match_teams rows for a match based on its game mode's scoring_type.
 * Idempotent. Re-running fills gaps: a Normal match missing its Reserve row gets
 * one, and FFA/Position participants without a team (late joiners) get one.
 *
 * Team count resolution (Normal mode): explicit `teamCount` argument > the
 * match's own `matches.team_count` (if set at creation) > the mode's
 * `game_modes.max_teams` default > 2. Always clamped to 2..16.
 *
 * Position mode: if the mode's `team_size` is >1, participants are grouped
 * into `max_teams` team-endurance teams (team_size members each, distributed
 * round-robin in join order). Otherwise every participant gets their own
 * one-person team, same as FFA.
 */
export async function createMatchTeams(matchId: string, teamCount?: number): Promise<void> {
  const db = await getDbInstance();
  await withTransaction(db, async () => {
    const modeRow = await db.get<{ scoring_type?: string; mode_id?: string; max_teams?: number; team_size?: number | null; match_team_count?: number | null }>(
      `SELECT gm.scoring_type, m.mode_id, gm.max_teams, gm.team_size, m.team_count as match_team_count
       FROM matches m
       LEFT JOIN game_modes gm ON gm.id = m.mode_id AND gm.game_id = m.game_id
       WHERE m.id = ?`,
      [matchId]
    );
    const scoringType = modeRow?.scoring_type ?? 'Normal';

    const existing = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM match_teams WHERE match_id = ? AND is_reserve = 0`,
      [matchId]
    );
    const hasTeams = !!existing && existing.cnt > 0;

    if (scoringType === 'Normal') {
      if (!hasTeams) {
        const resolved = teamCount ?? modeRow?.match_team_count ?? modeRow?.max_teams ?? 2;
        await createNormalTeams(db, matchId, clampTeamCount(resolved > 0 ? resolved : 2));
      } else {
        await ensureReserveTeam(db, matchId);
      }
    } else if (scoringType === 'Position' && (modeRow?.team_size ?? 1) > 1) {
      // Team-endurance: group participants into max_teams teams of team_size each.
      if (!hasTeams) {
        await createTeamEnduranceTeams(db, matchId, clampTeamCount(modeRow?.max_teams ?? 2), modeRow!.team_size!);
      } else {
        await placeLateEnduranceJoiners(db, matchId, modeRow!.team_size!);
      }
    } else {
      // FFA and Position (individual): one team per participant (auto-created)
      await createPerParticipantTeams(db, matchId);
    }

    // Update denormalized team_count
    const count = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM match_teams WHERE match_id = ? AND is_reserve = 0`, [matchId]
    );
    await db.run(`UPDATE matches SET team_count = ? WHERE id = ?`, [count?.cnt ?? 2, matchId]);
  });
}

async function ensureReserveTeam(db: Db, matchId: string): Promise<string> {
  const row = await db.get<{ id: string }>(
    `SELECT id FROM match_teams WHERE match_id = ? AND is_reserve = 1 LIMIT 1`, [matchId]
  );
  if (row) return row.id;
  const id = genId('mt');
  await db.run(
    `INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, is_reserve)
     VALUES (?, ?, 'Reserve', NULL, 99, 1)`,
    [id, matchId]
  );
  const created = await db.get<{ id: string }>(
    `SELECT id FROM match_teams WHERE match_id = ? AND is_reserve = 1 LIMIT 1`, [matchId]
  );
  return created?.id ?? id;
}

/**
 * Create (or reuse) N non-reserve teams for a match with explicit names/colours.
 * team_order = array index. Idempotent: existing rows for an order are reused
 * as-is. Returns the match_teams ids in order.
 */
export async function createNamedMatchTeams(
  matchId: string,
  teams: Array<{ name: string; color?: string | null }>
): Promise<string[]> {
  const db = await getDbInstance();
  return withTransaction(db, async () => {
    const ids: string[] = [];
    for (let i = 0; i < teams.length; i++) {
      const existing = await db.get<{ id: string }>(
        `SELECT id FROM match_teams WHERE match_id = ? AND team_order = ? AND is_reserve = 0`,
        [matchId, i]
      );
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const id = genId('mt');
      await db.run(
        `INSERT INTO match_teams (id, match_id, team_name, team_color, team_order, is_reserve)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [id, matchId, teams[i].name, teams[i].color ?? null, i]
      );
      ids.push(id);
    }
    const count = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM match_teams WHERE match_id = ? AND is_reserve = 0`, [matchId]
    );
    await db.run(`UPDATE matches SET team_count = ? WHERE id = ?`, [count?.cnt ?? teams.length, matchId]);
    return ids;
  });
}

async function createNormalTeams(db: Db, matchId: string, teamCount: number): Promise<void> {
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
  await ensureReserveTeam(db, matchId);
}

/**
 * Team-endurance Position matches: create `teamCount` teams and distribute
 * participants round-robin (in join order) so each team ends up with roughly
 * teamSize members. A reserve slot is created for any overflow beyond
 * teamCount * teamSize.
 */
async function createTeamEnduranceTeams(
  db: Db,
  matchId: string,
  teamCount: number,
  teamSize: number
): Promise<void> {
  const participants = await db.all<{ id: string; username: string }>(
    `SELECT id, username FROM match_participants WHERE match_id = ? ORDER BY joined_at ASC`,
    [matchId]
  );

  const teamIds: string[] = [];
  for (let i = 0; i < teamCount; i++) {
    const id = genId('mt');
    teamIds.push(id);
    await db.run(
      `INSERT OR IGNORE INTO match_teams (id, match_id, team_name, team_color, team_order, is_reserve)
       VALUES (?, ?, ?, NULL, ?, 0)`,
      [id, matchId, `Team ${i + 1}`, i]
    );
  }

  const reserveId = await ensureReserveTeam(db, matchId);

  const capacity = teamCount * teamSize;
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const teamId = i < capacity ? teamIds[i % teamCount] : reserveId;
    await db.run(`UPDATE match_participants SET team_id = ? WHERE id = ?`, [teamId, p.id]);
  }
}

/** Team-endurance late joiners: fill the emptiest team with room, else Reserve. */
async function placeLateEnduranceJoiners(db: Db, matchId: string, teamSize: number): Promise<void> {
  const unplaced = await db.all<{ id: string }>(
    `SELECT id FROM match_participants
     WHERE match_id = ? AND (team_id IS NULL OR team_id NOT IN (SELECT id FROM match_teams WHERE match_id = ?))
     ORDER BY joined_at ASC`,
    [matchId, matchId]
  );
  if (unplaced.length === 0) return;
  const reserveId = await ensureReserveTeam(db, matchId);
  for (const p of unplaced) {
    const target = await db.get<{ id: string; cnt: number }>(
      `SELECT mt.id as id, COUNT(mp.id) as cnt
       FROM match_teams mt LEFT JOIN match_participants mp ON mp.team_id = mt.id
       WHERE mt.match_id = ? AND mt.is_reserve = 0
       GROUP BY mt.id ORDER BY cnt ASC, mt.team_order ASC LIMIT 1`,
      [matchId]
    );
    const teamId = target && target.cnt < teamSize ? target.id : reserveId;
    await db.run(`UPDATE match_participants SET team_id = ? WHERE id = ?`, [teamId, p.id]);
  }
}

/** FFA / individual Position: one team per participant; adds rows only for participants lacking one. */
async function createPerParticipantTeams(db: Db, matchId: string): Promise<void> {
  const participants = await db.all<{ id: string; username: string }>(
    `SELECT id, username FROM match_participants
     WHERE match_id = ? AND (team_id IS NULL OR team_id NOT IN (SELECT id FROM match_teams WHERE match_id = ?))
     ORDER BY joined_at ASC`,
    [matchId, matchId]
  );
  if (participants.length === 0) return;

  const maxRow = await db.get<{ max_order: number | null }>(
    `SELECT MAX(team_order) as max_order FROM match_teams WHERE match_id = ? AND is_reserve = 0`,
    [matchId]
  );
  let nextOrder = (maxRow?.max_order ?? -1) + 1;

  for (const p of participants) {
    const id = genId('mt');
    await db.run(
      `INSERT INTO match_teams (id, match_id, team_name, team_color, team_order, is_reserve)
       VALUES (?, ?, ?, NULL, ?, 0)`,
      [id, matchId, p.username, nextOrder++]
    );
    await db.run(`UPDATE match_participants SET team_id = ? WHERE id = ?`, [id, p.id]);
  }
}

/**
 * Resolve a team reference ('blue' | 'red' | 'reserve' | match_teams.id) to a team row
 * belonging to the given match. Throws TeamAssignmentError if it does not resolve.
 */
export async function resolveMatchTeam(
  db: Db,
  matchId: string,
  teamRef: string
): Promise<{ id: string; team_order: number; is_reserve: number }> {
  let row: { id: string; team_order: number; is_reserve: number } | undefined;
  if (teamRef === 'blue') {
    row = await db.get(`SELECT id, team_order, is_reserve FROM match_teams WHERE match_id = ? AND team_order = 0 AND is_reserve = 0`, [matchId]);
  } else if (teamRef === 'red') {
    row = await db.get(`SELECT id, team_order, is_reserve FROM match_teams WHERE match_id = ? AND team_order = 1 AND is_reserve = 0`, [matchId]);
  } else if (teamRef === 'reserve') {
    row = await db.get(`SELECT id, team_order, is_reserve FROM match_teams WHERE match_id = ? AND is_reserve = 1`, [matchId]);
  } else {
    row = await db.get(`SELECT id, team_order, is_reserve FROM match_teams WHERE id = ? AND match_id = ?`, [teamRef, matchId]);
  }
  if (!row) {
    throw new TeamAssignmentError(`Team '${teamRef}' does not belong to match ${matchId}`);
  }
  return row;
}

/**
 * Assign a participant to a team within a match.
 * Accepts either legacy 'blue'/'red'/'reserve' names or a match_teams.id, which
 * must belong to `matchId`. Writes team_id and the derived legacy team_assignment.
 * Throws TeamAssignmentError for an unknown team or participant.
 */
export async function assignParticipantToTeam(
  matchId: string,
  participantId: string,
  teamRef: string  // match_teams.id  OR  legacy 'blue'/'red'/'reserve'
): Promise<void> {
  const db = await getDbInstance();

  const team = await resolveMatchTeam(db, matchId, teamRef);

  const participant = await db.get<{ id: string }>(
    `SELECT id FROM match_participants WHERE id = ? AND match_id = ?`, [participantId, matchId]
  );
  if (!participant) {
    throw new TeamAssignmentError(`Participant '${participantId}' does not belong to match ${matchId}`);
  }

  await db.run(
    `UPDATE match_participants SET team_assignment = ?, team_id = ? WHERE id = ? AND match_id = ?`,
    [deriveTeamAssignment(team), team.id, participantId, matchId]
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
 * Update the voice_channel_id on a match_teams row. When `matchId` is given the
 * update is scoped to that match (and throws TeamAssignmentError if the team
 * does not belong to it).
 */
export async function setTeamVoiceChannel(teamId: string, channelId: string | null, matchId?: string): Promise<void> {
  const db = await getDbInstance();
  if (matchId) {
    const team = await db.get<{ id: string }>(`SELECT id FROM match_teams WHERE id = ? AND match_id = ?`, [teamId, matchId]);
    if (!team) throw new TeamAssignmentError(`Team '${teamId}' does not belong to match ${matchId}`);
    await db.run(`UPDATE match_teams SET voice_channel_id = ? WHERE id = ? AND match_id = ?`, [channelId, teamId, matchId]);
    return;
  }
  await db.run(`UPDATE match_teams SET voice_channel_id = ? WHERE id = ?`, [channelId, teamId]);
}
