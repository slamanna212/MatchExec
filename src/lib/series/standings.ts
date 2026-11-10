/**
 * Series standings, computed on demand from the series' events (see docs/series-plan.md section 5).
 *
 * Every event's result is resolved to an entrant (a team / a player on the roster) and scored per `scoring_config.mode`:
 * legacy (no mode: points per `match_win_points` etc.), `points` (finishing positions, event spreads, drop_worst) or
 * `head_to_head` (W-L-T records, map differential, optional league points). A series without entrants treats every
 * player as an implicit entrant and reproduces the original per-player numbers. Only completed matches / tournaments of
 * live events that count for the requested scope contribute. The heavy lifting lives in standings-data.ts (batched
 * loading), standings-points.ts / standings-h2h.ts (scoring) and standings-rank.ts (tiebreakers and ranks).
 */
import type { Executor } from '../../../lib/db';
import type {
  SeriesChampionDto, SeriesScoringConfig, SeriesStandingEventPoints, SeriesStandingRow, SeriesStandingsMode, SeriesStandingsResponse,
  SeriesTiebreaker,
} from '../../../shared/series-types';
import { listEntrants, type SeriesEntrantRow } from './entrants';
import { listSeriesEvents, type SeriesEventRow } from './events';
import { SeriesError, getSeriesById, type SeriesRow } from './series';
import { listStages, type SeriesStageRow } from './stages';
import { parseScoringConfig } from './validation';
import { loadStandingsData } from './standings-data';
import { eventH2hMatches, scoreH2hEvent, type H2hMatch } from './standings-h2h';
import { scoreMatch, scoreTournament, type Contribution, type StandingsContext } from './standings-points';
import { orderByTiebreakers, type MiniTable, type RankItem } from './standings-rank';

export { competitionRanks, resolveBracketPlacings, tieAwareRanks } from './standings-rank';
export type { SeriesStandingEventPoints, SeriesStandingRow, SeriesStandingsResponse, SeriesChampionDto } from '../../../shared/series-types';

export interface StandingsOptions {
  /** 'season' (default) or a stage id. */
  scope?: string;
  /** 'entrant' (default) or 'individual' (per player). */
  view?: 'entrant' | 'individual';
}

const DEFAULT_H2H_TIEBREAKERS: SeriesTiebreaker[] = ['match_wins', 'map_diff', 'head_to_head', 'maps_won'];
const DEFAULT_POINTS_TIEBREAKERS: SeriesTiebreaker[] = ['points', 'event_wins', 'best_finishes'];

/** Stage config over series config, key by key (a stage only overrides the keys it sets). */
function mergeConfig(base: SeriesScoringConfig, override: SeriesScoringConfig | null | undefined): SeriesScoringConfig {
  if (!override) return base;
  const merged: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(parseScoringConfig(override))) if (v !== undefined) merged[k] = v;
  return merged as SeriesScoringConfig;
}

function defaultTiebreakers(cfg: SeriesScoringConfig): SeriesTiebreaker[] {
  // A head_to_head table with league points always ranks on them: a custom list only orders the entrants that are level
  // on points, unless it places 'points' itself (then its position is respected).
  const league = cfg.mode === 'head_to_head' && ((cfg.win_points ?? 0) !== 0 || (cfg.loss_points ?? 0) !== 0 || (cfg.tie_points ?? 0) !== 0);
  if (cfg.tiebreakers && cfg.tiebreakers.length > 0) return league && !cfg.tiebreakers.includes('points') ? ['points', ...cfg.tiebreakers] : cfg.tiebreakers;
  if (cfg.mode === 'head_to_head') return league ? ['points', ...DEFAULT_H2H_TIEBREAKERS] : DEFAULT_H2H_TIEBREAKERS;
  // legacy configs (no mode) rank on points alone, exactly as before
  return cfg.mode === 'points' ? DEFAULT_POINTS_TIEBREAKERS : ['points'];
}

interface StandingsInput {
  series: SeriesRow;
  stages: SeriesStageRow[];
  entrants: SeriesEntrantRow[];
  ctx: StandingsContext;
  events: SeriesEventRow[];
}

