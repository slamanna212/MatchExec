import { v4 as uuidv4 } from 'uuid';
import { getDbInstance } from './database-init';
import type { Database } from '../../lib/database/connection';
import { VoiceChannelService } from './voice-channel-service';
import { logger } from './logger';

interface GameMode {
  id: string;
  team_size: number | null;
}

interface GameMap {
  id: string;
  name: string;
  mode_id?: string;
}

interface TeamRecord {
  team_name: string;
}

interface TournamentRecord {
  id: string;
  game_id: string;
  game_mode_id: string;
  rounds_per_match: number;
  ruleset: string;
}

interface MatchResult {
  id: string;
  winner_team: string;
  team1_id: string;
  team2_id: string;
  bracket_type: string;
  match_order: number;
}

interface TeamMatchInfo {
  team1_id: string | null;
  team2_id: string | null;
  match_order: number;
}

interface RoundCompletionInfo {
  total_matches: number;
  completed_matches: number;
}

interface RoundStatsInfo {
  max_round: number;
  completed: number;
  total: number;
}

export interface BracketAssignment {
  position: number;
  teamId: string;
}

export interface TournamentMatchInfo {
  id: string;
  tournament_id: string;
  round: number;
  bracket_type: 'winners' | 'losers' | 'final';
  team1_id?: string;
  team2_id?: string;
  match_order: number;
  parent_match1_id?: string;
  parent_match2_id?: string;
}

export interface GeneratedMatch {
  id: string;
  name: string;
  description?: string;
  game_id: string;
  game_mode_id: string;
  map_id: string;
  maps?: string[]; // Array of map IDs for multiple rounds
  rounds_per_match: number;
  max_participants: number;
  status: string;
  match_type: string;
  tournament_id: string;
  tournament_round: number;
  tournament_bracket_type: string;
  rules?: string;
  scheduled_time?: Date;
  team1_name?: string;
  team2_name?: string;
  team1_id?: string; // Tournament team ID for red team
  team2_id?: string; // Tournament team ID for blue team
}

/**
 * Calculate the number of rounds needed for a tournament
 */
export function calculateTournamentRounds(teamCount: number, format: 'single-elimination' | 'double-elimination'): number {
  if (teamCount < 2) return 0;
  
  // For single elimination, rounds = log2(nextPowerOfTwo(teamCount))
  let nextPowerOfTwo = 1;
  while (nextPowerOfTwo < teamCount) {
    nextPowerOfTwo *= 2;
  }
  
  const singleEliminationRounds = Math.log2(nextPowerOfTwo);
  
  if (format === 'single-elimination') {
    return singleEliminationRounds;
  }
  
  // For double elimination, we need winner's bracket rounds + loser's bracket rounds + finals
  // Loser's bracket has roughly 2 * (winner's rounds - 1) rounds + finals
  const winnersBracketRounds = singleEliminationRounds;
  const losersBracketRounds = Math.max(1, (winnersBracketRounds - 1) * 2);
  return winnersBracketRounds + losersBracketRounds + 1; // +1 for grand final
}

/**
 * Calculate total number of matches needed for a tournament
 */
export function calculateTotalMatches(teamCount: number, format: 'single-elimination' | 'double-elimination'): number {
  if (teamCount < 2) return 0;
  
  if (format === 'single-elimination') {
    // Single elimination: n teams = n-1 matches
    return teamCount - 1;
  }
  
  // Double elimination: roughly 2n - 2 matches (can be 2n-1 with finals reset)
  return (teamCount * 2) - 2;
}

/**
 * Generate first round matches for single elimination tournament
 */
