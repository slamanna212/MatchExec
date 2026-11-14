/**
 * `series_entrants` and `series_entrant_members`: who competes all season (a team, or a single player) and who is on
 * each roster. Every mutation runs in one transaction that first takes the series row lock (`lockSeries`), like the
 * event mutations do. Leaving a roster is soft (`left_at`), because history counts: a player's old results still belong
 * to the entrant they raced for.
 */
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { uniqueViolationConstraint } from '../../../lib/db/errors';
import {
  matchParticipants, matchTeams, matches, seriesEntrantMembers, seriesEntrants, seriesEvents, tournamentParticipants,
  tournamentTeams,
} from '../../../lib/db/schema';
import type { CopySeriesEntrantsInput, CreateSeriesEntrantInput, SeriesEntrantStatus, SeriesMemberRole } from '../../../shared/series-types';
import { escapeLike } from '../games';
import { genId } from '../matches/ids';
import { logger } from '../logger';
import { SeriesError, getSeriesById, lockSeries, type SeriesRow } from './series';

export type SeriesEntrantRow = typeof seriesEntrants.$inferSelect;
export type SeriesEntrantMemberRow = typeof seriesEntrantMembers.$inferSelect;
export type SeriesEntrantWithMembers = SeriesEntrantRow & { members: SeriesEntrantMemberRow[] };

export const newEntrantId = (): string => genId('sentr');
export const newEntrantMemberId = (): string => genId('smem');

export type EntrantMemberInput = NonNullable<CreateSeriesEntrantInput['members']>[number];

const MEMBER_UNIQUE = 'idx_series_entrant_members_current';
const NAME_UNIQUE = 'series_entrants_series_id_name_unique';

// ─── reads ───────────────────────────────────────────────────────────────────

const roleRank = sql`case ${seriesEntrantMembers.role} when 'captain' then 0 when 'player' then 1 else 2 end`;

/** Members of the given entrants (current roster only unless `includeLeft`), captain first, then by join time. */
async function loadMembers(ex: Executor, entrantIds: string[], includeLeft: boolean): Promise<Map<string, SeriesEntrantMemberRow[]>> {
  const out = new Map<string, SeriesEntrantMemberRow[]>();
  if (entrantIds.length === 0) return out;
  const rows = await ex.select().from(seriesEntrantMembers)
    .where(and(inArray(seriesEntrantMembers.entrant_id, entrantIds), includeLeft ? undefined : isNull(seriesEntrantMembers.left_at)))
    .orderBy(roleRank, asc(seriesEntrantMembers.joined_at), asc(seriesEntrantMembers.id));
  // Rows saved before avatars were stored fall back to an avatar the participant tables already know.
  const missing = [...new Set(rows.filter((r) => !r.avatar_url && r.discord_user_id).map((r) => r.discord_user_id as string))];
  const known = new Map<string, string>();
  if (missing.length > 0) {
    const found = await ex.select({ id: matchParticipants.discord_user_id, avatar: matchParticipants.avatar_url, at: matchParticipants.joined_at })
      .from(matchParticipants)
      .where(and(inArray(matchParticipants.discord_user_id, missing), isNotNull(matchParticipants.avatar_url)))
      .orderBy(asc(matchParticipants.joined_at));
    for (const f of found) if (f.id && f.avatar) known.set(f.id, f.avatar);
  }
  for (const r of rows) {
    if (!r.avatar_url && r.discord_user_id) r.avatar_url = known.get(r.discord_user_id) ?? null;
    const list = out.get(r.entrant_id) ?? [];
    list.push(r);
    out.set(r.entrant_id, list);
  }
  return out;
}

/** Entrants of a series with their rosters, ordered by seed (unseeded last) then name. */
export async function listEntrants(
  ex: Executor,
  seriesId: string,
  options: { includeLeft?: boolean; statuses?: SeriesEntrantStatus[] } = {},
): Promise<SeriesEntrantWithMembers[]> {
  const rows = await ex.select().from(seriesEntrants)
    .where(and(
      eq(seriesEntrants.series_id, seriesId),
      options.statuses && options.statuses.length > 0 ? inArray(seriesEntrants.status, options.statuses) : undefined,
    ))
    .orderBy(sql`${seriesEntrants.seed} asc nulls last`, asc(seriesEntrants.name), asc(seriesEntrants.id));
  const members = await loadMembers(ex, rows.map((r) => r.id), options.includeLeft === true);
  return rows.map((r) => ({ ...r, members: members.get(r.id) ?? [] }));
}

