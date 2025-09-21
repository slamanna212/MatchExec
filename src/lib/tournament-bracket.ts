import { v4 as uuidv4 } from 'uuid';
import { getDbInstance } from './database-init';

interface GameMode {
  id: string;
}

interface GameMap {
  id: string;
  mode_id?: string;
}

interface TeamRecord {
  team_name: string;
}

interface TournamentRecord {
  id: string;
  game_id: string;
  rounds_per_match: number;
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
  game_id: string;
  game_mode_id: string;
  map_id: string;
  rounds_per_match: number;
  max_participants: number;
  status: string;
  match_type: string;
  tournament_id: string;
  tournament_round: number;
  tournament_bracket_type: string;
  scheduled_time?: Date;
  team1_name?: string;
  team2_name?: string;
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
  
  // Get game modes and maps for the game
  const gameModes = await db.all('SELECT * FROM game_modes WHERE game_id = ?', [gameId]) as GameMode[];
  const gameMaps = await db.all('SELECT * FROM game_maps WHERE game_id = ?', [gameId]) as GameMap[];
  
  if (gameModes.length === 0 || gameMaps.length === 0) {
    throw new Error('No game modes or maps found for this game');
  }
  
  // Sort bracket assignments by position to ensure proper pairing
  const sortedAssignments = bracketAssignments.sort((a, b) => a.position - b.position);
  
  const matches: GeneratedMatch[] = [];
  const tournamentMatches: TournamentMatchInfo[] = [];
  
  // Pair teams for first round (position 0 vs 1, 2 vs 3, etc.)
  for (let i = 0; i < sortedAssignments.length; i += 2) {
    const team1Assignment = sortedAssignments[i];
    const team2Assignment = sortedAssignments[i + 1];
    
    if (!team2Assignment) {
      // Odd number of teams - give bye to last team (handle later in progression)
      continue;
    }
    
    const matchId = uuidv4();
    const matchOrder = Math.floor(i / 2) + 1;
    
    // Get team names
    const team1 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team1Assignment.teamId]) as TeamRecord | undefined;
    const team2 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team2Assignment.teamId]) as TeamRecord | undefined;
    
    // Randomly select game mode and map
    const randomMode = gameModes[Math.floor(Math.random() * gameModes.length)];
    const availableMaps = gameMaps.filter(m => !m.mode_id || m.mode_id === randomMode.id);
    const randomMap = availableMaps[Math.floor(Math.random() * availableMaps.length)];
    
    // Create match record
    const generatedMatch: GeneratedMatch = {
      id: matchId,
      name: `${team1?.team_name || 'Team 1'} vs ${team2?.team_name || 'Team 2'} - Round 1`,
      game_id: gameId,
      game_mode_id: randomMode.id,
      map_id: randomMap.id,
      rounds_per_match: roundsPerMatch,
      max_participants: 12, // Default for team matches
      status: 'created',
      match_type: 'tournament',
      tournament_id: tournamentId,
      tournament_round: 1,
      tournament_bracket_type: 'winners',
      scheduled_time: startTime,
      team1_name: team1?.team_name,
      team2_name: team2?.team_name
    };
    
    matches.push(generatedMatch);
    
    // Create tournament match info
    const tournamentMatch: TournamentMatchInfo = {
      id: matchId,
      tournament_id: tournamentId,
      round: 1,
      bracket_type: 'winners',
      team1_id: team1Assignment.teamId,
      team2_id: team2Assignment.teamId,
      match_order: matchOrder
    };
    
    tournamentMatches.push(tournamentMatch);
  }
  
  return matches;
}

/**
 * Generate subsequent round matches based on previous round results
 */