export async function generateSingleEliminationMatches(
  tournamentId: string,
  bracketAssignments: BracketAssignment[],
  gameId: string,
  roundsPerMatch: number,
  startTime?: Date
): Promise<GeneratedMatch[]> {
  const db = await getDbInstance();

  const tournament = await db.get<TournamentRecord>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  const { tournamentRuleset, tournamentDescription } = await fetchTournamentInfo(db, tournamentId);
  const { gameModes, gameMaps } = await fetchGameData(db, gameId, tournament.game_mode_id);

  const sortedAssignments = bracketAssignments.sort((a, b) => a.position - b.position);
  const tournamentMaps = filterTournamentMaps(gameMaps);

  return await generateMatchesFromPairings(
    db,
    sortedAssignments,
    tournamentId,
    gameId,
    roundsPerMatch,
    tournamentRuleset,
    tournamentDescription,
    gameModes,
    tournamentMaps,
    startTime
  );
}

async function fetchTournamentInfo(db: Database, tournamentId: string) {
  const tournament = await db.get('SELECT ruleset, description FROM tournaments WHERE id = ?', [tournamentId]) as { ruleset: string; description: string | null } | undefined;
  return {
    tournamentRuleset: tournament?.ruleset || 'casual',
    tournamentDescription: tournament?.description || null
  };
}

async function fetchGameData(db: Database, gameId: string, gameModeId: string) {
  // Special handling for Overwatch 2 team size options
  if (gameId === 'overwatch2' && gameModeId?.startsWith('ow2-')) {
    // OW2 team size is determined by the mode ID (ow2-5v5 or ow2-6v6)
    // Not used in current implementation but kept for future reference
    const _teamSize = gameModeId === 'ow2-5v5' ? 5 : 6;

    // Fetch all non-workshop modes
    const gameModes = await db.all(
      'SELECT * FROM game_modes WHERE game_id = ? AND id NOT LIKE "%workshop%"',
      [gameId]
    ) as GameMode[];

    // Fetch maps from all non-workshop modes
    const modeIds = gameModes.map(m => m.id);
    let gameMaps: GameMap[];
    if (modeIds.length > 0) {
      const placeholders = modeIds.map(() => '?').join(',');
      gameMaps = await db.all(
        `SELECT * FROM game_maps WHERE game_id = ? AND mode_id IN (${placeholders})`,
        [gameId, ...modeIds]
      ) as GameMap[];
    } else {
      gameMaps = [];
    }

    if (gameModes.length === 0 || gameMaps.length === 0) {
      throw new Error('No game modes or maps found for Overwatch 2');
    }

    return { gameModes, gameMaps };
  }

  // Regular handling for other games
  // Fetch the selected game mode to get its team size
  const selectedMode = await db.get('SELECT * FROM game_modes WHERE id = ?', [gameModeId]) as GameMode | undefined;

  if (!selectedMode) {
    throw new Error(`Game mode ${gameModeId} not found`);
  }

  // Fetch all modes with the same team size
  const gameModes = await db.all(
    'SELECT * FROM game_modes WHERE game_id = ? AND team_size = ? AND id NOT LIKE "%workshop%" AND id NOT LIKE "%custom%"',
    [gameId, selectedMode.team_size]
  ) as GameMode[];

  // Get all mode IDs for map filtering
  const modeIds = gameModes.map(m => m.id);

  // Fetch maps from all modes with the same team size
  let gameMaps: GameMap[];
  if (modeIds.length > 0) {
    const placeholders = modeIds.map(() => '?').join(',');
    gameMaps = await db.all(
      `SELECT * FROM game_maps WHERE game_id = ? AND mode_id IN (${placeholders})`,
      [gameId, ...modeIds]
    ) as GameMap[];
  } else {
    gameMaps = [];
  }

  if (gameModes.length === 0 || gameMaps.length === 0) {
    throw new Error('No game modes or maps found for this game and team size');
  }

  return { gameModes, gameMaps };
}

function filterTournamentMaps(gameMaps: GameMap[]): GameMap[] {
  return gameMaps.filter(m => {
    const notCustomOrWorkshop = !m.id.toLowerCase().includes('custom') &&
                               !m.id.toLowerCase().includes('workshop') &&
                               !m.name.toLowerCase().includes('custom') &&
                               !m.name.toLowerCase().includes('workshop');
    return notCustomOrWorkshop;
  });
}

