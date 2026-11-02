/**
 * Plan 5.3 step 7, run INSIDE the import transaction (a mismatch throws, which rolls everything back):
 *   1. row counts per table equal the converted rows (source rows minus reported repairs)
 *   2. every relationship resolves (foreign keys are enforced by Postgres on insert; the non-FK relationships are
 *      re-checked here with SQL on the target)
 *   3. computed results agree between source and target: ALL series standings, ALL tournament standings (cumulative
 *      leaderboard or bracket win/loss table) and the winner / scores of every complete match that belongs to a series
 *      or tournament plus the most recent complete matches. Source side = legacy-results.ts (v0.8.2 logic on the SQLite
 *      copy); target side = the new domain functions, called with the transaction as executor.
 */
import { count, sql } from 'drizzle-orm';
import type { DatabaseSync } from 'node:sqlite';
import type { Executor } from '../db';
import { blobs } from '../db/schema';
import { getSeriesStandings } from '../../src/lib/series/standings';
import { getBracketStandings, getCumulativeStandings } from '../../src/lib/tournaments/standings';
import { determineMatchWinner, getOverallMatchScore } from '../../src/lib/matches/scoreboard';
import * as legacy from './legacy-results';
import type { ImportPlan } from './plan';
import { VerificationError } from './types';

/** Most recent complete matches compared in addition to every series / tournament match. */
export const RECENT_MATCH_SAMPLE = 500;
const EPS = 1e-9;

export interface VerifyOutcome { seriesChecked: number; tournamentsChecked: number; matchesChecked: number }

const sameNum = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) <= EPS);

function pushDiff(out: string[], what: string, detail: string): void {
  if (out.length < 200) out.push(`${what}: ${detail}`);
}

async function targetCount(tx: Executor, table: ImportPlan['tables'][number]['info']['mapping']['table']): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(table);
  return Number(row?.n ?? 0);
}