export async function generateNextRoundMatches(
  tournamentId: string,
  currentRound: number,
  bracketType: 'winners' | 'losers' | 'final',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  format: 'single-elimination' | 'double-elimination'
): Promise<GeneratedMatch[]> {
  const db = await getDbInstance();
  
  // Get tournament info
  const tournament = await db.get(`
    SELECT t.*, g.id as game_id 
    FROM tournaments t 
    JOIN games g ON t.game_id = g.id 
    WHERE t.id = ?
  `, [tournamentId]) as TournamentRecord | undefined;
  
  if (!tournament) {
    throw new Error('Tournament not found');
  }
  
  // Get completed matches from previous round
  const previousRoundMatches = await db.all(`
    SELECT m.*, tm.team1_id, tm.team2_id, tm.bracket_type, tm.match_order
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ? 
      AND tm.round = ? 
      AND tm.bracket_type = ?
      AND m.status = 'completed'
      AND m.winner_team IS NOT NULL
    ORDER BY tm.match_order
  `, [tournamentId, currentRound, bracketType]) as MatchResult[];
  
  if (previousRoundMatches.length === 0) {
    throw new Error('No completed matches found for previous round');
  }
  
  // If only one match remains, this might be the final
  if (previousRoundMatches.length === 1 && bracketType === 'winners') {
    // This was the final match, tournament should be complete
    return [];
  }
  
  // Get game modes and maps
  const gameModes = await db.all('SELECT * FROM game_modes WHERE game_id = ?', [tournament.game_id]) as GameMode[];
  const gameMaps = await db.all('SELECT * FROM game_maps WHERE game_id = ?', [tournament.game_id]) as GameMap[];
  
  const matches: GeneratedMatch[] = [];
  const tournamentMatches: TournamentMatchInfo[] = [];
  
  // Pair winners for next round
  for (let i = 0; i < previousRoundMatches.length; i += 2) {
    const match1 = previousRoundMatches[i];
    const match2 = previousRoundMatches[i + 1];
    
    if (!match2) {
      // Odd number of matches - winner gets bye to next round
      continue;
    }
    
    const matchId = uuidv4();
    const nextRound = currentRound + 1;
    const matchOrder = Math.floor(i / 2) + 1;
    
    // Get winner team IDs
    const winner1TeamId = match1.winner_team;
    const winner2TeamId = match2.winner_team;
    
    // Get team names
    const team1 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [winner1TeamId]) as TeamRecord | undefined;
    const team2 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [winner2TeamId]) as TeamRecord | undefined;
    
    // Randomly select game mode and map
    const randomMode = gameModes[Math.floor(Math.random() * gameModes.length)];
    const availableMaps = gameMaps.filter(m => !m.mode_id || m.mode_id === randomMode.id);
    const randomMap = availableMaps[Math.floor(Math.random() * availableMaps.length)];
    
    // Create match record
    const generatedMatch: GeneratedMatch = {
      id: matchId,
      name: `${team1?.team_name || 'Winner 1'} vs ${team2?.team_name || 'Winner 2'} - Round ${nextRound}`,
      game_id: tournament.game_id,
      game_mode_id: randomMode.id,
      map_id: randomMap.id,
      rounds_per_match: tournament.rounds_per_match,
      max_participants: 12,
      status: 'created',
      match_type: 'tournament',
      tournament_id: tournamentId,
      tournament_round: nextRound,
      tournament_bracket_type: bracketType,
      team1_name: team1?.team_name,
      team2_name: team2?.team_name
    };
    
    matches.push(generatedMatch);
    
    // Create tournament match info
    const tournamentMatch: TournamentMatchInfo = {
      id: matchId,
      tournament_id: tournamentId,
      round: nextRound,
      bracket_type: bracketType,
      team1_id: winner1TeamId,
      team2_id: winner2TeamId,
      match_order: matchOrder,
      parent_match1_id: match1.id,
      parent_match2_id: match2.id
    };
    
    tournamentMatches.push(tournamentMatch);
  }
  
  return matches;
}

/**
 * Generate first round matches for double elimination tournament
 */