async function generateMatchesFromPairings(
  db: Database,
  sortedAssignments: BracketAssignment[],
  tournamentId: string,
  gameId: string,
  roundsPerMatch: number,
  tournamentRuleset: string,
  tournamentDescription: string | null,
  gameModes: GameMode[],
  tournamentMaps: GameMap[],
  startTime?: Date
): Promise<GeneratedMatch[]> {
  const matches: GeneratedMatch[] = [];

  for (let i = 0; i < sortedAssignments.length; i += 2) {
    const team1Assignment = sortedAssignments[i];
    const team2Assignment = sortedAssignments[i + 1];

    if (!team2Assignment) {
      continue; // Odd number of teams - give bye
    }

    const matchId = uuidv4();

    const team1 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team1Assignment.teamId]) as TeamRecord | undefined;
    const team2 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team2Assignment.teamId]) as TeamRecord | undefined;

    const { selectedMaps, selectedModes } = selectMapsForMatch(roundsPerMatch, gameModes, tournamentMaps);
    const primaryMode = selectedModes[0] ? gameModes.find(m => m.id === selectedModes[0]) : gameModes[0];

    const generatedMatch: GeneratedMatch = createMatchRecord(
      matchId,
      team1,
      team2,
      tournamentId,
      gameId,
      roundsPerMatch,
      tournamentRuleset,
      tournamentDescription,
      selectedMaps,
      primaryMode!,
      team1Assignment,
      team2Assignment,
      startTime
    );

    matches.push(generatedMatch);
  }

  return matches;
}

function selectMapsForMatch(
  roundsPerMatch: number,
  gameModes: GameMode[],
  tournamentMaps: GameMap[]
): { selectedMaps: string[]; selectedModes: string[] } {
  const selectedMaps: string[] = [];
  const selectedModes: string[] = [];

  for (let round = 0; round < roundsPerMatch; round++) {
    const { mapId, modeId } = selectMapForRound(selectedMaps, gameModes, tournamentMaps, round);
    selectedMaps.push(mapId);
    selectedModes.push(modeId);
  }

  return { selectedMaps, selectedModes };
}

