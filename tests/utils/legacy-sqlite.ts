/**
 * Programmatic fixtures for the SQLite -> Postgres importer tests (plan 5.6). Legacy `.db` files are built with the real
 * legacy migrations (`migrations/legacy-sqlite`), up to a chosen migration:
 *
 *   'v0.7'   : through 009_update071.sql (the schema of the v0.7 era: legacy scoring columns only)
 *   'v0.8.2' : all migrations (match_teams + match_game_placements, series, ...)
 *
 * Migrations are recorded in the `migrations(filename)` table exactly like the old Umzug storage did, so the importer's
 * "bring the copy current" step only applies what is missing. Rows are inserted with `insertLegacy`, which silently drops
 * keys that are not columns at that schema level, so one scenario description serves both levels.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type LegacyLevel = 'v0.7' | 'v0.8.2';
const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations', 'legacy-sqlite');
export const V07_LAST_MIGRATION = '009_update071.sql';

export function createLegacyDb(file: string, level: LegacyLevel): DatabaseSync {
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: false });
  db.exec('CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL UNIQUE, executed_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    if (level === 'v0.7' && f > V07_LAST_MIGRATION) break;
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(f);
  }
  return db;
}

const columnCache = new WeakMap<DatabaseSync, Map<string, Set<string>>>();
function columnsOf(db: DatabaseSync, table: string): Set<string> {
  let byTable = columnCache.get(db);
  if (!byTable) columnCache.set(db, (byTable = new Map()));
  let cols = byTable.get(table);
  if (!cols) byTable.set(table, (cols = new Set((db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map((c) => c.name))));
  return cols;
}

export type LegacyValue = string | number | null | boolean;

/** INSERT OR REPLACE a row, ignoring keys that are not columns of `table` at this schema level. */
export function insertLegacy(db: DatabaseSync, table: string, row: Record<string, LegacyValue>): void {
  const cols = columnsOf(db, table);
  const entries = Object.entries(row).filter(([k]) => cols.has(k));
  if (entries.length === 0) return;
  const sql = `INSERT OR REPLACE INTO "${table}" (${entries.map(([k]) => `"${k}"`).join(', ')}) VALUES (${entries.map(() => '?').join(', ')})`;
  db.prepare(sql).run(...entries.map(([, v]) => (typeof v === 'boolean' ? (v ? 1 : 0) : v)));
}

export const j = (v: unknown): string => JSON.stringify(v);

/** Everything the scenario builder creates, so tests can reference ids. */
export interface Scenario {
  gameId: string;
  matches: { normal: string; ffa: string; position: string; open: string; withBoolAnnouncements: string; withoutAnnouncements: string };
  tournaments: { bracket: string; cumulative: string };
  series: string;
  seriesEvents: string[];
  players: string[];
  uploads: string[];
}

const T0 = '2026-03-01 18:00:00';
const ago = (days: number): string => new Date(Date.UTC(2026, 2, 1 + days, 18, 0, 0)).toISOString().replace('T', ' ').slice(0, 19);

/** One participant row (+ optional team link). */
function participant(db: DatabaseSync, id: string, matchId: string, userId: string, username: string, extra: Record<string, LegacyValue> = {}): void {
  insertLegacy(db, 'match_participants', {
    id, match_id: matchId, user_id: userId, discord_user_id: userId, username, joined_at: T0, receives_map_codes: 0, failed_avatar_checks: 0, ...extra,
  });
}

function matchRow(db: DatabaseSync, id: string, gameId: string, modeId: string, extra: Record<string, LegacyValue> = {}): void {
  insertLegacy(db, 'matches', {
    id, game_id: gameId, mode_id: modeId, name: `Match ${id}`, start_date: '2026-03-02T18:00:00.000Z', start_time: '2026-03-02T18:00:00.000Z',
    status: 'complete', max_participants: 10, current_participants: 6, match_format: 'competitive', rounds: 3, player_notifications: 1, stats_enabled: 0,
    team_count: 2, created_at: T0, updated_at: T0, ...extra,
  });
}

