/**
 * Pure bracket math: round counts, pairing, map selection and match naming. No I/O, so everything here is unit-testable
 * without a database. Randomness is injectable (`rng`) so map selection can be tested deterministically.
 */

export type Rng = () => number;

export type BracketFormat = 'single-elimination' | 'double-elimination';

export interface GameModeLite {
  id: string;
  team_size: number | null;
}

export interface GameMapLite {
  id: string;
  name: string;
  mode_id?: string | null;
}

/** Number of rounds a tournament needs. */
export function calculateTournamentRounds(teamCount: number, format: BracketFormat): number {
  if (teamCount < 2) return 0;

  // Single elimination: rounds = log2(next power of two >= teamCount)
  let nextPowerOfTwo = 1;
  while (nextPowerOfTwo < teamCount) nextPowerOfTwo *= 2;
  const singleEliminationRounds = Math.log2(nextPowerOfTwo);
  if (format === 'single-elimination') return singleEliminationRounds;

  // Double elimination: winners rounds + losers rounds (about 2 * (winners - 1)) + the grand final
  const winnersBracketRounds = singleEliminationRounds;
  const losersBracketRounds = Math.max(1, (winnersBracketRounds - 1) * 2);
  return winnersBracketRounds + losersBracketRounds + 1;
}

/** Total number of matches a tournament needs. */
export function calculateTotalMatches(teamCount: number, format: BracketFormat): number {
  if (teamCount < 2) return 0;
  if (format === 'single-elimination') return teamCount - 1; // n teams = n-1 matches
  return teamCount * 2 - 2; // double elimination: roughly 2n - 2 (2n - 1 with a final reset)
}

/** Pair a list front to back. An odd team out is returned as `bye` (it sits the round out). */
export function pairTeams<T>(teams: T[]): { pairs: Array<[T, T]>; bye: T | null } {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i + 1 < teams.length; i += 2) pairs.push([teams[i], teams[i + 1]]);
  return { pairs, bye: teams.length % 2 === 1 ? teams[teams.length - 1] : null };
}

/** Maps that may be used in a tournament (no custom / workshop maps). */
export function filterTournamentMaps<M extends GameMapLite>(gameMaps: M[]): M[] {
  return gameMaps.filter((m) => {
    const id = m.id.toLowerCase();
    const name = m.name.toLowerCase();
    return !id.includes('custom') && !id.includes('workshop') && !name.includes('custom') && !name.includes('workshop');
  });
}

export function shuffleArray<T>(array: T[], rng: Rng = Math.random): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function selectMapForRound<M extends GameMapLite, G extends GameModeLite>(
  selectedMaps: string[],
  gameModes: G[],
  tournamentMaps: M[],
  round: number,
  rng: Rng = Math.random,
): { mapId: string; modeId: string } {
  for (const mode of shuffleArray([...gameModes], rng)) {
    const unusedMaps = tournamentMaps.filter((m) => m.mode_id === mode.id && !selectedMaps.includes(m.id));
    if (unusedMaps.length > 0) {
      return { mapId: unusedMaps[Math.floor(rng() * unusedMaps.length)].id, modeId: mode.id };
    }
  }

  // Fallback: any map not used yet
  const available = tournamentMaps.filter((m) => !selectedMaps.includes(m.id));
  if (available.length === 0) {
    throw new Error(`All available maps have been used. Cannot avoid duplicate maps in round ${round + 1}`);
  }
  const randomMap = available[Math.floor(rng() * available.length)];
  const mapMode = gameModes.find((m) => m.id === randomMap.mode_id) ?? gameModes[0];
  return { mapId: randomMap.id, modeId: mapMode.id };
}

/** Pick `roundsPerMatch` distinct maps (and their modes) for one match. */
export function selectMapsForMatch<M extends GameMapLite, G extends GameModeLite>(
  roundsPerMatch: number,
  gameModes: G[],
  tournamentMaps: M[],
  rng: Rng = Math.random,
): { selectedMaps: string[]; selectedModes: string[]; primaryMode: G } {
  const selectedMaps: string[] = [];
  const selectedModes: string[] = [];
  for (let round = 0; round < roundsPerMatch; round++) {
    const { mapId, modeId } = selectMapForRound(selectedMaps, gameModes, tournamentMaps, round, rng);
    selectedMaps.push(mapId);
    selectedModes.push(modeId);
  }
  const primaryMode = (selectedModes[0] ? gameModes.find((m) => m.id === selectedModes[0]) : undefined) ?? gameModes[0];
  return { selectedMaps, selectedModes, primaryMode };
}

export function matchTitle(team1Name: string | undefined, team2Name: string | undefined, fallback: [string, string] = ['Team 1', 'Team 2']): string {
  return `${team1Name || fallback[0]} vs ${team2Name || fallback[1]}`;
}

/** Display name for a double-elimination planned match (grand finals get a prefix). */
export function plannedMatchName(bracket: 'winners' | 'losers' | 'final', reset: boolean | undefined, names: string): string {
  if (bracket === 'final') return `${reset ? 'Grand Finals Reset' : 'Grand Finals'}: ${names}`;
  return names;
}