function selectMapForRound(
  selectedMaps: string[],
  gameModes: GameMode[],
  tournamentMaps: GameMap[],
  round: number
): { mapId: string; modeId: string } {
  const shuffledModes = shuffleArray([...gameModes]);

  for (const mode of shuffledModes) {
    const mapsForMode = tournamentMaps.filter(m => m.mode_id === mode.id);
    const unusedMaps = mapsForMode.filter(m => !selectedMaps.includes(m.id));

    if (unusedMaps.length > 0) {
      const randomMap = unusedMaps[Math.floor(Math.random() * unusedMaps.length)];
      return { mapId: randomMap.id, modeId: mode.id };
    }
  }

  // Fallback: use any available map
  const allAvailableMaps = tournamentMaps.filter(m => !selectedMaps.includes(m.id));
  if (allAvailableMaps.length === 0) {
    throw new Error(`All available maps have been used. Cannot avoid duplicate maps in round ${round + 1}`);
  }

  const randomMap = allAvailableMaps[Math.floor(Math.random() * allAvailableMaps.length)];
  const mapMode = gameModes.find(m => m.id === randomMap.mode_id) || gameModes[0];

  return { mapId: randomMap.id, modeId: mapMode.id };
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function createMatchRecord(
  matchId: string,
  team1: TeamRecord | undefined,
  team2: TeamRecord | undefined,
  tournamentId: string,
  gameId: string,
  roundsPerMatch: number,
  tournamentRuleset: string,
  tournamentDescription: string | null,
  selectedMaps: string[],
  primaryMode: GameMode,
  team1Assignment: BracketAssignment,
  team2Assignment: BracketAssignment,
  startTime?: Date
): GeneratedMatch {
  return {
    id: matchId,
    name: `${team1?.team_name || 'Team 1'} vs ${team2?.team_name || 'Team 2'}`,
    description: tournamentDescription || undefined,
    game_id: gameId,
    game_mode_id: primaryMode.id,
    map_id: selectedMaps[0],
    maps: selectedMaps,
    rounds_per_match: roundsPerMatch,
    max_participants: 12,
    status: 'assign',
    match_type: 'tournament',
    tournament_id: tournamentId,
    tournament_round: 1,
    tournament_bracket_type: 'winners',
    rules: tournamentRuleset,
    scheduled_time: startTime,
    team1_name: team1?.team_name,
    team2_name: team2?.team_name,
    team1_id: team1Assignment.teamId,
    team2_id: team2Assignment.teamId
  };
}

/**
 * Generate subsequent round matches based on previous round results
 */
export async function generateNextRoundMatches(
  tournamentId: string,
  currentRound: number,
  bracketType: 'winners' | 'losers' | 'final',
  _format: 'single-elimination' | 'double-elimination'
): Promise<GeneratedMatch[]> {
  const db = await getDbInstance();

  const tournament = await fetchTournamentForNextRound(db, tournamentId);
  const previousRoundMatches = await fetchPreviousRoundMatches(db, tournamentId, currentRound, bracketType);

  if (shouldEndTournament(previousRoundMatches, bracketType)) {
    return [];
  }

  const { gameModes, gameMaps } = await fetchGameData(db, tournament.game_id, tournament.game_mode_id);
  const tournamentMaps = filterTournamentMaps(gameMaps);

  return await generateNextRoundMatchesFromWinners(
    db,
    previousRoundMatches,
    tournament,
    tournamentId,
    currentRound,
    bracketType,
    gameModes,
    tournamentMaps
  );
}

async function fetchTournamentForNextRound(db: Database, tournamentId: string) {
  const tournament = await db.get(`
    SELECT t.*, g.id as game_id
    FROM tournaments t
    JOIN games g ON t.game_id = g.id
    WHERE t.id = ?
  `, [tournamentId]) as (TournamentRecord & { description?: string | null }) | undefined;

  if (!tournament) {
    throw new Error('Tournament not found');
  }

  return tournament;
}

async function fetchPreviousRoundMatches(
  db: Database,
  tournamentId: string,
  currentRound: number,
  bracketType: string
): Promise<MatchResult[]> {
  const matches = await db.all(`
    SELECT m.*, tm.team1_id, tm.team2_id, tm.bracket_type, tm.match_order
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ?
      AND tm.round = ?
      AND tm.bracket_type = ?
      AND m.status = 'complete'
      AND m.winner_team IS NOT NULL
    ORDER BY tm.match_order
  `, [tournamentId, currentRound, bracketType]) as MatchResult[];

  if (matches.length === 0) {
    throw new Error('No completed matches found for previous round');
  }

  return matches;
}

function shouldEndTournament(previousRoundMatches: MatchResult[], bracketType: string): boolean {
  return previousRoundMatches.length === 1 && bracketType === 'winners';
}

async function generateNextRoundMatchesFromWinners(
  db: Database,
  previousRoundMatches: MatchResult[],
  tournament: TournamentRecord & { description?: string | null },
  tournamentId: string,
  currentRound: number,
  bracketType: 'winners' | 'losers' | 'final',
  gameModes: GameMode[],
  tournamentMaps: GameMap[]
): Promise<GeneratedMatch[]> {
  const matches: GeneratedMatch[] = [];
  const nextRound = currentRound + 1;

  for (let i = 0; i < previousRoundMatches.length; i += 2) {
    const match1 = previousRoundMatches[i];
    const match2 = previousRoundMatches[i + 1];

    if (!match2) {
      continue; // Odd number - bye
    }

    const matchId = uuidv4();

    const winner1TeamId = match1.winner_team;
    const winner2TeamId = match2.winner_team;

    const team1 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [winner1TeamId]) as TeamRecord | undefined;
    const team2 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [winner2TeamId]) as TeamRecord | undefined;

    const { selectedMaps, selectedModes } = selectMapsForMatch(tournament.rounds_per_match, gameModes, tournamentMaps);
    const primaryMode = selectedModes[0] ? gameModes.find(m => m.id === selectedModes[0]) : gameModes[0];

    const generatedMatch: GeneratedMatch = {
      id: matchId,
      name: `${team1?.team_name || 'Winner 1'} vs ${team2?.team_name || 'Winner 2'}`,
      description: tournament.description || undefined,
      game_id: tournament.game_id,
      game_mode_id: primaryMode!.id,
      map_id: selectedMaps[0],
      maps: selectedMaps,
      rounds_per_match: tournament.rounds_per_match,
      max_participants: 12,
      status: 'assign',
      match_type: 'tournament',
      tournament_id: tournamentId,
      tournament_round: nextRound,
      tournament_bracket_type: bracketType,
      rules: tournament.ruleset,
      team1_name: team1?.team_name,
      team2_name: team2?.team_name,
      team1_id: winner1TeamId,
      team2_id: winner2TeamId
    };

    matches.push(generatedMatch);
  }

  return matches;
}