export async function generateDoubleEliminationMatches(
  tournamentId: string,
  bracketAssignments: BracketAssignment[],
  gameId: string,
  roundsPerMatch: number,
  startTime?: Date
): Promise<GeneratedMatch[]> {
  const db = await getDbInstance();
  
  // Get game modes and maps for the game
  const gameModes = await db.all('SELECT * FROM game_modes WHERE game_id = ?', [gameId]) as GameMode[];
  const gameMaps = await db.all('SELECT * FROM game_maps WHERE game_id = ?', [gameId]) as GameMap[];
  
  if (gameModes.length === 0 || gameMaps.length === 0) {
    throw new Error('No game modes or maps found for this game');
  }
  
  // Sort bracket assignments by position to ensure proper pairing
  const sortedAssignments = bracketAssignments.sort((a, b) => a.position - b.position);
  
  const matches: GeneratedMatch[] = [];
  const tournamentMatches: TournamentMatchInfo[] = [];
  
  // Generate winner's bracket first round (same as single elimination)
  for (let i = 0; i < sortedAssignments.length; i += 2) {
    const team1Assignment = sortedAssignments[i];
    const team2Assignment = sortedAssignments[i + 1];
    
    if (!team2Assignment) {
      // Odd number of teams - give bye to last team
      continue;
    }
    
    const matchId = uuidv4();
    const matchOrder = Math.floor(i / 2) + 1;
    
    // Get team names
    const team1 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team1Assignment.teamId]) as TeamRecord | undefined;
    const team2 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team2Assignment.teamId]) as TeamRecord | undefined;
    
    // Randomly select game mode and map
    const randomMode = gameModes[Math.floor(Math.random() * gameModes.length)];
    const availableMaps = gameMaps.filter(m => !m.mode_id || m.mode_id === randomMode.id);
    const randomMap = availableMaps[Math.floor(Math.random() * availableMaps.length)];
    
    // Create match record
    const generatedMatch: GeneratedMatch = {
      id: matchId,
      name: `${team1?.team_name || 'Team 1'} vs ${team2?.team_name || 'Team 2'} - WB Round 1`,
      game_id: gameId,
      game_mode_id: randomMode.id,
      map_id: randomMap.id,
      rounds_per_match: roundsPerMatch,
      max_participants: 12,
      status: 'created',
      match_type: 'tournament',
      tournament_id: tournamentId,
      tournament_round: 1,
      tournament_bracket_type: 'winners',
      scheduled_time: startTime,
      team1_name: team1?.team_name,
      team2_name: team2?.team_name
    };
    
    matches.push(generatedMatch);
    
    // Create tournament match info
    const tournamentMatch: TournamentMatchInfo = {
      id: matchId,
      tournament_id: tournamentId,
      round: 1,
      bracket_type: 'winners',
      team1_id: team1Assignment.teamId,
      team2_id: team2Assignment.teamId,
      match_order: matchOrder
    };
    
    tournamentMatches.push(tournamentMatch);
  }
  
  return matches;
}

/**
 * Generate loser's bracket matches when teams are eliminated from winner's bracket
 */