async function buildContext(ex: Executor, series: SeriesRow, events: SeriesEventRow[]): Promise<Pick<StandingsInput, 'entrants' | 'ctx'>> {
  const withMembers = await listEntrants(ex, series.id, { includeLeft: true });
  const index = new Map<string, string>();
  // old -> current so a current roster overwrites an old one (same rule as loadPlayerEntrantIndex)
  const members = withMembers.flatMap((e) => e.members).sort((a, b) => Number(b.left_at !== null) - Number(a.left_at !== null) || a.joined_at.getTime() - b.joined_at.getTime());
  for (const m of members) {
    index.set(m.user_id, m.entrant_id);
    if (m.discord_user_id) index.set(m.discord_user_id, m.entrant_id);
  }
  const data = await loadStandingsData(ex, events);
  return {
    entrants: withMembers,
    ctx: { hasEntrants: withMembers.length > 0, index, entrantNames: new Map(withMembers.map((e) => [e.id, e.name])), data },
  };
}

/** Events of the scope in (stage_order, event_order) order. */
function eventsInScope(all: SeriesEventRow[], stages: SeriesStageRow[], scope: string): SeriesEventRow[] {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const inScope = all.filter((e) => {
    if (e.status !== 'live' || !e.counts_for_standings) return false;
    if (scope === 'season') return !e.stage_id || stageById.get(e.stage_id)?.counts_toward_season !== false;
    return e.stage_id === scope;
  });
  const stageOrder = (e: SeriesEventRow) => (e.stage_id ? (stageById.get(e.stage_id)?.stage_order ?? 0) : 0);
  return inScope.sort((a, b) => stageOrder(a) - stageOrder(b) || a.event_order - b.event_order || a.id.localeCompare(b.id));
}

interface Agg {
  key: string;
  entrantId: string | null;
  name: string;
  /** Contribution per event id (merged when a competitor shows up twice in one event). */
  perEvent: Map<string, Contribution>;
}

const emptyRecord = () => ({ w: 0, l: 0, t: 0, mw: 0, ml: 0, mt: 0 });

function mergeInto(have: Contribution, c: Contribution): void {
  have.points = Math.max(have.points, c.points);
  if (c.position !== null) have.position = have.position === null ? c.position : Math.min(have.position, c.position);
  have.isWin = have.isWin || c.isWin;
  if (c.record) {
    const r = have.record ?? emptyRecord();
    for (const k of Object.keys(r) as Array<keyof typeof r>) r[k] += c.record[k];
    have.record = r;
  }
}

/** The individual view credits each player of a contribution with that contribution. */
function fanOut(c: Contribution): Contribution[] {
  return c.players.map((p) => ({ ...c, key: p.key, name: p.username, players: [p], record: c.record ? { ...c.record } : undefined }));
}

