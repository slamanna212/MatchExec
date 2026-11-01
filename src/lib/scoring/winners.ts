/** Pure winner / label helpers shared by the scoring code. */

/** Legacy 'team1'/'team2' label for a match_teams.team_order; 'team' for a 3rd+ team. */
export function teamLabelForOrder(order: number | null | undefined): 'team1' | 'team2' | 'team' {
  if (order === 0) return 'team1';
  if (order === 1) return 'team2';
  return 'team';
}

/** Highest total wins; a tie for the top (or a top total of 0 when `requirePositive`) yields no winner (null). */
export function pickTopEntry<T>(entries: T[], score: (entry: T) => number, requirePositive = false): T | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => score(b) - score(a));
  if (sorted.length > 1 && score(sorted[0]) === score(sorted[1])) return null;
  if (requirePositive && score(sorted[0]) <= 0) return null;
  return sorted[0];
}

/** Winner of a team set by win count: id of the sole leader, or null for a tie / zero wins. */
export function winnerByWins(teams: Array<{ teamId: string; wins: number }>): string | null {
  return pickTopEntry(teams, (t) => t.wins, true)?.teamId ?? null;
}

export type WinnerEntityType = 'tournament_team' | 'match_team' | 'participant';

/**
 * `matches.winner_team` stores one of THREE ID spaces:
 *  - 'participant':     FFA / Position matches       -> match_participants.id
 *  - 'tournament_team': tournament matches (Normal)  -> tournament_teams.id
 *  - 'match_team':      standalone Normal matches    -> match_teams.id
 */
export function winnerEntityTypeFor(match: { tournament_id: string | null; scoring_type: string | null }): Exclude<WinnerEntityType, never> {
  if (match.scoring_type === 'FFA' || match.scoring_type === 'Position') return 'participant';
  if (match.tournament_id) return 'tournament_team';
  return 'match_team';
}
