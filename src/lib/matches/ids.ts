/** Id generators for the matches domain (formats are part of the data: other code parses `${matchId}_game_N`). */
import { randomBytes } from 'node:crypto';

export function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomBytes(5).toString('hex')}`;
}

export const newMatchId = (): string => genId('match');
export const newPlacementId = (): string => genId('mgp');
/** The convention initializeMatchGames / ensureMatchGameExists share. */
export const matchGameIdFor = (matchId: string, round: number): string => `${matchId}_game_${round}`;