export async function getEntrantRow(ex: Executor, seriesId: string, entrantId: string): Promise<SeriesEntrantRow | null> {
  const [row] = await ex.select().from(seriesEntrants).where(and(eq(seriesEntrants.id, entrantId), eq(seriesEntrants.series_id, seriesId)));
  return row ?? null;
}

export async function getEntrant(
  ex: Executor, seriesId: string, entrantId: string, options: { includeLeft?: boolean } = {},
): Promise<SeriesEntrantWithMembers | null> {
  const row = await getEntrantRow(ex, seriesId, entrantId);
  if (!row) return null;
  const members = await loadMembers(ex, [row.id], options.includeLeft === true);
  return { ...row, members: members.get(row.id) ?? [] };
}

/** The current roster of an entrant (`left_at` null), captain first. */
export async function listActiveRoster(ex: Executor, entrantId: string): Promise<SeriesEntrantMemberRow[]> {
  return (await loadMembers(ex, [entrantId], false)).get(entrantId) ?? [];
}

/**
 * The entrant a player races for in a series, matched by Discord id or user id. Members who left count (history), but a
 * current roster wins over an old one, and the most recent membership wins among old ones. Null when the player has
 * never been on a roster of this series.
 */
export async function resolveEntrantForPlayer(
  ex: Executor,
  seriesId: string,
  player: { discord_user_id?: string | null; user_id?: string | null },
): Promise<SeriesEntrantRow | null> {
  const matchers = [
    player.discord_user_id ? eq(seriesEntrantMembers.discord_user_id, player.discord_user_id) : undefined,
    // a user id is also a Discord id for most players, so look it up in both columns
    player.user_id ? eq(seriesEntrantMembers.user_id, player.user_id) : undefined,
    player.user_id ? eq(seriesEntrantMembers.discord_user_id, player.user_id) : undefined,
    player.discord_user_id ? eq(seriesEntrantMembers.user_id, player.discord_user_id) : undefined,
  ].filter((m) => m !== undefined);
  if (matchers.length === 0) return null;
  const [row] = await ex.select({ entrant: seriesEntrants }).from(seriesEntrantMembers)
    .innerJoin(seriesEntrants, eq(seriesEntrants.id, seriesEntrantMembers.entrant_id))
    .where(and(eq(seriesEntrantMembers.series_id, seriesId), or(...matchers)))
    .orderBy(sql`(${seriesEntrantMembers.left_at} is not null)`, desc(seriesEntrantMembers.joined_at), asc(seriesEntrantMembers.id))
    .limit(1);
  return row?.entrant ?? null;
}

/**
 * All player keys of a series' rosters at once (for standings, which resolve many results): key = Discord id, else
 * user id, as everywhere else. Both ids of a member map to the same entrant; a current roster wins over an old one.
 */
export async function loadPlayerEntrantIndex(ex: Executor, seriesId: string): Promise<Map<string, string>> {
  const rows = await ex.select().from(seriesEntrantMembers).where(eq(seriesEntrantMembers.series_id, seriesId));
  // iterate old -> current so later (current) rows overwrite earlier ones
  const ordered = [...rows].sort((a, b) => Number(b.left_at !== null) - Number(a.left_at !== null) || a.joined_at.getTime() - b.joined_at.getTime());
  const index = new Map<string, string>();
  for (const m of ordered) {
    index.set(m.user_id, m.entrant_id);
    if (m.discord_user_id) index.set(m.discord_user_id, m.entrant_id);
  }
  return index;
}

// ─── write helpers ───────────────────────────────────────────────────────────

/** Locks the series and refuses (409) when its entrants can no longer change. */
export async function lockEntrantsEditable(tx: Executor, seriesId: string): Promise<SeriesRow> {
  const row = await lockSeries(tx, seriesId);
  if (!row) throw new SeriesError('Series not found', 404);
  if (row.status === 'complete' || row.status === 'cancelled') {
    throw new SeriesError(`Cannot modify the entrants of a ${row.status} series`, 409);
  }
  return row;
}

