// Discriminated union types for the scoring system.
// Introduced in Phase 2 alongside the match_game_placements table.
// The legacy MatchResult type in shared/types.ts remains until Phase 8.

export type ScoringType = 'Normal' | 'FFA' | 'Position';

// ── Placement types ────────────────────────────────────────────────────────

export interface TeamPlacement {
  entityType: 'team';
  entityId: string;  // match_teams.id
  teamName: string;
  teamColor?: string;
  position: number;
  score?: number;
  isWinner: boolean;
}

export interface ParticipantPlacement {
  entityType: 'participant';
  entityId: string;  // match_participants.id
  username?: string;
  position?: number;
  score?: number;
  pointsAwarded?: number;
  isWinner: boolean;
}

// ── Discriminated match game results ──────────────────────────────────────

export interface NormalGameResult {
  type: 'Normal';
  matchGameId: string;
  matchId: string;
  placements: TeamPlacement[];
}

export interface FfaGameResult {
  type: 'FFA';
  matchGameId: string;
  matchId: string;
  placements: ParticipantPlacement[];
}

export interface PositionGameResult {
  type: 'Position';
  matchGameId: string;
  matchId: string;
  placements: ParticipantPlacement[];
}

export type GameResult = NormalGameResult | FfaGameResult | PositionGameResult;

// ── Type guards ────────────────────────────────────────────────────────────

export function isNormalResult(r: GameResult): r is NormalGameResult {
  return r.type === 'Normal';
}

export function isFfaResult(r: GameResult): r is FfaGameResult {
  return r.type === 'FFA';
}

export function isPositionResult(r: GameResult): r is PositionGameResult {
  return r.type === 'Position';
}

// ── API request body types ─────────────────────────────────────────────────
// Accepted by POST /api/matches/[matchId]/games/[gameId]/result

export interface SaveNormalResultBody {
  type: 'Normal';
  matchId: string;
  gameId: string;
  winner?: 'team1' | 'team2';      // legacy: still accepted
  winnerTeamId?: string;            // new: match_teams.id
  loserTeamId?: string;             // new: match_teams.id
  winnerScore?: number;
  loserScore?: number;
}

export interface SaveFfaResultBody {
  type: 'FFA';
  matchId: string;
  gameId: string;
  winnerParticipantId: string;
}

export interface SavePositionResultBody {
  type: 'Position';
  matchId: string;
  gameId: string;
  positionResults: Record<string, number>;  // participantId → 1-based position
}

export type SaveResultBody = SaveNormalResultBody | SaveFfaResultBody | SavePositionResultBody;
