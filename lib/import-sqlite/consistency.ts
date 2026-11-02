/**
 * Plan D1 / 5.3 step 3: the Postgres baseline dropped the legacy dual-written scoring columns and the importer only reads
 * `match_teams` / `match_game_placements`. Before dropping the legacy columns this compares them with the new tables and
 * reports every disagreement (a disagreement is a preflight failure, never a silent pick).
 *
 *  - match_games.winner_id / participant_winner_id / position_results / points_awarded  vs  match_game_placements
 *  - match_participants.team_assignment                                                   vs  team_id -> match_teams
 *  - matches.blue/red_team_voice_channel                                                  vs  match_teams.voice_channel_id
 *    (legacy-only voice channels are NOT a disagreement: they are copied, see the match_teams mapping)
 */
import type { DatabaseSync } from 'node:sqlite';
import type { ImportHints, SrcRow } from './mapping';
import type { Issue } from './types';
import { readAll } from './legacy-db';

const LOSSY = 'legacy value ignored; match_teams / match_game_placements are authoritative';

interface Placement { entity_type: string; entity_id: string; position: number | null; points_awarded: number | null; is_winner: boolean }

const asBool = (v: unknown): boolean => v === 1 || v === true || v === '1' || v === 1n;
const asNum = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

function parseMap(raw: unknown): Record<string, number> | null | 'invalid' {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const v: unknown = JSON.parse(String(raw));
    if (v === null) return null;
    if (typeof v !== 'object' || Array.isArray(v)) return 'invalid';
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) out[k] = Number(n);
    return out;
  } catch {
    return 'invalid';
  }
}

function sameMap(legacy: Record<string, number>, expected: Record<string, number>): boolean {
  for (const [k, v] of Object.entries(legacy)) if (expected[k] !== v) return false;
  return true;
}

export interface ConsistencyResult {
  issues: Issue[];
  hints: ImportHints;
}

