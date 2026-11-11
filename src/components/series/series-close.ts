import type {
  CloseRegistrationInput, RoundRobinDivisionMode, SeriesBatchDto, SeriesEntrantDto,
} from '@/shared/series-types';
import { schedulableEntrants } from './series-fixtures';

/** Pure logic of the close-registration dialog: divisions, assignments and the request body. */

export const MAX_DIVISIONS = 8;

/** "Division A", "Division B", ... */
export function defaultDivisionNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Division ${String.fromCharCode(65 + i)}`);
}

/** The divisions already set on the approved entrants (sorted), as the dialog's starting point. */
export function existingDivisions(entrants: readonly SeriesEntrantDto[]): string[] {
  return [...new Set(schedulableEntrants(entrants).map((e) => e.division).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b));
}

/**
 * Snake draft by seed (seed order, then name): 1 -> A, 2 -> B, 3 -> B, 4 -> A, ... keeps the divisions balanced in size
 * and strength.
 */
export function snakeSplit(entrants: readonly SeriesEntrantDto[], names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (names.length === 0) return out;
  schedulableEntrants(entrants).forEach((e, i) => {
    const round = Math.floor(i / names.length);
    const pos = i % names.length;
    out[e.id] = names[round % 2 === 0 ? pos : names.length - 1 - pos];
  });
  return out;
}

/** Entrant -> division for the request: every approved entrant, null when there is a single division. */
export function divisionPayload(
  entrants: readonly SeriesEntrantDto[], names: readonly string[], assignment: Readonly<Record<string, string | null>>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const e of schedulableEntrants(entrants)) {
    const picked = assignment[e.id];
    out[e.id] = names.length > 1 && picked && names.includes(picked) ? picked : null;
  }
  return out;
}

/** Approved entrants left without a division while there are several (the review step warns). */
export function unassignedToDivision(entrants: readonly SeriesEntrantDto[], names: readonly string[], assignment: Readonly<Record<string, string | null>>): SeriesEntrantDto[] {
  if (names.length < 2) return [];
  return schedulableEntrants(entrants).filter((e) => !assignment[e.id] || !names.includes(assignment[e.id] as string));
}

export function closePayload(input: {
  entrants: readonly SeriesEntrantDto[];
  divisionNames: readonly string[];
  divisionOf: Readonly<Record<string, string | null>>;
  batches: readonly SeriesBatchDto[];
  batchModes: Readonly<Record<string, RoundRobinDivisionMode>>;
  matches: Readonly<Record<string, string[]>>;
}): CloseRegistrationInput {
  const multi = input.divisionNames.length > 1;
  const batches: NonNullable<CloseRegistrationInput['batches']> = {};
  for (const b of input.batches) {
    if (b.kind === 'round_robin') batches[b.id] = { divisions: multi ? (input.batchModes[b.id] ?? 'within') : 'none' };
  }
  return {
    divisions: divisionPayload(input.entrants, input.divisionNames, input.divisionOf),
    ...(Object.keys(batches).length > 0 ? { batches } : {}),
    ...(Object.keys(input.matches).length > 0 ? { matches: { ...input.matches } } : {}),
  };
}