/**
 * Generate first round matches for double elimination tournament
 * This is the same as single elimination for the first round (winners bracket)
 */
export async function generateDoubleEliminationMatches(
  tournamentId: string,
  bracketAssignments: BracketAssignment[],
  gameId: string,
  roundsPerMatch: number,
  _startTime?: Date
): Promise<GeneratedMatch[]> {
  // Double elimination first round is identical to single elimination
  // Both create the initial winners bracket matches
  return generateSingleEliminationMatches(
    tournamentId,
    bracketAssignments,
    gameId,
    roundsPerMatch,
    _startTime
  );
}

/**
 * Generate loser's bracket matches when teams are eliminated from winner's bracket
 */
export async function generateLosersBracketMatches(
  tournamentId: string,
  eliminatedFromWinnersRound: number,
  eliminatedTeamIds: string[]
): Promise<GeneratedMatch[]> {
  if (eliminatedTeamIds.length === 0) {
    return [];
  }

  const db = await getDbInstance();

  const tournament = await fetchTournamentForNextRound(db, tournamentId);
  const { gameModes, gameMaps } = await fetchGameData(db, tournament.game_id, tournament.game_mode_id);
  const tournamentMaps = filterTournamentMaps(gameMaps);

  const losersBracketRound = calculateLosersBracketRound(eliminatedFromWinnersRound);
  const allTeamsInRound = await mergeTeamsForLosersBracket(db, tournamentId, losersBracketRound, eliminatedTeamIds);

  return await generateLosersBracketMatchesFromTeams(
    db,
    allTeamsInRound,
    tournament,
    tournamentId,
    losersBracketRound,
    gameModes,
    tournamentMaps
  );
}

function calculateLosersBracketRound(eliminatedFromWinnersRound: number): number {
  // In double elimination, teams from WB round N go to LB round (2*N-1) if N=1, or (2*N-2) if N>1
  return eliminatedFromWinnersRound === 1 ? 1 : (eliminatedFromWinnersRound * 2) - 2;
}

async function mergeTeamsForLosersBracket(
  db: Database,
  tournamentId: string,
  losersBracketRound: number,
  eliminatedTeamIds: string[]
): Promise<string[]> {
  const existingTeamsInRound = await db.all(`
    SELECT tm.team1_id, tm.team2_id, tm.match_order
    FROM tournament_matches tm
    JOIN matches m ON tm.match_id = m.id
    WHERE tm.tournament_id = ? AND tm.bracket_type = 'losers' AND tm.round = ?
    ORDER BY tm.match_order
  `, [tournamentId, losersBracketRound]) as TeamMatchInfo[];

  const allTeamsInRound = [...eliminatedTeamIds];
  existingTeamsInRound.forEach(match => {
    if (match.team1_id && !allTeamsInRound.includes(match.team1_id)) {
      allTeamsInRound.push(match.team1_id);
    }
    if (match.team2_id && !allTeamsInRound.includes(match.team2_id)) {
      allTeamsInRound.push(match.team2_id);
    }
  });

  return allTeamsInRound;
}