async function computeResponse(ex: Executor, series: SeriesRow, options: StandingsOptions): Promise<SeriesStandingsResponse> {
  const scope = options.scope && options.scope !== 'season' ? options.scope : 'season';
  const view = options.view ?? 'entrant';
  const stages = await listStages(ex, series.id);
  const stage = scope === 'season' ? null : stages.find((s) => s.id === scope);
  if (scope !== 'season' && !stage) throw new SeriesError('Stage not found', 404);

  const baseCfg = parseScoringConfig(series.scoring_config);
  const tableCfg = mergeConfig(baseCfg, stage?.scoring_config);
  const mode: SeriesStandingsMode = tableCfg.mode ?? 'points';
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const events = eventsInScope(await listSeriesEvents(ex, series.id), stages, scope);
  const { entrants, ctx } = await buildContext(ex, series, events);
  const individual = view === 'individual';

  // ── score every event ──
  const aggs = new Map<string, Agg>();
  const h2hRecords: H2hMatch[] = [];
  for (const event of events) {
    const cfg = mergeConfig(baseCfg, event.stage_id ? stageById.get(event.stage_id)?.scoring_config : null);
    let contribs: Contribution[];
    if (tableCfg.mode === 'head_to_head') {
      const records = eventH2hMatches(ctx, event);
      h2hRecords.push(...records);
      contribs = scoreH2hEvent(ctx, records, cfg, event.points_multiplier, individual);
    } else {
      contribs = event.match_id ? scoreMatch(ctx, event.match_id, cfg, event.points_multiplier)
        : (event.tournament_id ? scoreTournament(ctx, event.tournament_id, cfg, event.points_multiplier) : []);
      const field = contribs.filter((c) => c.position !== null).length;
      for (const c of contribs) c.field = field;
      if (individual) contribs = contribs.flatMap(fanOut);
    }
    for (const c of contribs) {
      const agg = aggs.get(c.key) ?? { key: c.key, entrantId: c.entrantId, name: c.name, perEvent: new Map() };
      agg.name = c.name; // events are scored in order, so the latest name wins
      if (c.entrantId) agg.entrantId = c.entrantId;
      const have = agg.perEvent.get(event.id);
      if (have) mergeInto(have, c);
      else agg.perEvent.set(event.id, { ...c, record: c.record ? { ...c.record } : undefined });
      aggs.set(c.key, agg);
    }
  }

  const entrantById = new Map<string, SeriesEntrantRow>(entrants.map((e) => [e.id, e]));
  // entrant view of a series with entrants lists every active entrant, even before its first result
  if (ctx.hasEntrants && !individual) {
    for (const e of entrants) {
      if (e.status === 'active' && !aggs.has(e.id)) aggs.set(e.id, { key: e.id, entrantId: e.id, name: e.name, perEvent: new Map() });
    }
  }

  // ── rows ──
  const dropWorst = tableCfg.drop_worst ?? 0;
  const items: Array<RankItem & { row: SeriesStandingRow }> = [];
  for (const agg of aggs.values()) {
    const played = events.filter((e) => agg.perEvent.has(e.id));
    const dropped = new Set<string>();
    if (dropWorst > 0 && played.length > dropWorst) {
      const worst = played
        .map((e, i) => ({ id: e.id, i, points: agg.perEvent.get(e.id)!.points }))
        .sort((a, b) => a.points - b.points || b.i - a.i)
        .slice(0, dropWorst);
      for (const w of worst) dropped.add(w.id);
    }

    let total = 0;
    const rec = emptyRecord();
    let eventWins = 0;
    let podiums = 0;
    const positionCounts: number[] = [];
    const eventPoints: SeriesStandingEventPoints[] = events.map((e) => {
      const c = agg.perEvent.get(e.id);
      if (!c) return { series_event_id: e.id, points: null };
      if (dropped.has(e.id)) return { series_event_id: e.id, points: c.points, dropped: true };
      total += c.points;
      return { series_event_id: e.id, points: c.points };
    });
    for (const c of agg.perEvent.values()) {
      if (c.record) for (const k of Object.keys(rec) as Array<keyof typeof rec>) rec[k] += c.record[k];
      if (c.isWin) eventWins++;
      if (c.position !== null) {
        if (c.position <= 3 && (c.field ?? 0) >= 3) podiums++;
        positionCounts[c.position - 1] = (positionCounts[c.position - 1] ?? 0) + 1;
      }
    }

    const entrant = agg.entrantId ? entrantById.get(agg.entrantId) : undefined;
    const entrantRow = !individual && ctx.hasEntrants ? entrant : undefined;
    const name = entrantRow?.name ?? agg.name;
    const row: SeriesStandingRow = {
      rank: 0,
      entrant_id: individual || !ctx.hasEntrants ? null : agg.key,
      key: agg.key,
      name,
      ...(entrant ? { tag: entrant.tag, color: entrant.color, division: entrant.division } : {}),
      ...(individual ? { entrant_name: entrant?.name ?? null } : {}),
      total_points: total,
      events_played: agg.perEvent.size,
      ...(tableCfg.mode === 'head_to_head' ? {
        match_wins: rec.w, match_losses: rec.l, match_ties: rec.t, map_wins: rec.mw, map_losses: rec.ml, map_ties: rec.mt, map_diff: rec.mw - rec.ml,
      } : {
        event_wins: eventWins, podiums,
      }),
      events: eventPoints,
      username: name,
      user_id: agg.key,
    };
    items.push({
      row, key: agg.key, name, total_points: total, match_wins: rec.w, match_losses: rec.l, match_ties: rec.t,
      map_wins: rec.mw, map_losses: rec.ml, map_ties: rec.mt, event_wins: eventWins, positionCounts,
    });
  }

  // ── order and rank ──
  const mini: MiniTable | null = tableCfg.mode === 'head_to_head' && !individual ? miniTable(h2hRecords) : null;
  const groups = orderByTiebreakers(items, defaultTiebreakers(tableCfg), mini);
  const rows: SeriesStandingRow[] = [];
  for (const group of groups) {
    const rank = rows.length + 1;
    for (const item of [...group].sort((a, b) => a.name.localeCompare(b.name))) rows.push({ ...item.row, rank });
  }

  const divisions = [...new Set(rows.map((r) => r.division).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b));
  return {
    series_id: series.id,
    series_name: series.name,
    mode,
    scope: stage ? { type: 'stage', stage_id: stage.id } : { type: 'season' },
    view,
    events: events.map((e) => ({
      id: e.id,
      name: (e.match_id ? ctx.data.matches.get(e.match_id)?.name : ctx.data.tournaments.get(e.tournament_id ?? '')?.name) ?? null,
      event_order: e.event_order,
      stage_id: e.stage_id,
    })),
    divisions,
    standings: rows,
    rows,
  };
}

