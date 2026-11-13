/**
 * Player self-service registration for a series in `registration` status (the Discord "Register" / "Join team" /
 * "Leave" buttons of the `registration_open` post). Built on `entrants.ts`: registering creates a `pending` entrant
 * that an admin approves in the web UI; every check runs under the series row lock so two clicks cannot both take the
 * last roster slot. Rejections are `SeriesError`s whose message is safe to show to the player.
 */
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import type { Executor } from '../../../lib/db';
import { series as seriesTable, seriesEntrantMembers, seriesEntrants } from '../../../lib/db/schema';
import { SeriesError, lockSeries, type SeriesRow } from './series';
import { addEntrantMember, createEntrant, listActiveRoster, listEntrants, removeEntrantMember, updateEntrantMember } from './entrants';

/** A Discord player; the Discord id doubles as the user id, as for match and tournament signups. */
export interface RegistrationPlayer {
  user_id: string;
  discord_user_id?: string | null;
  username: string;
}

export interface RegistrationResult {
  entrant_id: string;
  entrant_name: string;
}

export interface LeaveResult extends RegistrationResult {
  /** A pending entrant left without any member is deleted. */
  entrant_deleted: boolean;
}

export interface JoinableEntrant {
  id: string;
  name: string;
  tag: string | null;
  status: 'pending' | 'active';
  member_count: number;
  roster_max: number | null;
}

export const MAX_TEAM_NAME_LENGTH = 45;
export const MAX_TEAM_TAG_LENGTH = 8;

export const TEAM_CREATION_DISABLED = 'New teams can not be registered from Discord for this series. Use Join team to join an existing team.';

/** Team series: may players register new teams themselves (`discord_config.team_creation`, default true)? */
export function teamCreationAllowed(s: Pick<SeriesRow, 'discord_config'>): boolean {
  return s.discord_config?.team_creation !== false;
}

const cleaned = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '');

/** Locks the series and requires registration to be open (409 otherwise, 404 for an unknown series). */
async function lockOpenSeries(tx: Executor, seriesId: string): Promise<SeriesRow> {
  const row = await lockSeries(tx, seriesId);
  if (!row) throw new SeriesError('Series not found', 404);
  if (row.status !== 'registration') throw new SeriesError('Registration for this series is not open', 409);
  return row;
}

function assertPlayer(player: RegistrationPlayer): void {
  if (!cleaned(player.user_id) || !cleaned(player.username)) throw new SeriesError('A player id and username are required', 400);
}