async function generateLosersBracketMatchesFromTeams(
  db: Database,
  allTeamsInRound: string[],
  tournament: TournamentRecord & { description?: string | null },
  tournamentId: string,
  losersBracketRound: number,
  gameModes: GameMode[],
  tournamentMaps: GameMap[]
): Promise<GeneratedMatch[]> {
  const matches: GeneratedMatch[] = [];

  for (let i = 0; i < allTeamsInRound.length; i += 2) {
    const team1Id = allTeamsInRound[i];
    const team2Id = allTeamsInRound[i + 1];

    if (!team2Id) {
      continue; // Odd number - bye
    }

    const matchId = uuidv4();

    const team1 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team1Id]) as TeamRecord | undefined;
    const team2 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team2Id]) as TeamRecord | undefined;

    const { selectedMaps, selectedModes } = selectMapsForMatch(tournament.rounds_per_match, gameModes, tournamentMaps);
    const primaryMode = selectedModes[0] ? gameModes.find(m => m.id === selectedModes[0]) : gameModes[0];

    const generatedMatch: GeneratedMatch = {
      id: matchId,
      name: `${team1?.team_name || 'Team 1'} vs ${team2?.team_name || 'Team 2'}`,
      description: tournament.description || undefined,
      game_id: tournament.game_id,
      game_mode_id: primaryMode!.id,
      map_id: selectedMaps[0],
      maps: selectedMaps,
      rounds_per_match: tournament.rounds_per_match,
      max_participants: 12,
      status: 'assign',
      match_type: 'tournament',
      tournament_id: tournamentId,
      tournament_round: losersBracketRound,
      tournament_bracket_type: 'losers',
      team1_name: team1?.team_name,
      team2_name: team2?.team_name,
      team1_id: team1Id,
      team2_id: team2Id
    };

    matches.push(generatedMatch);
  }

  return matches;
}

/**
 * Generate grand finals match (winner's bracket winner vs loser's bracket winner)
 */
export async function generateGrandFinalsMatch(
  tournamentId: string,
  winnersBracketWinnerId: string,
  losersBracketWinnerId: string
): Promise<GeneratedMatch[]> {
  const db = await getDbInstance();

  // Get tournament info
  const tournament = await db.get(`
    SELECT t.*, g.id as game_id
    FROM tournaments t
    JOIN games g ON t.game_id = g.id
    WHERE t.id = ?
  `, [tournamentId]) as (TournamentRecord & { description?: string | null }) | undefined;

  if (!tournament) {
    throw new Error('Tournament not found');
  }

  // Get game modes and maps
  const gameModes = await db.all('SELECT * FROM game_modes WHERE game_id = ?', [tournament.game_id]) as GameMode[];
  const gameMaps = await db.all('SELECT * FROM game_maps WHERE game_id = ?', [tournament.game_id]) as GameMap[];

  // Get team names
  const wbTeam = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [winnersBracketWinnerId]) as TeamRecord | undefined;
  const lbTeam = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [losersBracketWinnerId]) as TeamRecord | undefined;

  const matchId = uuidv4();
  const tournamentMaps = filterTournamentMaps(gameMaps);

  // Select maps for each round
  const selectedMaps: string[] = [];
  const selectedModes: string[] = [];

  for (let round = 0; round < tournament.rounds_per_match; round++) {
    const { mapId, modeId } = selectMapForRound(selectedMaps, gameModes, tournamentMaps, round);
    selectedMaps.push(mapId);
    selectedModes.push(modeId);
  }

  // Use the first selected mode for compatibility (legacy field)
  const primaryMode = selectedModes[0] ? gameModes.find(m => m.id === selectedModes[0]) : gameModes[0];

  // Create grand finals match
  const grandFinalsMatch: GeneratedMatch = {
    id: matchId,
    name: `Grand Finals: ${wbTeam?.team_name || 'WB Winner'} vs ${lbTeam?.team_name || 'LB Winner'}`,
    description: tournament.description || undefined,
    game_id: tournament.game_id,
    game_mode_id: primaryMode!.id,
    map_id: selectedMaps[0],
    maps: selectedMaps,
    rounds_per_match: tournament.rounds_per_match,
    max_participants: 12,
    status: 'assign',
    match_type: 'tournament',
    tournament_id: tournamentId,
    tournament_round: 1,
    tournament_bracket_type: 'final',
    team1_name: wbTeam?.team_name,
    team2_name: lbTeam?.team_name,
    team1_id: winnersBracketWinnerId,
    team2_id: losersBracketWinnerId
  };

  return [grandFinalsMatch];
}