/** Largest roster this series allows an entrant to have. */
function rosterLimit(s: Pick<SeriesRow, 'entrant_type' | 'roster_max'>): number | null {
  if (s.entrant_type === 'solo') return 1;
  return s.roster_max;
}

const clean = (v: string | null | undefined): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? null : t;
};

/** Rejects a second current roster for the same player (matched by user id or Discord id). */
async function assertPlayerFree(tx: Executor, seriesId: string, member: { user_id: string; discord_user_id?: string | null }, entrantId: string): Promise<void> {
  const keys = [eq(seriesEntrantMembers.user_id, member.user_id)];
  if (member.discord_user_id) keys.push(eq(seriesEntrantMembers.discord_user_id, member.discord_user_id));
  const [clash] = await tx.select({ entrant_id: seriesEntrantMembers.entrant_id, name: seriesEntrants.name })
    .from(seriesEntrantMembers).innerJoin(seriesEntrants, eq(seriesEntrants.id, seriesEntrantMembers.entrant_id))
    .where(and(eq(seriesEntrantMembers.series_id, seriesId), isNull(seriesEntrantMembers.left_at), or(...keys)))
    .limit(1);
  if (clash) {
    throw new SeriesError(clash.entrant_id === entrantId ? 'Player is already on this roster' : `Player is already on the roster of "${clash.name}" in this series`, 409);
  }
}

/** Maps the unique violations of entrant / member inserts to 409s; rethrows anything else. */
function mapUnique(err: unknown): never {
  const constraint = uniqueViolationConstraint(err);
  if (constraint === null) throw err;
  if (constraint === MEMBER_UNIQUE || /entrant_members/.test(constraint)) throw new SeriesError('Player is already on a roster in this series', 409);
  if (constraint === NAME_UNIQUE || /entrants/.test(constraint)) throw new SeriesError('An entrant with this name already exists in this series', 409);
  throw err;
}

async function demoteCaptains(tx: Executor, entrantId: string, exceptMemberId?: string): Promise<void> {
  await tx.update(seriesEntrantMembers).set({ role: 'player' })
    .where(and(
      eq(seriesEntrantMembers.entrant_id, entrantId), eq(seriesEntrantMembers.role, 'captain'), isNull(seriesEntrantMembers.left_at),
      exceptMemberId ? sql`${seriesEntrantMembers.id} <> ${exceptMemberId}` : undefined,
    ));
}

async function countCurrent(tx: Executor, entrantId: string): Promise<number> {
  const [row] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(seriesEntrantMembers)
    .where(and(eq(seriesEntrantMembers.entrant_id, entrantId), isNull(seriesEntrantMembers.left_at)));
  return row?.n ?? 0;
}

/**
 * Strictly increasing join timestamps. Rosters are ordered by joined_at (then id), and "the first player" receives map
 * codes when there is no captain. Members inserted in one transaction would otherwise share now() and fall back to the
 * random id order.
 */
let lastJoinedAt = 0;
function nextJoinedAt(): Date {
  lastJoinedAt = Math.max(Date.now(), lastJoinedAt + 1);
  return new Date(lastJoinedAt);
}

/** Inserts one member into an entrant under the series' roster limit (one current roster per player, one captain). */
export async function insertEntrantMember(tx: Executor, series: SeriesRow, entrantId: string, member: EntrantMemberInput): Promise<SeriesEntrantMemberRow> {
  const limit = rosterLimit(series);
  if (limit !== null && (await countCurrent(tx, entrantId)) >= limit) {
    throw new SeriesError(series.entrant_type === 'solo' ? 'A solo entrant has exactly one player' : `This roster is full (at most ${limit} players)`, 409);
  }
  await assertPlayerFree(tx, series.id, member, entrantId);
  const role: SeriesMemberRole = series.entrant_type === 'solo' ? 'player' : (member.role ?? 'player');
  if (role === 'captain') await demoteCaptains(tx, entrantId);
  try {
    const [row] = await tx.insert(seriesEntrantMembers).values({
      id: newEntrantMemberId(), entrant_id: entrantId, series_id: series.id, user_id: member.user_id.trim(),
      discord_user_id: clean(member.discord_user_id), username: member.username.trim(), avatar_url: clean(member.avatar_url), role, joined_at: nextJoinedAt(),
    }).returning();
    return row;
  } catch (err) { return mapUnique(err); }
}