/** First free entrant name for a solo player: the username, then `username (2)`, `username (3)`, ... */
function freeName(taken: Set<string>, base: string): string {
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Registers a player. Solo series: a pending entrant named after the player (a clash gets a numeric suffix). Team
 * series: a pending entrant with the given name / tag and the player as captain (`team.name` is required; a taken name
 * is a 409). 409 when registration is closed or the player is already on a roster of this series.
 */
export async function registerForSeries(
  ex: Executor,
  seriesId: string,
  player: RegistrationPlayer,
  options: { team?: { name: string; tag?: string | null } } = {},
): Promise<RegistrationResult> {
  assertPlayer(player);
  return ex.transaction(async (tx) => {
    const series = await lockOpenSeries(tx, seriesId);
    const existing = await listEntrants(tx, seriesId);
    const taken = new Set(existing.map((e) => e.name.toLowerCase()));
    const member = {
      user_id: player.user_id.trim(), discord_user_id: cleaned(player.discord_user_id) || player.user_id.trim(),
      username: player.username.trim(),
    };

    let name: string;
    let tag: string | null = null;
    if (series.entrant_type === 'team') {
      if (!teamCreationAllowed(series)) throw new SeriesError(TEAM_CREATION_DISABLED, 409);
      name = cleaned(options.team?.name);
      if (!name) throw new SeriesError('A team name is required', 400);
      if (name.length > MAX_TEAM_NAME_LENGTH) throw new SeriesError(`A team name has at most ${MAX_TEAM_NAME_LENGTH} characters`, 400);
      if (taken.has(name.toLowerCase())) throw new SeriesError('A team with this name already exists in this series', 409);
      tag = cleaned(options.team?.tag) || null;
      if (tag && tag.length > MAX_TEAM_TAG_LENGTH) throw new SeriesError(`A team tag has at most ${MAX_TEAM_TAG_LENGTH} characters`, 400);
    } else {
      name = freeName(taken, member.username);
    }

    const entrantId = await createEntrant(tx, seriesId, {
      name, tag, status: 'pending', members: [{ ...member, role: series.entrant_type === 'team' ? 'captain' : 'player' }],
    });
    return { entrant_id: entrantId, entrant_name: name };
  });
}

/** Entrants of a team series a player could join now: not withdrawn and below `roster_max`, by name. */
export async function listJoinableEntrants(ex: Executor, seriesId: string): Promise<JoinableEntrant[]> {
  const [series] = await ex.select({ roster_max: seriesTable.roster_max }).from(seriesTable).where(eq(seriesTable.id, seriesId));
  if (!series) return [];
  const entrants = await listEntrants(ex, seriesId, { statuses: ['pending', 'active'] });
  return entrants
    .filter((e) => series.roster_max === null || e.members.length < series.roster_max)
    .map((e) => ({
      id: e.id, name: e.name, tag: e.tag, status: e.status as 'pending' | 'active', member_count: e.members.length, roster_max: series.roster_max,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Adds the player to an existing entrant of a team series as a player. 409: registration closed, withdrawn entrant,
 * roster full, player already on a roster; 400 for a solo series (nothing to join).
 */
export async function joinSeriesEntrant(
  ex: Executor, seriesId: string, entrantId: string, player: RegistrationPlayer,
): Promise<RegistrationResult> {
  assertPlayer(player);
  return ex.transaction(async (tx) => {
    const series = await lockOpenSeries(tx, seriesId);
    if (series.entrant_type !== 'team') throw new SeriesError('This series has solo entrants; there is no team to join', 400);
    const [entrant] = await tx.select().from(seriesEntrants).where(and(eq(seriesEntrants.id, entrantId), eq(seriesEntrants.series_id, seriesId)));
    if (!entrant) throw new SeriesError('That team no longer exists', 404);
    await addEntrantMember(tx, seriesId, entrantId, {
      user_id: player.user_id.trim(), discord_user_id: cleaned(player.discord_user_id) || player.user_id.trim(),
      username: player.username.trim(), role: 'player',
    });
    return { entrant_id: entrant.id, entrant_name: entrant.name };
  });
}

/**
 * Takes the player off their current roster in the series (soft leave; a pending entrant left empty is deleted, and a
 * captain who leaves hands the captaincy to the next member). 409 when registration is closed, 404 when the player is
 * on no roster.
 */
export async function leaveSeries(ex: Executor, seriesId: string, player: Pick<RegistrationPlayer, 'user_id' | 'discord_user_id'>): Promise<LeaveResult> {
  return ex.transaction(async (tx) => {
    await lockOpenSeries(tx, seriesId);
    const keys = [eq(seriesEntrantMembers.user_id, player.user_id)];
    if (player.discord_user_id) keys.push(eq(seriesEntrantMembers.discord_user_id, player.discord_user_id));
    keys.push(eq(seriesEntrantMembers.discord_user_id, player.user_id));
    const [current] = await tx.select({ member: seriesEntrantMembers, entrant_name: seriesEntrants.name }).from(seriesEntrantMembers)
      .innerJoin(seriesEntrants, eq(seriesEntrants.id, seriesEntrantMembers.entrant_id))
      .where(and(eq(seriesEntrantMembers.series_id, seriesId), isNull(seriesEntrantMembers.left_at), or(...keys)))
      .orderBy(asc(seriesEntrantMembers.joined_at))
      .limit(1);
    if (!current) throw new SeriesError('You are not on a roster in this series', 404);

    const { member } = current;
    const removed = await removeEntrantMember(tx, seriesId, member.entrant_id, member.id, { deleteEmptyPending: true });
    if (!removed.entrant_deleted && member.role === 'captain') {
      const [next] = await listActiveRoster(tx, member.entrant_id);
      if (next) await updateEntrantMember(tx, seriesId, member.entrant_id, next.id, { role: 'captain' });
    }
    return { entrant_id: member.entrant_id, entrant_name: current.entrant_name, entrant_deleted: removed.entrant_deleted };
  });
}