/**
 * Insert a single match into the database
 */
async function insertMatch(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  match: GeneratedMatch
): Promise<void> {
  const farFutureDate = new Date('2099-12-31T23:59:59.999Z');
  const scheduledDateTime = match.scheduled_time?.toISOString() || farFutureDate.toISOString();
  const scheduledDate = scheduledDateTime.split('T')[0];

  await db.run(`
    INSERT INTO matches (
      id, name, description, game_id, mode_id, map_id, maps, rounds,
      max_participants, status, tournament_id,
      tournament_round, tournament_bracket_type, start_date, start_time,
      team1_name, team2_name, red_team_id, blue_team_id, announcements, rules, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [
    match.id, match.name, match.description || null, match.game_id, match.game_mode_id, match.map_id,
    match.maps ? JSON.stringify(match.maps) : null, match.rounds_per_match,
    match.max_participants, match.status, match.tournament_id,
    match.tournament_round, match.tournament_bracket_type, scheduledDate,
    scheduledDateTime, match.team1_name, match.team2_name,
    match.team1_id, match.team2_id, 1, match.rules || 'casual'
  ]);
}

/**
 * Add team members as match participants
 */
async function addTeamParticipants(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string,
  teamId: string,
  teamColor: 'red' | 'blue'
): Promise<void> {
  const teamMembers = await db.all(`
    SELECT user_id, discord_user_id, username
    FROM tournament_team_members
    WHERE team_id = ?
  `, [teamId]) as { user_id: string; discord_user_id: string | null; username: string }[];

  for (const member of teamMembers) {
    const participantId = `participant_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    await db.run(`
      INSERT INTO match_participants (
        id, match_id, user_id, discord_user_id, username, team, team_assignment, joined_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [participantId, matchId, member.user_id, member.discord_user_id, member.username, teamColor, teamColor]);
  }
}

/**
 * Save generated matches to database
 */
export async function saveGeneratedMatches(
  matches: GeneratedMatch[],
  tournamentMatches: TournamentMatchInfo[]
): Promise<void> {
  const db = await getDbInstance();

  await db.run('BEGIN TRANSACTION');

  try {
    // Insert matches
    for (const match of matches) {
      await insertMatch(db, match);
    }

    // Insert tournament match relationships
    for (const tournamentMatch of tournamentMatches) {
      await db.run(`
        INSERT INTO tournament_matches (
          match_id, tournament_id, round, bracket_type, team1_id, team2_id,
          match_order, parent_match1_id, parent_match2_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        tournamentMatch.id, tournamentMatch.tournament_id, tournamentMatch.round,
        tournamentMatch.bracket_type, tournamentMatch.team1_id, tournamentMatch.team2_id,
        tournamentMatch.match_order, tournamentMatch.parent_match1_id, tournamentMatch.parent_match2_id
      ]);

      // Add team members as match participants
      if (tournamentMatch.team1_id) {
        await addTeamParticipants(db, tournamentMatch.id, tournamentMatch.team1_id, 'red');
      }

      if (tournamentMatch.team2_id) {
        await addTeamParticipants(db, tournamentMatch.id, tournamentMatch.team2_id, 'blue');
      }
    }

    // Initialize match games for each match
    const { initializeMatchGames } = await import('./scoring-functions');
    for (const match of matches) {
      if (match.maps && match.maps.length > 0) {
        await initializeMatchGames(match.id);
      }
    }

    await db.run('COMMIT');

    // Create voice channels for all tournament matches
    for (const match of matches) {
      try {
        await VoiceChannelService.setupMatchVoiceChannels(match.id);
      } catch (error) {
        // Log error but don't fail the entire operation
        logger.error(`Failed to create voice channels for tournament match ${match.id}:`, error);
      }
    }
  } catch (error) {
    await db.run('ROLLBACK');
    throw error;
  }
}