export function checkLegacyConsistency(db: DatabaseSync): ConsistencyResult {
  const issues: Issue[] = [];
  const add = (table: string, id: string, detail: string): void =>
    void issues.push({ kind: 'legacy_disagreement', table, id, detail, lossyAction: LOSSY });

  const teams = readAll(db, 'match_teams');
  const teamById = new Map(teams.map((t) => [String(t.id), t]));
  const teamsByMatch = new Map<string, SrcRow[]>();
  for (const t of teams) {
    const list = teamsByMatch.get(String(t.match_id)) ?? [];
    list.push(t);
    teamsByMatch.set(String(t.match_id), list);
  }

  const hints: ImportHints = { legacyVoiceChannels: new Map() };
  // Rows of deleted matches are dropped as known orphans (plan.ts CASCADE_LEFTOVER_PARENTS); comparing them is pointless.
  const matchRows = readAll(db, 'matches');
  const matchIds = new Set(matchRows.map((m) => String(m.id)));

  // ── matches: voice channels ──────────────────────────────────────────────
  for (const m of matchRows) {
    const blue = (m.blue_team_voice_channel as string | null) || null;
    const red = (m.red_team_voice_channel as string | null) || null;
    if (!blue && !red) continue;
    hints.legacyVoiceChannels.set(String(m.id), { blue, red });
    const list = teamsByMatch.get(String(m.id)) ?? [];
    for (const [order, legacy] of [[0, blue], [1, red]] as const) {
      const team = list.find((t) => asNum(t.team_order) === order);
      const current = (team?.voice_channel_id as string | null) || null;
      if (legacy && current && legacy !== current) {
        add('matches', String(m.id), `${order === 0 ? 'blue' : 'red'}_team_voice_channel=${legacy} but match_teams (order ${order}) has voice_channel_id=${current}`);
      }
    }
  }

  // ── match_participants: team_assignment vs team_id ───────────────────────
  for (const p of readAll(db, 'match_participants')) {
    if (!matchIds.has(String(p.match_id))) continue;
    const legacy = p.team_assignment as string | null;
    if (legacy === null || legacy === undefined || legacy === '') continue;
    const team = p.team_id ? teamById.get(String(p.team_id)) : undefined;
    if (!team) {
      if (!p.team_id) add('match_participants', String(p.id), `team_assignment='${legacy}' but team_id is NULL (the assignment would be lost)`);
      continue; // a dangling team_id is reported as an orphan by the FK check
    }
    const order = asNum(team.team_order);
    const expected = asBool(team.is_reserve) ? 'reserve' : order === 0 ? 'blue' : order === 1 ? 'red' : null;
    if (expected && expected !== legacy) add('match_participants', String(p.id), `team_assignment='${legacy}' but team_id -> ${expected} team`);
  }

  // ── match_games: legacy result columns vs placements ─────────────────────
  const placementsByGame = new Map<string, Placement[]>();
  for (const p of readAll(db, 'match_game_placements')) {
    const list = placementsByGame.get(String(p.match_game_id)) ?? [];
    list.push({
      entity_type: String(p.entity_type), entity_id: String(p.entity_id), position: asNum(p.position),
      points_awarded: asNum(p.points_awarded), is_winner: asBool(p.is_winner),
    });
    placementsByGame.set(String(p.match_game_id), list);
  }

  for (const g of readAll(db, 'match_games')) {
    if (!matchIds.has(String(g.match_id))) continue;
    const id = String(g.id);
    const legacyWinner = (g.winner_id as string | null) || null;
    const legacyParticipantWinner = (g.participant_winner_id as string | null) || null;
    const legacyPositions = parseMap(g.position_results);
    const legacyPoints = parseMap(g.points_awarded);
    const hasLegacyResult = legacyWinner !== null || legacyParticipantWinner !== null || (legacyPositions !== null && legacyPositions !== 'invalid' && Object.keys(legacyPositions).length > 0);
    if (!hasLegacyResult) continue;

    const placements = placementsByGame.get(id) ?? [];
    if (placements.length === 0) {
      add('match_games', id, `legacy result columns are set (winner_id=${legacyWinner}, participant_winner_id=${legacyParticipantWinner}) but there are no match_game_placements`);
      continue;
    }
    const teamRows = placements.filter((p) => p.entity_type === 'team');
    const participantRows = placements.filter((p) => p.entity_type === 'participant');

    if (legacyWinner) {
      const winner = teamRows.find((p) => p.is_winner);
      const order = winner ? asNum(teamById.get(winner.entity_id)?.team_order) : null;
      const isDraw = !winner && teamRows.length > 0 && teamRows.every((p) => p.position === 1);
      const expected = winner ? (order === 0 ? 'team1' : order === 1 ? 'team2' : null) : isDraw ? 'draw' : null;
      if (expected !== legacyWinner) add('match_games', id, `winner_id='${legacyWinner}' but placements say ${expected ?? 'no winner'}`);
    }
    if (legacyParticipantWinner) {
      const winner = participantRows.find((p) => p.is_winner);
      if (winner?.entity_id !== legacyParticipantWinner) add('match_games', id, `participant_winner_id='${legacyParticipantWinner}' but placements say ${winner?.entity_id ?? 'no winner'}`);
    }
    if (legacyPositions === 'invalid') {
      add('match_games', id, 'position_results is not a JSON object');
    } else if (legacyPositions && Object.keys(legacyPositions).length > 0) {
      const expected: Record<string, number> = {};
      for (const p of participantRows) if (p.position !== null) expected[p.entity_id] = p.position;
      if (!sameMap(legacyPositions, expected)) add('match_games', id, 'position_results differ from the participant placements');
      if (legacyPoints && legacyPoints !== 'invalid') {
        const pts: Record<string, number> = {};
        for (const p of participantRows) pts[p.entity_id] = p.points_awarded ?? 0;
        if (!sameMap(legacyPoints, pts)) add('match_games', id, 'points_awarded differ from the participant placements');
      }
    }
  }

  return { issues, hints };
}