// ─── entrants ────────────────────────────────────────────────────────────────

/**
 * Creates an entrant (status `active` unless given) with its initial roster. Solo series: at most one member; team
 * series: at most `roster_max`. Throws `SeriesError` (404 unknown series, 409 locked series / duplicate name / player
 * already on a roster, 400 bad roster). Returns the new id.
 */
export async function createEntrant(ex: Executor, seriesId: string, input: CreateSeriesEntrantInput): Promise<string> {
  return ex.transaction(async (tx) => {
    const series = await lockEntrantsEditable(tx, seriesId);
    const members = input.members ?? [];
    const limit = rosterLimit(series);
    if (limit !== null && members.length > limit) {
      throw new SeriesError(series.entrant_type === 'solo' ? 'A solo entrant has exactly one player' : `A roster has at most ${limit} players`, 400);
    }
    if (new Set(members.map((m) => m.user_id.trim())).size !== members.length) throw new SeriesError('The same player is listed twice', 400);
    if (members.filter((m) => m.role === 'captain').length > 1) throw new SeriesError('A roster has at most one captain', 400);

    const id = newEntrantId();
    try {
      await tx.insert(seriesEntrants).values({
        id, series_id: seriesId, name: input.name.trim(), tag: clean(input.tag), color: clean(input.color), logo_url: clean(input.logo_url),
        division: clean(input.division), seed: input.seed ?? null, status: input.status ?? 'active',
      });
    } catch (err) { mapUnique(err); }
    for (const m of members) await insertEntrantMember(tx, series, id, m);
    logger.debug(`Series entrant ${id} created in ${seriesId}`);
    return id;
  });
}

export interface UpdateEntrantInput {
  name?: string;
  tag?: string | null;
  color?: string | null;
  logo_url?: string | null;
  division?: string | null;
  seed?: number | null;
  status?: SeriesEntrantStatus;
}

/**
 * Edits an entrant. `status` may move between `pending` and `active` (approval) and back from `withdrawn` (reinstate);
 * moving TO `withdrawn` is the withdraw flow's job and is refused unless `options.allowWithdrawn` is set.
 */
export async function updateEntrant(
  ex: Executor, seriesId: string, entrantId: string, updates: UpdateEntrantInput, options: { allowWithdrawn?: boolean } = {},
): Promise<SeriesEntrantWithMembers> {
  return ex.transaction(async (tx) => {
    await lockEntrantsEditable(tx, seriesId);
    const existing = await getEntrantRow(tx, seriesId, entrantId);
    if (!existing) throw new SeriesError('Entrant not found in this series', 404);
    if (updates.status === 'withdrawn' && existing.status !== 'withdrawn' && !options.allowWithdrawn) {
      throw new SeriesError('Use the withdraw action to withdraw an entrant (it also handles its unplayed matches)', 400);
    }
    const set: Partial<typeof seriesEntrants.$inferInsert> = {};
    if (updates.name !== undefined) set.name = updates.name.trim();
    if (updates.tag !== undefined) set.tag = clean(updates.tag);
    if (updates.color !== undefined) set.color = clean(updates.color);
    if (updates.logo_url !== undefined) set.logo_url = clean(updates.logo_url);
    if (updates.division !== undefined) set.division = clean(updates.division);
    if (updates.seed !== undefined) set.seed = updates.seed;
    if (updates.status !== undefined) set.status = updates.status;
    if (Object.keys(set).length > 0) {
      try {
        await tx.update(seriesEntrants).set(set).where(eq(seriesEntrants.id, entrantId));
      } catch (err) { mapUnique(err); }
    }
    return (await getEntrant(tx, seriesId, entrantId))!;
  });
}