/**
 * Check if a tournament round is complete (all matches finished)
 */
export async function isRoundComplete(
  tournamentId: string,
  round: number,
  bracketType: 'winners' | 'losers' | 'final'
): Promise<boolean> {
  const db = await getDbInstance();

  const result = await db.get(`
    SELECT
      COUNT(*) as total_matches,
      COUNT(CASE WHEN m.status = 'complete' THEN 1 END) as completed_matches
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ? AND tm.round = ? AND tm.bracket_type = ?
  `, [tournamentId, round, bracketType]) as RoundCompletionInfo;

  return result.total_matches > 0 && result.total_matches === result.completed_matches;
}

/**
 * Get current round information for a tournament
 */
export async function getCurrentRoundInfo(tournamentId: string): Promise<{
  maxWinnersRound: number;
  maxLosersRound: number;
  winnersComplete: boolean;
  losersComplete: boolean;
}> {
  const db = await getDbInstance();

  const winnersInfo = await db.get(`
    SELECT
      COALESCE(MAX(tm.round), 0) as max_round,
      COUNT(CASE WHEN m.status = 'complete' THEN 1 END) as completed,
      COUNT(*) as total
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ? AND tm.bracket_type = 'winners'
  `, [tournamentId]) as RoundStatsInfo;

  const losersInfo = await db.get(`
    SELECT
      COALESCE(MAX(tm.round), 0) as max_round,
      COUNT(CASE WHEN m.status = 'complete' THEN 1 END) as completed,
      COUNT(*) as total
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ? AND tm.bracket_type = 'losers'
  `, [tournamentId]) as RoundStatsInfo;

  return {
    maxWinnersRound: winnersInfo.max_round || 0,
    maxLosersRound: losersInfo.max_round || 0,
    winnersComplete: winnersInfo.total > 0 && winnersInfo.completed === winnersInfo.total,
    losersComplete: losersInfo.total > 0 && losersInfo.completed === losersInfo.total
  };
}

/**
 * Check if a bracket is ready for grand finals (only one team remaining)
 * For winners bracket: Check if the highest round has exactly 1 completed match
 * For losers bracket: Check if the highest round has exactly 1 completed match
 */
export async function isBracketReadyForFinals(
  tournamentId: string,
  bracketType: 'winners' | 'losers'
): Promise<boolean> {
  const db = await getDbInstance();

  // Get the highest round number for this bracket
  const maxRoundInfo = await db.get(`
    SELECT MAX(tm.round) as max_round
    FROM tournament_matches tm
    WHERE tm.tournament_id = ? AND tm.bracket_type = ?
  `, [tournamentId, bracketType]) as { max_round: number | null };

  if (!maxRoundInfo || maxRoundInfo.max_round === null) {
    return false;
  }

  // Check if the highest round has exactly 1 completed match
  const highestRoundMatches = await db.get(`
    SELECT
      COUNT(*) as total_matches,
      COUNT(CASE WHEN m.status = 'complete' THEN 1 END) as completed_matches
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ?
      AND tm.bracket_type = ?
      AND tm.round = ?
  `, [tournamentId, bracketType, maxRoundInfo.max_round]) as { total_matches: number; completed_matches: number };

  // Ready for finals if there's exactly 1 match in the highest round and it's complete
  return highestRoundMatches.total_matches === 1 && highestRoundMatches.completed_matches === 1;
}

/**
 * Get the winner of a bracket (the last team standing)
 */
export async function getBracketWinner(
  tournamentId: string,
  bracketType: 'winners' | 'losers'
): Promise<string | null> {
  const db = await getDbInstance();

  const result = await db.get(`
    SELECT m.winner_team
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ?
      AND tm.bracket_type = ?
      AND m.status = 'complete'
      AND m.winner_team IS NOT NULL
    ORDER BY tm.round DESC, tm.match_order DESC
    LIMIT 1
  `, [tournamentId, bracketType]) as { winner_team: string } | undefined;

  return result?.winner_team || null;
}