function gameRow(db: DatabaseSync, id: string, matchId: string, round: number, mapId: string, extra: Record<string, LegacyValue> = {}): void {
  insertLegacy(db, 'match_games', { id, match_id: matchId, round, map_id: mapId, status: 'completed', created_at: T0, updated_at: T0, discord_notified: 0, ...extra });
}

function placement(db: DatabaseSync, gameId: string, type: 'team' | 'participant', entityId: string, extra: Record<string, LegacyValue>): void {
  insertLegacy(db, 'match_game_placements', { id: `pl_${gameId}_${entityId}`, match_game_id: gameId, entity_type: type, entity_id: entityId, created_at: T0, ...extra });
}

function team(db: DatabaseSync, id: string, matchId: string, name: string, order: number, extra: Record<string, LegacyValue> = {}): void {
  insertLegacy(db, 'match_teams', { id, match_id: matchId, team_name: name, team_order: order, is_reserve: 0, ...extra });
}

/**
 * A rich v0.8.2 database: all three scoring types, a bracket tournament, a cumulative-points tournament, a series that
 * scores events of both kinds, queues in every state, scorecards, feed events. Legacy dual-write columns are filled
 * consistently with the new tables (so a clean import has zero disagreements).
 */
export function buildScenario(db: DatabaseSync, level: LegacyLevel = 'v0.8.2'): Scenario {
  const v8 = level === 'v0.8.2';
  const gameId = 'testgame';
  insertLegacy(db, 'games', { id: gameId, name: 'Test Game', genre: 'FPS', max_signups: 20, supports_all_modes: 0, map_codes_supported: 1, created_at: T0, updated_at: T0, scoring_config: j({ type: 'Position', pointsPerPosition: { 1: 25, 2: 18, 3: 15, 4: 12 } }) });
  insertLegacy(db, 'game_modes', { id: 'tdm', game_id: gameId, name: 'Team Deathmatch', team_size: 3, max_teams: 2, scoring_type: 'Normal', created_at: T0, updated_at: T0 });
  insertLegacy(db, 'game_modes', { id: 'dm', game_id: gameId, name: 'Deathmatch', team_size: 1, max_teams: 8, scoring_type: 'FFA', created_at: T0, updated_at: T0 });
  insertLegacy(db, 'game_modes', { id: 'race', game_id: gameId, name: 'Race', team_size: 1, max_teams: 8, scoring_type: 'Position', created_at: T0, updated_at: T0, setup_components: j(['qualifying', 'grid_order']) });
  for (const [id, mode] of [['m1', 'tdm'], ['m2', 'tdm'], ['m3', 'dm'], ['m4', 'race']]) {
    insertLegacy(db, 'game_maps', { id, game_id: gameId, name: `Map ${id}`, mode_id: mode, tournament_enabled: 1, created_at: T0, updated_at: T0 });
  }
  insertLegacy(db, 'data_versions', { game_id: gameId, data_version: '1.0.0', seeded_at: T0 });
  insertLegacy(db, 'discord_settings', { id: 1, guild_id: 'guild1', bot_token: 'token', command_prefix: '!', mention_everyone: 0, event_duration_minutes: 45, voice_announcements_enabled: 1, created_at: T0, updated_at: T0 });
  insertLegacy(db, 'discord_channels', { id: 'ch1', guild_id: 'guild1', discord_channel_id: '111', name: 'general', type: 0, send_announcements: 1, send_reminders: 1, send_match_start: 1, send_signup_updates: 1, send_health_alerts: 0, created_at: T0, updated_at: T0 });

  const players = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];

  // ── standalone Normal match: blue wins 2-1; announcements as a real JSON array ────────────────────────
  const normal = 'match_normal';
  matchRow(db, normal, gameId, 'tdm', {
    winner_team: v8 ? 'team_normal_blue' : null, announcements: j([{ id: 'a1', value: 1, unit: 'hours' }]), map_codes: j({ m1: 'ABC123' }),
    maps: j(['m1', 'm2', 'm1']), blue_team_voice_channel: 'vc_blue', red_team_voice_channel: 'vc_red', end_time: '2026-03-02T19:30:00.000Z',
  });
  team(db, 'team_normal_blue', normal, 'Blue', 0, { team_color: '#4A90E2', voice_channel_id: 'vc_blue' });
  team(db, 'team_normal_red', normal, 'Red', 1, { team_color: '#E04A4A', voice_channel_id: 'vc_red' });
  team(db, 'team_normal_res', normal, 'Reserve', 99, { is_reserve: 1 });
  players.forEach((u, i) => participant(db, `p_normal_${u}`, normal, u, `Player ${u}`, {
    team_id: i < 3 ? 'team_normal_blue' : 'team_normal_red', team_assignment: i < 3 ? 'blue' : 'red', team: i < 3 ? 'blue' : 'red', signup_data: j({ role: 'dps' }),
  }));
  participant(db, 'p_normal_sub', normal, 'u7', 'Sub', { team_id: 'team_normal_res', team_assignment: 'reserve' });
  [[1, 'team1'], [2, 'team2'], [3, 'team1']].forEach(([round, winner]) => {
    const g = `game_normal_${round}`;
    gameRow(db, g, normal, round as number, 'm1', { winner_id: winner as string, is_ffa_mode: 0 });
    placement(db, g, 'team', 'team_normal_blue', { position: winner === 'team1' ? 1 : 2, is_winner: winner === 'team1' });
    placement(db, g, 'team', 'team_normal_red', { position: winner === 'team2' ? 1 : 2, is_winner: winner === 'team2' });
  });

  // ── announcements stored the old way: plain 1 / 0 / NULL ────────────────────────────────────────────
  const boolAnn = 'match_bool_ann';
  const noAnn = 'match_no_ann';
  matchRow(db, boolAnn, gameId, 'tdm', { status: 'created', announcements: 1, created_at: ago(1) });
  matchRow(db, noAnn, gameId, 'tdm', { status: 'created', announcements: 0, created_at: ago(2) });

  // ── FFA match ───────────────────────────────────────────────────────────────────────────────────────
  const ffa = 'match_ffa';
  matchRow(db, ffa, gameId, 'dm', { winner_team: v8 ? 'p_ffa_u1' : null, created_at: ago(3) });
  ['u1', 'u2', 'u3'].forEach((u, i) => {
    participant(db, `p_ffa_${u}`, ffa, u, `Player ${u}`);
    team(db, `team_ffa_${u}`, ffa, `Player ${u}`, i);
  });
  gameRow(db, 'game_ffa_1', ffa, 1, 'm3', { participant_winner_id: 'p_ffa_u1', is_ffa_mode: 1 });
  ['u1', 'u2', 'u3'].forEach((u, i) => placement(db, 'game_ffa_1', 'participant', `p_ffa_${u}`, { position: i + 1, is_winner: i === 0 }));

  // ── Position match, two races ───────────────────────────────────────────────────────────────────────
  const pos = 'match_position';
  matchRow(db, pos, gameId, 'race', { winner_team: v8 ? 'p_pos_u2' : null, position_scoring_override: j({ 1: 25, 2: 18, 3: 15, 4: 12 }), created_at: ago(4), team_count: 4 });
  const posUsers = ['u1', 'u2', 'u3', 'u4'];
  posUsers.forEach((u, i) => {
    participant(db, `p_pos_${u}`, pos, u, `Player ${u}`, { grid_position: i + 1, qualifying_time_ms: 90000 + i * 100 });
    team(db, `team_pos_${u}`, pos, `Player ${u}`, i);
  });
  const spread = [25, 18, 15, 12];
  [['game_pos_1', 1, [1, 2, 3, 4]], ['game_pos_2', 2, [2, 1, 3, 4]]].forEach(([g, round, order]) => {
    const positions: Record<string, number> = {};
    const points: Record<string, number> = {};
    (order as number[]).forEach((who, i) => { positions[`p_pos_u${who}`] = i + 1; points[`p_pos_u${who}`] = spread[i]; });
    gameRow(db, g as string, pos, round as number, 'm4', { position_results: j(positions), points_awarded: j(points), is_ffa_mode: 0 });
    Object.entries(positions).forEach(([pid, p]) => placement(db, g as string, 'participant', pid, { position: p, points_awarded: points[pid], is_winner: p === 1 }));
  });

  // ── match still being set up ────────────────────────────────────────────────────────────────────────
  const open = 'match_open';
  matchRow(db, open, gameId, 'tdm', { status: 'gather', created_at: ago(5), start_time: '2026-12-01T18:00:00.000Z', start_date: '2026-12-01T18:00:00.000Z' });
  participant(db, 'p_open_u1', open, 'u1', 'Player u1');

  // ── bracket tournament (single elimination, 4 teams) ────────────────────────────────────────────────
  const bracket = 'tournament_bracket';
  insertLegacy(db, 'tournaments', { id: bracket, name: 'Bracket Cup', format: 'single-elimination', status: 'complete', game_id: gameId, rounds_per_match: 1, ruleset: 'competitive', game_mode_id: 'tdm', created_at: ago(6), updated_at: ago(6), allow_match_editing: 1, stats_enabled: 0, player_notifications: 1, announcements: j([{ id: 'x', value: 30, unit: 'minutes' }]) });
  const tTeams = ['tA', 'tB', 'tC', 'tD'];
  tTeams.forEach((t, i) => {
    insertLegacy(db, 'tournament_teams', { id: `tt_${t}`, tournament_id: bracket, team_name: `Team ${t}`, created_at: T0 });
    insertLegacy(db, 'tournament_team_members', { id: `ttm_${t}`, team_id: `tt_${t}`, user_id: `b${i}`, discord_user_id: `b${i}`, username: `Bracket ${i}`, joined_at: T0, is_captain: 1 });
    insertLegacy(db, 'tournament_participants', { id: `tp_${t}`, tournament_id: bracket, user_id: `b${i}`, discord_user_id: `b${i}`, username: `Bracket ${i}`, joined_at: T0, team_assignment: `tt_${t}` });
  });
  const bracketMatches: Array<[string, number, string, string, 'team1' | 'team2', number]> = [
    ['bm_s1', 1, 'tA', 'tB', 'team1', 1], ['bm_s2', 1, 'tC', 'tD', 'team2', 2], ['bm_f', 2, 'tA', 'tD', 'team2', 1],
  ];
  for (const [id, round, a, b, winnerSlot, order] of bracketMatches) {
    const winnerTeam = winnerSlot === 'team1' ? `tt_${a}` : `tt_${b}`;
    matchRow(db, id, gameId, 'tdm', { tournament_id: bracket, tournament_round: round, tournament_bracket_type: 'winners', bracket_round: round, bracket_type: 'winners', blue_team_id: `tt_${a}`, red_team_id: `tt_${b}`, winner_team: winnerTeam, team1_name: `Team ${a}`, team2_name: `Team ${b}`, created_at: ago(6 + round) });
    insertLegacy(db, 'tournament_matches', { match_id: id, tournament_id: bracket, round, bracket_type: 'winners', team1_id: `tt_${a}`, team2_id: `tt_${b}`, match_order: order, created_at: ago(6 + round) });
    team(db, `${id}_blue`, id, `Team ${a}`, 0);
    team(db, `${id}_red`, id, `Team ${b}`, 1);
    participant(db, `${id}_pa`, id, `b${tTeams.indexOf(a)}`, `Bracket ${tTeams.indexOf(a)}`, { team_id: `${id}_blue`, team_assignment: 'blue' });
    participant(db, `${id}_pb`, id, `b${tTeams.indexOf(b)}`, `Bracket ${tTeams.indexOf(b)}`, { team_id: `${id}_red`, team_assignment: 'red' });
    gameRow(db, `${id}_g1`, id, 1, 'm1', { winner_id: winnerSlot, is_ffa_mode: 0 });
    placement(db, `${id}_g1`, 'team', `${id}_blue`, { position: winnerSlot === 'team1' ? 1 : 2, is_winner: winnerSlot === 'team1' });
    placement(db, `${id}_g1`, 'team', `${id}_red`, { position: winnerSlot === 'team2' ? 1 : 2, is_winner: winnerSlot === 'team2' });
  }

  // ── cumulative-points tournament (three Position races, overlapping players) ───────────────────────
  const cumulative = 'tournament_cumulative';
  if (v8) insertLegacy(db, 'tournaments', { id: cumulative, name: 'Points League', format: 'cumulative-points', status: 'complete', game_id: gameId, rounds_per_match: 1, ruleset: 'casual', game_mode_id: 'race', created_at: ago(10), updated_at: ago(10), allow_match_editing: 1, stats_enabled: 0, player_notifications: 1, position_scoring_override: j({ type: 'Position', pointsPerPosition: { 1: 10, 2: 6, 3: 3 } }) });
  (v8 ? ['c1', 'c2', 'c3'] : []).forEach((m, mi) => {
    const id = `cm_${m}`;
    matchRow(db, id, gameId, 'race', { tournament_id: cumulative, created_at: ago(10 + mi), team_count: 3, winner_team: null });
    const order = [[1, 2, 3], [2, 1, 3], [1, 3, 2]][mi];
    order.forEach((who, i) => {
      participant(db, `${id}_p${who}`, id, `cu${who}`, `Cumulative ${who}`);
      team(db, `${id}_t${who}`, id, `Cumulative ${who}`, i);
    });
    gameRow(db, `${id}_g1`, id, 1, 'm4', {});
    order.forEach((who, i) => placement(db, `${id}_g1`, 'participant', `${id}_p${who}`, { position: i + 1, points_awarded: [10, 6, 3][i], is_winner: i === 0 }));
  });

  // ── series scoring a match, both tournaments and a Position match ─────────────────────────────────
  const seriesId = 'series_main';
  insertLegacy(db, 'series', { id: seriesId, name: 'Season 1', status: 'active', scoring_config: j({ match_win_points: 3, match_loss_points: 1, tournament_position_points: [10, 6, 3], position_event_use_event_spread: true }), game_id: gameId, announcements: 1, player_notifications: 1, created_at: T0, updated_at: T0 });
  const seriesEvents = ['se1', 'se2', 'se3', 'se4'];
  insertLegacy(db, 'series_events', { id: 'se1', series_id: seriesId, event_type: 'match', match_id: normal, event_order: 1, points_multiplier: 1 });
  insertLegacy(db, 'series_events', { id: 'se2', series_id: seriesId, event_type: 'tournament', tournament_id: bracket, event_order: 2, points_multiplier: 2 });
  insertLegacy(db, 'series_events', { id: 'se3', series_id: seriesId, event_type: 'tournament', tournament_id: cumulative, event_order: 3, points_multiplier: 1.5 });
  insertLegacy(db, 'series_events', { id: 'se4', series_id: seriesId, event_type: 'match', match_id: pos, event_order: 4, points_multiplier: 1 });

  // ── scorecards, stats ────────────────────────────────────────────────────────────────────────────────
  if (v8) {
    insertLegacy(db, 'scorecard_submissions', { id: 'sc1', match_id: normal, match_game_id: 'game_normal_1', team_side: 'blue', screenshot_url: '/uploads/scorecards/match_normal/blue.png', ai_extraction_status: 'completed', review_status: 'approved', ai_processing_log: j([{ message: 'ok', ts: T0 }]), suggested_positions: j({ a: 1 }), created_at: T0, updated_at: T0 });
    insertLegacy(db, 'scorecard_player_stats', { id: 'sps1', submission_id: 'sc1', match_id: normal, match_game_id: 'game_normal_1', participant_id: 'p_normal_u1', extracted_player_name: 'Player u1', team_side: 'blue', stats_json: j({ kills: 10 }), assignment_status: 'assigned', confidence_score: 0.9, created_at: T0, updated_at: T0, team_id: 'team_normal_blue' });
    insertLegacy(db, 'match_player_stats', { id: 'mps1', match_id: normal, participant_id: 'p_normal_u1', total_stats_json: j({ kills: 10 }), maps_played: 1, stat_image_sent: 0, stats_dm_sent: 0, created_at: T0, updated_at: T0 });
    insertLegacy(db, 'scorecard_dm_messages', { id: 'dm1', match_id: normal, match_game_id: 'game_normal_1', discord_user_id: 'u1', discord_message_id: 'dmm1', participant_id: 'p_normal_u1', team_side: 'blue', created_at: T0 });
    insertLegacy(db, 'stats_settings', { id: 1, enabled: 1, ai_provider: 'anthropic', ai_model: 'sonnet', ai_providers_config: j([{ provider: 'anthropic' }]), both_sides_required: 0, auto_advance_on_match: 0, created_at: T0, updated_at: T0, stats_report_dm_enabled: 0 });
    insertLegacy(db, 'activity_feed', { id: 'feed1', event_type: 'match_completed', priority: 2, title: 'Match Completed', match_id: normal, metadata: j({ a: 1 }), created_at: T0 });
    insertLegacy(db, 'activity_feed', { id: 'feed2', event_type: 'update_available', priority: 3, title: 'Update', created_at: T0 });
  }
  insertLegacy(db, 'match_voice_alternation', { match_id: normal, current_team: 'blue', last_first_team: 'red', last_updated_at: T0, updated_at: T0 });
  insertLegacy(db, 'team_voice_channels', { id: 'tvc1', match_id: normal, team_name: 'Blue', channel_id: 'vc_blue', created_at: T0 });
  insertLegacy(db, 'discord_match_messages', { id: 'dmm_1', match_id: normal, message_id: 'msg1', channel_id: '111', message_type: 'announcement', created_at: T0 });

  // ── queues in every state (retry_count / error_message are the legacy names) ─────────────────────────
  insertLegacy(db, 'discord_announcement_queue', { id: 'q_ann_1', match_id: normal, announcement_type: 'match_created', announcement_data: j({ hello: 'world' }), status: 'completed', retry_count: 0, created_at: T0, processed_at: T0, posted_at: T0 });
  insertLegacy(db, 'discord_announcement_queue', { id: 'q_ann_2', match_id: open, announcement_type: 'match_created', status: 'failed', retry_count: 3, error_message: 'boom', created_at: T0 });
  insertLegacy(db, 'discord_announcement_queue', { id: 'q_ann_3', match_id: open, announcement_type: 'match_created', status: 'processing', retry_count: 1, created_at: T0 });
  insertLegacy(db, 'discord_announcement_queue', { id: 'q_ann_4', match_id: open, announcement_type: 'match_created', status: 'pending', retry_count: 0, created_at: T0, scheduled_for: '2026-12-01T17:00:00.000Z' });
  insertLegacy(db, 'discord_reminder_queue', { id: 'q_rem_1', match_id: open, reminder_type: 'match', minutes_before: 60, scheduled_for: '2026-12-01T17:00:00.000Z', status: 'pending', retry_count: 0, created_at: T0 });
  insertLegacy(db, 'discord_deletion_queue', { id: 'q_del_1', match_id: 'match_deleted_long_ago', status: 'pending', retry_count: 0, created_at: T0 });
  if (v8) {
    insertLegacy(db, 'discord_voice_announcement_queue', { id: 'q_voice_1', match_id: normal, announcement_type: 'match_start', status: 'pending', retry_count: 0, created_at: T0 });
    insertLegacy(db, 'discord_bot_requests', { id: 'q_req_1', type: 'test_voice', data: j({ a: 1 }), result: j({ ok: true }), status: 'completed', retry_count: 0, created_at: T0, updated_at: T0 });
  }

  return {
    gameId,
    matches: { normal, ffa, position: pos, open, withBoolAnnouncements: boolAnn, withoutAnnouncements: noAnn },
    tournaments: { bracket, cumulative },
    series: seriesId,
    seriesEvents,
    players,
    uploads: [],
  };
}

