import type {
  SeriesEntrantDto, SeriesEntrantMemberDto, SeriesEntrantStatus, SeriesEntrantType, SeriesMemberRole,
} from '@/shared/series-types';

export const ENTRANT_STATUS_COLOR: Record<SeriesEntrantStatus, string> = {
  pending: 'yellow',
  active: 'green',
  withdrawn: 'gray',
};

export const MEMBER_ROLE_COLOR: Record<SeriesMemberRole, string> = {
  captain: 'yellow',
  player: 'blue',
  sub: 'gray',
};

export const MEMBER_ROLE_LABEL: Record<SeriesMemberRole, string> = {
  captain: 'Captain',
  player: 'Player',
  sub: 'Sub',
};

export const NO_DIVISION_LABEL = 'No division';

export interface EntrantGroup {
  /** null = entrants without a division. */
  division: string | null;
  label: string;
  entrants: SeriesEntrantDto[];
}

/** Seed first (unseeded last), then name. */
export function compareEntrants(a: SeriesEntrantDto, b: SeriesEntrantDto): number {
  const sa = a.seed ?? Number.POSITIVE_INFINITY;
  const sb = b.seed ?? Number.POSITIVE_INFINITY;
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** Current members (left_at null) in roster order: captain, players, subs, then by name. */
export function currentMembers(entrant: Pick<SeriesEntrantDto, 'members'>): SeriesEntrantMemberDto[] {
  const rank: Record<SeriesMemberRole, number> = { captain: 0, player: 1, sub: 2 };
  return entrant.members
    .filter((m) => !m.left_at)
    .sort((a, b) => rank[a.role] - rank[b.role] || a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
}

/** Members who left the roster, most recent first. */
export function formerMembers(entrant: Pick<SeriesEntrantDto, 'members'>): SeriesEntrantMemberDto[] {
  return entrant.members
    .filter((m) => !!m.left_at)
    .sort((a, b) => (b.left_at ?? '').localeCompare(a.left_at ?? ''));
}

/**
 * Groups entrants by division. With no divisions at all the result is a single group (rendered as a flat list);
 * otherwise named divisions sort alphabetically and entrants without a division come last.
 */
export function groupEntrantsByDivision(entrants: readonly SeriesEntrantDto[]): EntrantGroup[] {
  const sorted = [...entrants].sort(compareEntrants);
  const named = new Map<string, SeriesEntrantDto[]>();
  const none: SeriesEntrantDto[] = [];
  for (const e of sorted) {
    const division = e.division?.trim();
    if (!division) { none.push(e); continue; }
    const list = named.get(division) ?? [];
    list.push(e);
    named.set(division, list);
  }
  if (named.size === 0) return [{ division: null, label: 'Entrants', entrants: none }];
  const groups: EntrantGroup[] = [...named.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([division, list]) => ({ division, label: division, entrants: list }));
  if (none.length > 0) groups.push({ division: null, label: NO_DIVISION_LABEL, entrants: none });
  return groups;
}

/** Distinct divisions already used (for the division autocomplete). */
export function distinctDivisions(entrants: readonly SeriesEntrantDto[]): string[] {
  const set = new Set<string>();
  for (const e of entrants) if (e.division?.trim()) set.add(e.division.trim());
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Suggested seed for a new entrant: one past the highest seed in use. */
export function nextSeed(entrants: readonly SeriesEntrantDto[]): number {
  return entrants.reduce((max, e) => Math.max(max, e.seed ?? 0), 0) + 1;
}

export type RosterState = 'ok' | 'short' | 'full' | 'empty';

/** Team roster fill against the series bounds: `short` below `roster_min`, `full` at `roster_max`. */
export function rosterState(
  entrant: Pick<SeriesEntrantDto, 'members'>, rosterMin: number | null | undefined, rosterMax: number | null | undefined,
): { state: RosterState; count: number; missing: number } {
  const count = currentMembers(entrant).length;
  if (count === 0) return { state: 'empty', count, missing: Math.max(rosterMin ?? 1, 1) };
  if (rosterMin && count < rosterMin) return { state: 'short', count, missing: rosterMin - count };
  if (rosterMax && count >= rosterMax) return { state: 'full', count, missing: 0 };
  return { state: 'ok', count, missing: 0 };
}

/** Role a newly added member should get by default: captain for the first player of a team, else player. */
export function defaultMemberRole(entrantType: SeriesEntrantType, entrant: Pick<SeriesEntrantDto, 'members'>): SeriesMemberRole {
  if (entrantType === 'solo') return 'player';
  return currentMembers(entrant).some((m) => m.role === 'captain') ? 'player' : 'captain';
}

/** Key identifying a player across searches and rosters (Discord id, else user id). */
export function playerKey(p: { user_id: string; discord_user_id?: string | null }): string {
  return p.discord_user_id ?? p.user_id;
}

/** Keys of every player currently on a roster in the series (a player is on at most one current roster). */
export function rosteredPlayerKeys(entrants: readonly SeriesEntrantDto[]): Set<string> {
  const keys = new Set<string>();
  for (const e of entrants) {
    if (e.status === 'withdrawn') continue;
    for (const m of currentMembers(e)) keys.add(playerKey(m));
  }
  return keys;
}

/** Optional text field -> trimmed string or null (what the API stores). */
export function blankToNull(value: string): string | null {
  const t = value.trim();
  return t === '' ? null : t;
}

/** Toast text for a withdraw result. */
export function describeWithdrawResult(name: string, cancelled: number, forfeited: number): string {
  const parts: string[] = [];
  if (cancelled > 0) parts.push(`${cancelled} ${cancelled === 1 ? 'match' : 'matches'} cancelled`);
  if (forfeited > 0) parts.push(`${forfeited} ${forfeited === 1 ? 'match' : 'matches'} forfeited`);
  return parts.length > 0 ? `${name} withdrawn: ${parts.join(', ')}` : `${name} withdrawn`;
}