export async function verifyImport(tx: Executor, legacyDb: DatabaseSync, plan: ImportPlan, expectedBlobs: number): Promise<VerifyOutcome> {
  const bad: string[] = [];

  // 1. row counts
  for (const t of plan.tables) {
    const actual = await targetCount(tx, t.info.mapping.table);
    if (actual !== t.rows.length) pushDiff(bad, `row count ${t.info.name}`, `expected ${t.rows.length} (source ${t.sourceCount} - ${t.sourceCount - t.rows.length} repaired) but Postgres has ${actual}`);
  }
  const [blobCount] = await tx.select({ n: count() }).from(blobs);
  if (Number(blobCount?.n ?? 0) !== expectedBlobs) pushDiff(bad, 'row count blobs', `expected ${expectedBlobs} but Postgres has ${Number(blobCount?.n ?? 0)}`);

  // 2. relationships that are not foreign keys
  const dangling = async (label: string, query: ReturnType<typeof sql>): Promise<void> => {
    const res = await tx.execute(query);
    const n = Number((res as unknown as { rows: Array<{ n: number | string }> }).rows[0]?.n ?? 0);
    if (n > 0) pushDiff(bad, `relationship ${label}`, `${n} dangling row(s)`);
  };
  await dangling('match_game_placements.entity_id (team)', sql`SELECT count(*) AS n FROM match_game_placements p LEFT JOIN match_teams t ON t.id = p.entity_id WHERE p.entity_type = 'team' AND t.id IS NULL`);
  await dangling('match_game_placements.entity_id (participant)', sql`SELECT count(*) AS n FROM match_game_placements p LEFT JOIN match_participants t ON t.id = p.entity_id WHERE p.entity_type = 'participant' AND t.id IS NULL`);
  await dangling('matches.winner_team (tournament)', sql`SELECT count(*) AS n FROM matches m LEFT JOIN tournament_teams t ON t.id = m.winner_team WHERE m.winner_team IS NOT NULL AND m.tournament_id IS NOT NULL AND t.id IS NULL`);
  await dangling('matches.winner_team (standalone)', sql`SELECT count(*) AS n FROM matches m WHERE m.winner_team IS NOT NULL AND m.tournament_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM match_teams t WHERE t.id = m.winner_team) AND NOT EXISTS (SELECT 1 FROM match_participants p WHERE p.id = m.winner_team)`);

  // 3a. series standings (all)
  const seriesIds = (legacyDb.prepare('SELECT id FROM series ORDER BY id').all() as Array<{ id: string }>).map((r) => r.id).filter((id) => plan.tables.find((t) => t.info.name === 'series')?.rows.some((r) => r.id === id));
  for (const id of seriesIds) {
    const src = new Map(legacy.seriesStandings(legacyDb, id).map((r) => [r.user_id, r]));
    const dst = new Map((await getSeriesStandings(tx, id)).map((r) => [r.user_id, r]));
    for (const key of new Set([...src.keys(), ...dst.keys()])) {
      const a = src.get(key);
      const b = dst.get(key);
      if (!a || !b) { pushDiff(bad, `series ${id} standings`, `player ${key} only in ${a ? 'source' : 'target'}`); continue; }
      if (a.rank !== b.rank || !sameNum(a.total_points, b.total_points) || a.events_played !== b.events_played || a.username !== b.username) {
        pushDiff(bad, `series ${id} standings`, `player ${key}: source rank ${a.rank}/${a.total_points}pts/${a.events_played} events vs target ${b.rank}/${b.total_points}pts/${b.events_played} events`);
        continue;
      }
      const bEvents = new Map(b.events.map((e) => [e.series_event_id, e.points]));
      for (const e of a.events) {
        if (!sameNum(e.points, bEvents.get(e.series_event_id) ?? null)) pushDiff(bad, `series ${id} event ${e.series_event_id}`, `player ${key}: source ${e.points} vs target ${bEvents.get(e.series_event_id) ?? null}`);
      }
    }
  }

  // 3b. tournament standings (all)
  const tournaments = legacyDb.prepare('SELECT id, format FROM tournaments ORDER BY id').all() as Array<{ id: string; format: string }>;
  const importedTournaments = new Set(plan.tables.find((t) => t.info.name === 'tournaments')?.rows.map((r) => String(r.id)));
  let tournamentsChecked = 0;
  for (const tr of tournaments) {
    if (!importedTournaments.has(tr.id)) continue;
    tournamentsChecked++;
    if (tr.format === 'cumulative-points') {
      const src = new Map(legacy.cumulativeStandings(legacyDb, tr.id).map((r) => [r.player_key, r]));
      const dst = new Map((await getCumulativeStandings(tx, tr.id)).map((r) => [r.player_key, r]));
      for (const key of new Set([...src.keys(), ...dst.keys()])) {
        const a = src.get(key);
        const b = dst.get(key);
        if (!a || !b) { pushDiff(bad, `tournament ${tr.id} leaderboard`, `player ${key} only in ${a ? 'source' : 'target'}`); continue; }
        if (a.rank !== b.rank || !sameNum(a.total_points, b.total_points) || a.matches_played !== b.matches_played || a.first_places !== b.first_places || !sameNum(a.best_position, b.best_position)) {
          pushDiff(bad, `tournament ${tr.id} leaderboard`, `player ${key}: source #${a.rank} ${a.total_points}pts/${a.matches_played}g/${a.first_places}w vs target #${b.rank} ${b.total_points}pts/${b.matches_played}g/${b.first_places}w`);
        }
      }
    } else {
      const src = new Map(legacy.bracketStandings(legacyDb, tr.id).map((r) => [r.team_id, r]));
      const dst = new Map((await getBracketStandings(tx, tr.id)).map((r) => [r.team_id, r]));
      for (const key of new Set([...src.keys(), ...dst.keys()])) {
        const a = src.get(key);
        const b = dst.get(key);
        if (!a || !b) { pushDiff(bad, `tournament ${tr.id} bracket`, `team ${key} only in ${a ? 'source' : 'target'}`); continue; }
        if (a.matches_played !== b.matches_played || a.wins !== b.wins || a.losses !== b.losses) {
          pushDiff(bad, `tournament ${tr.id} bracket`, `team ${key}: source ${a.wins}-${a.losses}/${a.matches_played} vs target ${b.wins}-${b.losses}/${b.matches_played}`);
        }
      }
    }
  }

  // 3c. match results: every series / tournament match plus the most recent complete matches
  const importedMatches = new Set(plan.tables.find((t) => t.info.name === 'matches')?.rows.map((r) => String(r.id)));
  const sample = new Set<string>();
  const addRows = (rows: Array<{ id: string }>): void => rows.forEach((r) => importedMatches.has(r.id) && sample.add(r.id));
  addRows(legacyDb.prepare(`SELECT id FROM matches WHERE status = 'complete' AND tournament_id IS NOT NULL`).all() as Array<{ id: string }>);
  addRows(legacyDb.prepare(`SELECT match_id AS id FROM series_events WHERE match_id IS NOT NULL`).all() as Array<{ id: string }>);
  addRows(legacyDb.prepare(`SELECT id FROM matches WHERE status = 'complete' ORDER BY created_at DESC, id DESC LIMIT ${RECENT_MATCH_SAMPLE}`).all() as Array<{ id: string }>);
  for (const id of sample) {
    const winnerSrc = legacy.determineMatchWinner(legacyDb, id);
    const winnerDst = await determineMatchWinner(tx, id);
    if (winnerSrc !== winnerDst) pushDiff(bad, `match ${id} winner`, `source ${winnerSrc} vs target ${winnerDst}`);
    const a = legacy.overallMatchScore(legacyDb, id);
    if (a.scoringType === 'Normal') {
      const b = await getOverallMatchScore(tx, id);
      const dstWins = Object.fromEntries(b.teamScores.map((t) => [t.teamId, t.wins]));
      if (JSON.stringify(Object.entries(a.teamWins).sort()) !== JSON.stringify(Object.entries(dstWins).sort()) || a.totalGames !== b.totalNormalGames || a.overallWinnerTeamId !== b.overallWinnerTeamId) {
        pushDiff(bad, `match ${id} score`, `source ${JSON.stringify(a.teamWins)}/${a.totalGames} vs target ${JSON.stringify(dstWins)}/${b.totalNormalGames}`);
      }
    }
  }

  if (bad.length > 0) {
    throw new VerificationError(bad, `Import verification failed (${bad.length} mismatch(es)); nothing was imported. First: ${bad.slice(0, 5).join(' | ')}`);
  }
  return { seriesChecked: seriesIds.length, tournamentsChecked, matchesChecked: sample.size };
}