/** Writes the legacy upload files (event image, scorecard screenshot, stat image) below `dir` (= public/uploads). */
export function writeUploads(dir: string): string[] {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082', 'hex');
  const files = ['events/event1.png', 'scorecards/match_normal/blue.png', 'stats/match_normal/team.png'];
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), png);
  }
  return files.map((f) => `/uploads/${f}`);
}

/** Make the legacy data deliberately dirty. Each mutation is independent. */
export const corruptions = {
  /** A placement pointing at a participant that does not exist (relationship Postgres cannot check). */
  danglingPlacement(db: DatabaseSync): void {
    insertLegacy(db, 'match_game_placements', { id: 'pl_dangling', match_game_id: 'game_normal_1', entity_type: 'participant', entity_id: 'p_nobody', position: 9, is_winner: 0, created_at: T0 });
  },
  /** An orphan that is NOT one of the documented leftover patterns (a team member of a team that never existed). */
  orphanTeamMember(db: DatabaseSync): void {
    insertLegacy(db, 'tournament_team_members', { id: 'ttm_orphan', team_id: 'tt_gone', user_id: 'ghost', discord_user_id: 'ghost', username: 'Ghost', joined_at: T0, is_captain: 0 });
  },
  /** A series event of a series that no longer exists: a KNOWN leftover pattern (series delete without cascade). */
  leftoverSeriesEvent(db: DatabaseSync): void {
    insertLegacy(db, 'series_events', { id: 'se_orphan', series_id: 'series_gone', event_type: 'match', match_id: 'match_normal', event_order: 1, points_multiplier: 1 });
  },
  /** An orphan match_games row of a deleted match: a KNOWN leftover pattern, repaired without lossy mode. */
  leftoverGame(db: DatabaseSync): void {
    insertLegacy(db, 'match_games', { id: 'game_of_deleted_match', match_id: 'match_deleted', round: 1, map_id: 'm1', status: 'completed', winner_id: 'team1', created_at: T0, updated_at: T0 });
  },
  malformedJson(db: DatabaseSync): void {
    db.prepare("UPDATE matches SET maps = '{not json' WHERE id = 'match_normal'").run();
    db.prepare("UPDATE games SET scoring_config = 'oops' WHERE id = 'testgame'").run();
  },
  badBoolean(db: DatabaseSync): void {
    db.prepare("UPDATE matches SET stats_enabled = 7 WHERE id = 'match_open'").run();
  },
  badTimestamp(db: DatabaseSync): void {
    db.prepare("UPDATE matches SET start_time = 'next tuesday' WHERE id = 'match_open'").run();
  },
  /** Legacy winner_id says team2 while the placements (authoritative) say team1. */
  winnerDisagreement(db: DatabaseSync): void {
    db.prepare("UPDATE match_games SET winner_id = 'team2' WHERE id = 'game_normal_1'").run();
  },
  assignmentDisagreement(db: DatabaseSync): void {
    db.prepare("UPDATE match_participants SET team_assignment = 'red' WHERE id = 'p_normal_u1'").run();
  },
};