export async function generateLosersBracketMatches(
  tournamentId: string,
  eliminatedFromWinnersRound: number,
  eliminatedTeamIds: string[]
): Promise<GeneratedMatch[]> {
  const db = await getDbInstance();
  
  if (eliminatedTeamIds.length === 0) {
    return [];
  }
  
  // Get tournament info
  const tournament = await db.get(`
    SELECT t.*, g.id as game_id 
    FROM tournaments t 
    JOIN games g ON t.game_id = g.id 
    WHERE t.id = ?
  `, [tournamentId]) as TournamentRecord | undefined;
  
  if (!tournament) {
    throw new Error('Tournament not found');
  }
  
  // Get game modes and maps
  const gameModes = await db.all('SELECT * FROM game_modes WHERE game_id = ?', [tournament.game_id]) as GameMode[];
  const gameMaps = await db.all('SELECT * FROM game_maps WHERE game_id = ?', [tournament.game_id]) as GameMap[];
  
  const matches: GeneratedMatch[] = [];
  const tournamentMatches: TournamentMatchInfo[] = [];
  
  // Calculate loser's bracket round number
  // In double elimination, teams from WB round N go to LB round (2*N-1) if N=1, or (2*N-2) if N>1
  const losersBracketRound = eliminatedFromWinnersRound === 1 ? 1 : (eliminatedFromWinnersRound * 2) - 2;
  
  // Get existing teams already in this loser's bracket round
  const existingTeamsInRound = await db.all(`
    SELECT tm.team1_id, tm.team2_id, tm.match_order
    FROM tournament_matches tm
    JOIN matches m ON tm.match_id = m.id
    WHERE tm.tournament_id = ? AND tm.bracket_type = 'losers' AND tm.round = ?
    ORDER BY tm.match_order
  `, [tournamentId, losersBracketRound]) as TeamMatchInfo[];
  
  // Merge eliminated teams with existing teams in this round
  const allTeamsInRound = [...eliminatedTeamIds];
  existingTeamsInRound.forEach(match => {
    if (match.team1_id && !allTeamsInRound.includes(match.team1_id)) {
      allTeamsInRound.push(match.team1_id);
    }
    if (match.team2_id && !allTeamsInRound.includes(match.team2_id)) {
      allTeamsInRound.push(match.team2_id);
    }
  });
  
  // Pair teams for matches
  for (let i = 0; i < allTeamsInRound.length; i += 2) {
    const team1Id = allTeamsInRound[i];
    const team2Id = allTeamsInRound[i + 1];
    
    if (!team2Id) {
      // Odd number - this team gets a bye to next round
      continue;
    }
    
    const matchId = uuidv4();
    const matchOrder = Math.floor(i / 2) + 1;
    
    // Get team names
    const team1 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team1Id]) as TeamRecord | undefined;
    const team2 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team2Id]) as TeamRecord | undefined;
    
    // Randomly select game mode and map
    const randomMode = gameModes[Math.floor(Math.random() * gameModes.length)];
    const availableMaps = gameMaps.filter(m => !m.mode_id || m.mode_id === randomMode.id);
    const randomMap = availableMaps[Math.floor(Math.random() * availableMaps.length)];
    
    // Create match record
    const generatedMatch: GeneratedMatch = {
      id: matchId,
      name: `${team1?.team_name || 'Team 1'} vs ${team2?.team_name || 'Team 2'} - LB Round ${losersBracketRound}`,
      game_id: tournament.game_id,
      game_mode_id: randomMode.id,
      map_id: randomMap.id,
      rounds_per_match: tournament.rounds_per_match,
      max_participants: 12,
      status: 'created',
      match_type: 'tournament',
      tournament_id: tournamentId,
      tournament_round: losersBracketRound,
      tournament_bracket_type: 'losers',
      team1_name: team1?.team_name,
      team2_name: team2?.team_name
    };
    
    matches.push(generatedMatch);
    
    // Create tournament match info
    const tournamentMatch: TournamentMatchInfo = {
      id: matchId,
      tournament_id: tournamentId,
      round: losersBracketRound,
      bracket_type: 'losers',
      team1_id: team1Id,
      team2_id: team2Id,
      match_order: matchOrder
    };
    
    tournamentMatches.push(tournamentMatch);
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
  `, [tournamentId]) as TournamentRecord | undefined;
  
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
  
  // Randomly select game mode and map
  const randomMode = gameModes[Math.floor(Math.random() * gameModes.length)];
  const availableMaps = gameMaps.filter(m => !m.mode_id || m.mode_id === randomMode.id);
  const randomMap = availableMaps[Math.floor(Math.random() * availableMaps.length)];
  
  // Create grand finals match
  const grandFinalsMatch: GeneratedMatch = {
    id: matchId,
    name: `Grand Finals: ${wbTeam?.team_name || 'WB Winner'} vs ${lbTeam?.team_name || 'LB Winner'}`,
    game_id: tournament.game_id,
    game_mode_id: randomMode.id,
    map_id: randomMap.id,
    rounds_per_match: tournament.rounds_per_match,
    max_participants: 12,
    status: 'created',
    match_type: 'tournament',
    tournament_id: tournamentId,
    tournament_round: 1,
    tournament_bracket_type: 'final',
    team1_name: wbTeam?.team_name,
    team2_name: lbTeam?.team_name
  };
  
  // Note: tournament match info would be created separately when saving
  return [grandFinalsMatch];
}

/**
 * Check if grand finals needs a reset (loser's bracket winner beats winner's bracket winner)
 */
export async function checkGrandFinalsReset(
  tournamentId: string,
  grandFinalsWinnerId: string,
  losersBracketWinnerId: string
): Promise<boolean> {
  // If the loser's bracket winner wins the grand finals, they need to play again
  // since the winner's bracket team has only lost once
  return grandFinalsWinnerId === losersBracketWinnerId;
}

/**
 * Generate grand finals reset match
 */
export async function generateGrandFinalsResetMatch(
  tournamentId: string,
  team1Id: string,
  team2Id: string
): Promise<GeneratedMatch[]> {
  const db = await getDbInstance();
  
  // Get tournament info
  const tournament = await db.get(`
    SELECT t.*, g.id as game_id 
    FROM tournaments t 
    JOIN games g ON t.game_id = g.id 
    WHERE t.id = ?
  `, [tournamentId]) as TournamentRecord | undefined;
  
  if (!tournament) {
    throw new Error('Tournament not found');
  }
  
  // Get game modes and maps
  const gameModes = await db.all('SELECT * FROM game_modes WHERE game_id = ?', [tournament.game_id]) as GameMode[];
  const gameMaps = await db.all('SELECT * FROM game_maps WHERE game_id = ?', [tournament.game_id]) as GameMap[];
  
  // Get team names
  const team1 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team1Id]) as TeamRecord | undefined;
  const team2 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [team2Id]) as TeamRecord | undefined;
  
  const matchId = uuidv4();
  
  // Randomly select game mode and map
  const randomMode = gameModes[Math.floor(Math.random() * gameModes.length)];
  const availableMaps = gameMaps.filter(m => !m.mode_id || m.mode_id === randomMode.id);
  const randomMap = availableMaps[Math.floor(Math.random() * availableMaps.length)];
  
  // Create grand finals reset match
  const resetMatch: GeneratedMatch = {
    id: matchId,
    name: `Grand Finals Reset: ${team1?.team_name || 'Team 1'} vs ${team2?.team_name || 'Team 2'}`,
    game_id: tournament.game_id,
    game_mode_id: randomMode.id,
    map_id: randomMap.id,
    rounds_per_match: tournament.rounds_per_match,
    max_participants: 12,
    status: 'created',
    match_type: 'tournament',
    tournament_id: tournamentId,
    tournament_round: 2,
    tournament_bracket_type: 'final',
    team1_name: team1?.team_name,
    team2_name: team2?.team_name
  };
  
  // Note: tournament match info would be created separately when saving
  return [resetMatch];
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
      const scheduledDateTime = match.scheduled_time?.toISOString() || new Date().toISOString();
      const scheduledDate = scheduledDateTime.split('T')[0]; // Extract date part (YYYY-MM-DD)

      await db.run(`
        INSERT INTO matches (
          id, name, game_id, mode_id, rounds,
          max_participants, status, tournament_id,
          tournament_round, tournament_bracket_type, start_date, start_time,
          team1_name, team2_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        match.id, match.name, match.game_id, match.game_mode_id,
        match.rounds_per_match, match.max_participants, match.status,
        match.tournament_id, match.tournament_round, match.tournament_bracket_type,
        scheduledDate, scheduledDateTime, match.team1_name, match.team2_name
      ]);
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
    }
    
    await db.run('COMMIT');
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
      COUNT(CASE WHEN m.status = 'completed' THEN 1 END) as completed_matches
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
      COUNT(CASE WHEN m.status = 'completed' THEN 1 END) as completed,
      COUNT(*) as total
    FROM matches m
    JOIN tournament_matches tm ON m.id = tm.match_id
    WHERE tm.tournament_id = ? AND tm.bracket_type = 'winners'
  `, [tournamentId]) as RoundStatsInfo;
  
  const losersInfo = await db.get(`
    SELECT 
      COALESCE(MAX(tm.round), 0) as max_round,
      COUNT(CASE WHEN m.status = 'completed' THEN 1 END) as completed,
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