/**
 * Entrant selection and roster snapshots for the event builder: which entrants take part in an event they create and
 * which players each brings. Creation copies the CURRENT roster; later roster changes never touch an existing match.
 */
import type { Executor } from '../../../lib/db';
import type { BulkParticipantInput } from '../matches/participants';
import { listEntrants, type SeriesEntrantMemberRow, type SeriesEntrantWithMembers } from './entrants';
import { SeriesError, type SeriesRow } from './series';

export type ResolvedEntrant = SeriesEntrantWithMembers;

/** Every entrant of the series (any status) with its current roster, ordered by seed (unseeded last) then name. */
export async function loadSeriesEntrants(ex: Executor, seriesId: string): Promise<Map<string, ResolvedEntrant>> {
  return new Map((await listEntrants(ex, seriesId)).map((e) => [e.id, e]));
}

/**
 * The entrants of an event. `requested` null/undefined = every active entrant (seed, then name). An explicit list keeps
 * its order and must name distinct, active entrants of this series.
 */
export function selectEntrants(all: Map<string, ResolvedEntrant>, requested: readonly string[] | null | undefined): ResolvedEntrant[] {
  if (requested === null || requested === undefined) return [...all.values()].filter((e) => e.status === 'active');
  const seen = new Set<string>();
  const out: ResolvedEntrant[] = [];
  for (const id of requested) {
    if (seen.has(id)) throw new SeriesError(`entrant_ids lists ${id} more than once`, 400);
    seen.add(id);
    const entrant = all.get(id);
    if (!entrant) throw new SeriesError(`Entrant ${id} does not belong to this series`, 400);
    if (entrant.status !== 'active') throw new SeriesError(`Entrant "${entrant.name}" is ${entrant.status}; only active entrants can take part in events`, 400);
    out.push(entrant);
  }
  return out;
}

/**
 * Every entrant's current roster must satisfy the series' `roster_min`, and have at least `minMembers` players when the
 * event needs a player per entrant (solo entrants, individual layouts, tournaments: nobody to put on the grid otherwise).
 */
export function assertRosters(series: Pick<SeriesRow, 'roster_min'>, entrants: readonly ResolvedEntrant[], minMembers = 0): void {
  const need = Math.max(series.roster_min ?? 0, minMembers);
  if (need <= 0) return;
  for (const e of entrants) {
    if (e.members.length < need) {
      throw new SeriesError(`Entrant "${e.name}" has ${e.members.length} player(s) on its roster but needs at least ${need}`, 400);
    }
  }
}

/** Seed ascending (unseeded last), then name: the default seeding of a bracket. */
export function orderBySeed(entrants: readonly ResolvedEntrant[]): ResolvedEntrant[] {
  return [...entrants].sort((a, b) => {
    if (a.seed !== b.seed) {
      if (a.seed === null) return 1;
      if (b.seed === null) return -1;
      return a.seed - b.seed;
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

/** The roster member who receives map codes / winner-vote DMs: the captain, else the first player. */
export function commanderOf(members: readonly SeriesEntrantMemberRow[]): SeriesEntrantMemberRow | undefined {
  return members.find((m) => m.role === 'captain') ?? members[0];
}

/** An entrant's roster as match participants (the commander flagged for map codes). */
export function rosterAsParticipants(entrant: ResolvedEntrant): BulkParticipantInput[] {
  const commander = commanderOf(entrant.members);
  return entrant.members.map((m) => ({
    user_id: m.user_id, discord_user_id: m.discord_user_id, username: m.username, receives_map_codes: m.id === commander?.id,
  }));
}