/** The record between the given entrants only (head_to_head tiebreaker), over every counted 2-entrant match. */
function miniTable(records: H2hMatch[]): MiniTable {
  return (keys) => {
    const out = new Map<string, { wins: number; games: number }>();
    // A win counts 1, a draw 0.5 (so a drawn pairing is not scored like a loss and ranked below teams that have not played).
    const bump = (key: string, credit: number) => {
      const have = out.get(key) ?? { wins: 0, games: 0 };
      have.games++;
      have.wins += credit;
      out.set(key, have);
    };
    for (const m of records) {
      if (!keys.has(m.a.entrantId) || !keys.has(m.b.entrantId)) continue;
      bump(m.a.entrantId, m.winner === null ? 0.5 : (m.winner === 'a' ? 1 : 0));
      bump(m.b.entrantId, m.winner === null ? 0.5 : (m.winner === 'b' ? 1 : 0));
    }
    return out;
  };
}

/** The standings of a series (`null` when it does not exist). Throws a 404 `SeriesError` for an unknown stage. */
export async function getSeriesStandingsResponse(ex: Executor, seriesId: string, options: StandingsOptions = {}): Promise<SeriesStandingsResponse | null> {
  const series = await getSeriesById(ex, seriesId);
  return series ? computeResponse(ex, series, options) : null;
}

/** The rows of the season standings (`[]` for an unknown series). */
export async function getSeriesStandings(ex: Executor, seriesId: string, options: StandingsOptions = {}): Promise<SeriesStandingRow[]> {
  return (await getSeriesStandingsResponse(ex, seriesId, options))?.rows ?? [];
}

// ─── champion ────────────────────────────────────────────────────────────────

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Champion(s) of a completed season playoff tournament, or null. */
async function playoffChampion(ex: Executor, series: SeriesRow, event: SeriesEventRow): Promise<SeriesChampionDto | null> {
  if (!event.tournament_id) return null;
  const { ctx } = await buildContext(ex, series, [event]);
  const winners = scoreTournament(ctx, event.tournament_id, { tournament_position_points: [1] }, 1).filter((c) => c.position === 1);
  if (winners.length === 0) return null;
  const names = uniq(winners.map((w) => (ctx.hasEntrants ? w.name : (w.label ?? w.name))));
  const entrantIds = uniq(winners.map((w) => w.entrantId));
  return { entrant_id: entrantIds.length === 1 ? entrantIds[0] : null, name: names.join(', '), source: 'season_playoff' };
}

/**
 * Champion of a series: the winner of its completed `season_playoff` tournament, else the leader(s) of the season table
 * once the series is `complete`; null otherwise.
 */
export async function getSeriesChampion(ex: Executor, seriesId: string): Promise<SeriesChampionDto | null> {
  const series = await getSeriesById(ex, seriesId);
  if (!series) return null;
  const events = await listSeriesEvents(ex, seriesId);
  const playoffs = events.filter((e) => e.role === 'season_playoff' && e.status === 'live' && e.tournament_id).sort((a, b) => b.event_order - a.event_order);
  for (const event of playoffs) {
    const champion = await playoffChampion(ex, series, event);
    if (champion) return champion;
  }
  if (series.status !== 'complete') return null;

  const rows = (await computeResponse(ex, series, {})).rows;
  const leaders = rows.filter((r) => r.rank === 1 && (r.total_points > 0 || (r.match_wins ?? 0) > 0));
  if (leaders.length === 0) return null;
  return {
    entrant_id: leaders.length === 1 ? leaders[0].entrant_id : null,
    name: leaders.map((l) => l.name).join(', '),
    source: 'standings',
  };
}