/** True when the entrant has any completed result: a finished match it was assigned to, or one its players played in. */
export async function entrantHasResults(ex: Executor, seriesId: string, entrantId: string): Promise<boolean> {
  const [viaTeam] = await ex.select({ id: matches.id }).from(matchTeams)
    .innerJoin(matches, eq(matches.id, matchTeams.match_id))
    .where(and(eq(matchTeams.series_entrant_id, entrantId), eq(matches.status, 'complete'))).limit(1);
  if (viaTeam) return true;
  const [viaTournamentTeam] = await ex.select({ id: matches.id }).from(tournamentTeams)
    .innerJoin(matches, or(eq(matches.blue_team_id, tournamentTeams.id), eq(matches.red_team_id, tournamentTeams.id)))
    .where(and(eq(tournamentTeams.series_entrant_id, entrantId), eq(matches.status, 'complete'))).limit(1);
  if (viaTournamentTeam) return true;

  // Legacy-style results: members who played completed series matches (directly or inside a series tournament).
  const memberKeys = await ex.select({ user_id: seriesEntrantMembers.user_id, discord_user_id: seriesEntrantMembers.discord_user_id })
    .from(seriesEntrantMembers).where(and(eq(seriesEntrantMembers.entrant_id, entrantId), eq(seriesEntrantMembers.series_id, seriesId)));
  if (memberKeys.length === 0) return false;
  const userIds = memberKeys.map((m) => m.user_id);
  const discordIds = memberKeys.map((m) => m.discord_user_id).filter((d): d is string => !!d);
  const playerMatch = or(
    inArray(matchParticipants.user_id, userIds),
    discordIds.length > 0 ? inArray(matchParticipants.discord_user_id, discordIds) : undefined,
  );
  const [played] = await ex.select({ id: matches.id }).from(seriesEvents)
    .innerJoin(matches, or(eq(matches.id, seriesEvents.match_id), eq(matches.tournament_id, seriesEvents.tournament_id)))
    .innerJoin(matchParticipants, eq(matchParticipants.match_id, matches.id))
    .where(and(eq(seriesEvents.series_id, seriesId), eq(matches.status, 'complete'), playerMatch)).limit(1);
  return !!played;
}

/** Deletes an entrant and its roster. 409 when it has completed results (withdraw it instead). */
export async function deleteEntrant(ex: Executor, seriesId: string, entrantId: string): Promise<void> {
  await ex.transaction(async (tx) => {
    await lockEntrantsEditable(tx, seriesId);
    if (!(await getEntrantRow(tx, seriesId, entrantId))) throw new SeriesError('Entrant not found in this series', 404);
    if (await entrantHasResults(tx, seriesId, entrantId)) {
      throw new SeriesError('This entrant has completed results; withdraw it instead of deleting it', 409);
    }
    await tx.delete(seriesEntrants).where(eq(seriesEntrants.id, entrantId));
  });
}

// ─── members ─────────────────────────────────────────────────────────────────

/** Adds a player to an entrant's roster. 409: roster full, withdrawn entrant, player already on a roster. */
export async function addEntrantMember(ex: Executor, seriesId: string, entrantId: string, input: EntrantMemberInput): Promise<SeriesEntrantMemberRow> {
  return ex.transaction(async (tx) => {
    const series = await lockEntrantsEditable(tx, seriesId);
    const entrant = await getEntrantRow(tx, seriesId, entrantId);
    if (!entrant) throw new SeriesError('Entrant not found in this series', 404);
    if (entrant.status === 'withdrawn') throw new SeriesError('Cannot add players to a withdrawn entrant', 409);
    return insertEntrantMember(tx, series, entrantId, input);
  });
}

async function getMember(tx: Executor, seriesId: string, entrantId: string, memberId: string): Promise<SeriesEntrantMemberRow> {
  const [row] = await tx.select().from(seriesEntrantMembers)
    .where(and(eq(seriesEntrantMembers.id, memberId), eq(seriesEntrantMembers.entrant_id, entrantId), eq(seriesEntrantMembers.series_id, seriesId)));
  if (!row) throw new SeriesError('Member not found on this entrant', 404);
  return row;
}

/** Changes a member's role (making someone captain demotes the current captain to player) and / or username. */
export async function updateEntrantMember(
  ex: Executor, seriesId: string, entrantId: string, memberId: string, updates: { role?: SeriesMemberRole; username?: string },
): Promise<SeriesEntrantMemberRow> {
  return ex.transaction(async (tx) => {
    const series = await lockEntrantsEditable(tx, seriesId);
    const member = await getMember(tx, seriesId, entrantId, memberId);
    if (member.left_at) throw new SeriesError('This player has left the roster', 409);
    const set: Partial<typeof seriesEntrantMembers.$inferInsert> = {};
    if (updates.username !== undefined) set.username = updates.username.trim();
    if (updates.role !== undefined) {
      if (series.entrant_type === 'solo' && updates.role !== 'player') throw new SeriesError('Solo entrants have no captain or subs', 400);
      set.role = updates.role;
      if (updates.role === 'captain') await demoteCaptains(tx, entrantId, memberId);
    }
    if (Object.keys(set).length > 0) await tx.update(seriesEntrantMembers).set(set).where(eq(seriesEntrantMembers.id, memberId));
    const [row] = await tx.select().from(seriesEntrantMembers).where(eq(seriesEntrantMembers.id, memberId));
    return row;
  });
}

/**
 * Takes a player off the roster by setting `left_at` (history is kept). With `deleteEmptyPending`, a `pending` entrant
 * left without any current member is deleted (the Discord "leave" flow). Returns whether the entrant was deleted.
 */
export async function removeEntrantMember(
  ex: Executor, seriesId: string, entrantId: string, memberId: string, options: { deleteEmptyPending?: boolean } = {},
): Promise<{ entrant_deleted: boolean }> {
  return ex.transaction(async (tx) => {
    await lockEntrantsEditable(tx, seriesId);
    const member = await getMember(tx, seriesId, entrantId, memberId);
    if (member.left_at) throw new SeriesError('This player already left the roster', 409);
    await tx.update(seriesEntrantMembers).set({ left_at: new Date() }).where(eq(seriesEntrantMembers.id, memberId));
    if (options.deleteEmptyPending) {
      const entrant = await getEntrantRow(tx, seriesId, entrantId);
      if (entrant?.status === 'pending' && (await countCurrent(tx, entrantId)) === 0) {
        await tx.delete(seriesEntrants).where(eq(seriesEntrants.id, entrantId));
        return { entrant_deleted: true };
      }
    }
    return { entrant_deleted: false };
  });
}

// ─── copy from a previous series ─────────────────────────────────────────────

export interface CopyEntrantsResult {
  entrants: SeriesEntrantWithMembers[];
  /** Source entrants not copied (name already present) and members not copied (already on a roster / roster full). */
  skipped: Array<{ name: string; reason: string }>;
}

/**
 * Seeds a series with entrants of another one: name / tag / color / logo / division / seed are copied (status `active`,
 * `source_entrant_id` set) and, unless `include_members === false`, the current roster. Entrants whose name already
 * exists are skipped and reported; so are members that would break the roster rules of the target.
 */
export async function copyEntrants(ex: Executor, targetSeriesId: string, input: CopySeriesEntrantsInput): Promise<CopyEntrantsResult> {
  return ex.transaction(async (tx) => {
    const target = await lockEntrantsEditable(tx, targetSeriesId);
    if (input.from_series_id === targetSeriesId) throw new SeriesError('Cannot copy entrants from the series itself', 400);
    if (!(await getSeriesById(tx, input.from_series_id))) throw new SeriesError('Source series not found', 400);

    const source = await listEntrants(tx, input.from_series_id, { statuses: ['pending', 'active'] });
    let picked = source;
    if (input.entrant_ids) {
      const known = new Set(source.map((e) => e.id));
      const unknown = input.entrant_ids.filter((id) => !known.has(id));
      if (unknown.length > 0) throw new SeriesError(`Entrants not found in the source series (or withdrawn): ${unknown.join(', ')}`, 400);
      const wanted = new Set(input.entrant_ids);
      picked = source.filter((e) => wanted.has(e.id));
    }

    const existingNames = new Set((await tx.select({ name: seriesEntrants.name }).from(seriesEntrants).where(eq(seriesEntrants.series_id, targetSeriesId))).map((r) => r.name));
    const skipped: CopyEntrantsResult['skipped'] = [];
    const createdIds: string[] = [];
    for (const src of picked) {
      if (existingNames.has(src.name)) { skipped.push({ name: src.name, reason: 'An entrant with this name already exists' }); continue; }
      const id = newEntrantId();
      await tx.insert(seriesEntrants).values({
        id, series_id: targetSeriesId, name: src.name, tag: src.tag, color: src.color, logo_url: src.logo_url, division: src.division,
        seed: src.seed, status: 'active', source_entrant_id: src.id,
      });
      existingNames.add(src.name);
      createdIds.push(id);
      if (input.include_members === false) continue;
      for (const m of src.members) {
        try {
          // a savepoint, so a member refused by the roster rules does not abort the whole copy
          await tx.transaction((sp) => insertEntrantMember(sp, target, id, {
            user_id: m.user_id, discord_user_id: m.discord_user_id, username: m.username, avatar_url: m.avatar_url, role: target.entrant_type === 'solo' ? 'player' : m.role,
          }));
        } catch (err) {
          if (!(err instanceof SeriesError)) throw err;
          skipped.push({ name: `${src.name} / ${m.username}`, reason: err.message });
        }
      }
    }
    const entrants = (await listEntrants(tx, targetSeriesId)).filter((e) => createdIds.includes(e.id));
    return { entrants, skipped };
  });
}

// ─── player search ───────────────────────────────────────────────────────────

export interface PlayerSearchResult {
  user_id: string;
  discord_user_id: string | null;
  username: string;
  avatar_url: string | null;
}

/**
 * Distinct players (by Discord id, else user id) whose name contains `query`, found in match participants, tournament
 * participants and series rosters. Most recent name / avatar wins. Empty query -> [].
 */
export async function searchPlayers(ex: Executor, query: string, limit = 20): Promise<PlayerSearchResult[]> {
  const q = query.trim();
  if (q === '') return [];
  const pattern = `%${escapeLike(q)}%`;
  const found = new Map<string, PlayerSearchResult & { at: number }>();
  const add = (rows: Array<{ user_id: string; discord_user_id: string | null; username: string; avatar_url: string | null; at: Date | null }>) => {
    for (const r of rows) {
      const key = r.discord_user_id ?? r.user_id;
      const at = r.at?.getTime() ?? 0;
      const prev = found.get(key);
      if (!prev || at > prev.at) {
        found.set(key, { user_id: r.user_id, discord_user_id: r.discord_user_id, username: r.username, avatar_url: r.avatar_url ?? prev?.avatar_url ?? null, at });
      } else if (!prev.avatar_url && r.avatar_url) prev.avatar_url = r.avatar_url;
    }
  };
  const cap = Math.max(limit * 5, 50);
  add(await ex.select({ user_id: matchParticipants.user_id, discord_user_id: matchParticipants.discord_user_id, username: matchParticipants.username, avatar_url: matchParticipants.avatar_url, at: matchParticipants.joined_at })
    .from(matchParticipants).where(ilike(matchParticipants.username, pattern)).orderBy(desc(matchParticipants.joined_at)).limit(cap));
  add(await ex.select({ user_id: tournamentParticipants.user_id, discord_user_id: tournamentParticipants.discord_user_id, username: tournamentParticipants.username, avatar_url: sql<string | null>`null`, at: tournamentParticipants.joined_at })
    .from(tournamentParticipants).where(ilike(tournamentParticipants.username, pattern)).orderBy(desc(tournamentParticipants.joined_at)).limit(cap));
  add(await ex.select({ user_id: seriesEntrantMembers.user_id, discord_user_id: seriesEntrantMembers.discord_user_id, username: seriesEntrantMembers.username, avatar_url: seriesEntrantMembers.avatar_url, at: seriesEntrantMembers.joined_at })
    .from(seriesEntrantMembers).where(ilike(seriesEntrantMembers.username, pattern)).orderBy(desc(seriesEntrantMembers.joined_at)).limit(cap));

  return [...found.values()]
    .sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }) || a.user_id.localeCompare(b.user_id))
    .slice(0, limit)
    .map(({ at: _at, ...p }) => p);
}

/** Entrant ids of a series that are not withdrawn (helper for creators that need "all active entrants"). */
export async function listActiveEntrantIds(ex: Executor, seriesId: string): Promise<string[]> {
  const rows = await ex.select({ id: seriesEntrants.id }).from(seriesEntrants)
    .where(and(eq(seriesEntrants.series_id, seriesId), notInArray(seriesEntrants.status, ['withdrawn', 'pending'])))
    .orderBy(sql`${seriesEntrants.seed} asc nulls last`, asc(seriesEntrants.name));
  return rows.map((r) => r.id);
}
