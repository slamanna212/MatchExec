import { v4 as uuidv4 } from 'uuid';
import { getDbInstance } from './database-init';
import type { Database } from '../../lib/database/connection';
import { db as pgDb } from '../../lib/db';
import { getModeById, listMapsForModes, listModesByTeamSize, listNonWorkshopModes } from './games';
import { VoiceChannelService } from './voice-channel-service';
import { logger } from './logger';
import { withTransaction } from '@/lib/transaction';
import { createMatchTeams, createNamedMatchTeams } from './match-setup';
import type { PlannedMatch } from './double-elimination';

interface GameMode {
  id: string;
  team_size: number | null;
}

interface GameMap {
  id: string;
  name: string;
  mode_id?: string | null;
}

interface TeamRecord {
  team_name: string;
}

interface TournamentRecord {
  id: string;
  name?: string;
  game_id: string;
  game_mode_id: string;
  rounds_per_match: number;
  ruleset: string;
  event_image_url?: string | null;
  announcements?: string | null;
  player_notifications?: number;
  stats_enabled?: number;
}

interface MatchResult {
  id: string;
  winner_team: string;
  team1_id: string;
  team2_id: string;
  bracket_type: string;
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
  event_image_url?: string | null;
  stats_enabled?: number;
  announcements?: string | null;
  player_notifications?: number;
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

  const { tournamentRuleset, tournamentDescription, tournamentEventImageUrl, tournamentAnnouncements, tournamentPlayerNotifications } = await fetchTournamentInfo(db, tournamentId);
  const { gameModes, gameMaps } = await fetchGameData(gameId, tournament.game_mode_id);

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
    tournamentEventImageUrl,
    gameModes,
    tournamentMaps,
    startTime,
    tournamentAnnouncements,
    tournamentPlayerNotifications
  );
}

async function fetchTournamentInfo(db: Database, tournamentId: string) {
  const tournament = await db.get('SELECT ruleset, description, event_image_url, announcements, player_notifications FROM tournaments WHERE id = ?', [tournamentId]) as { ruleset: string; description: string | null; event_image_url: string | null; announcements: string | null; player_notifications: number | null } | undefined;
  return {
    tournamentRuleset: tournament?.ruleset || 'casual',
    tournamentDescription: tournament?.description || null,
    tournamentEventImageUrl: tournament?.event_image_url || null,
    tournamentAnnouncements: tournament?.announcements ?? null,
    tournamentPlayerNotifications: tournament?.player_notifications ?? 1,
  };
}

async function fetchGameData(gameId: string, gameModeId: string) {
  // Special handling for Overwatch 2 team size options
  if (gameId === 'overwatch2' && gameModeId?.startsWith('ow2-')) {
    // Fetch all non-workshop modes, then the maps of those modes
    const gameModes = await listNonWorkshopModes(pgDb, gameId);
    const gameMaps = await listMapsForModes(pgDb, gameId, gameModes.map(m => m.id));

    if (gameModes.length === 0 || gameMaps.length === 0) {
      throw new Error('No game modes or maps found for Overwatch 2');
    }

    return { gameModes, gameMaps };
  }

  // Regular handling for other games
  // Fetch the selected game mode to get its team size
  const selectedMode = await getModeById(pgDb, gameModeId);

  if (!selectedMode) {
    throw new Error(`Game mode ${gameModeId} not found`);
  }

  // All modes with the same team size (a NULL team size matches other NULL team size modes: FFA/Position)
  const gameModes = await listModesByTeamSize(pgDb, gameId, selectedMode.team_size);
  const gameMaps = await listMapsForModes(pgDb, gameId, gameModes.map(m => m.id));

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
  tournamentEventImageUrl: string | null,
  gameModes: GameMode[],
  tournamentMaps: GameMap[],
  startTime?: Date,
  tournamentAnnouncements?: string | null,
  tournamentPlayerNotifications?: number
): Promise<GeneratedMatch[]> {
  const matches: GeneratedMatch[] = [];

  for (let i = 0; i < sortedAssignments.length; i += 2) {
    const team1Assignment = sortedAssignments[i];
    const team2Assignment = sortedAssignments[i + 1];

    if (!team2Assignment) {
      // Odd number of teams: the unpaired team sits out round 1. Record the bye so the
      // next-round pairing picks it up (otherwise the team would never play).
      await saveByeTeam(db, tournamentId, 1, 'winners', team1Assignment.teamId);
      continue;
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
      tournamentEventImageUrl,
      selectedMaps,
      primaryMode!,
      team1Assignment,
      team2Assignment,
      startTime,
      tournamentAnnouncements,
      tournamentPlayerNotifications
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
  tournamentEventImageUrl: string | null,
  selectedMaps: string[],
  primaryMode: GameMode,
  team1Assignment: BracketAssignment,
  team2Assignment: BracketAssignment,
  startTime?: Date,
  tournamentAnnouncements?: string | null,
  tournamentPlayerNotifications?: number
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
    team2_id: team2Assignment.teamId,
    event_image_url: tournamentEventImageUrl || undefined,
    announcements: tournamentAnnouncements ?? null,
    player_notifications: tournamentPlayerNotifications ?? 1,
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

  // Fetch any bye teams carried over into the current round
  const byeTeamIds = await fetchByeTeamsForRound(db, tournamentId, currentRound, bracketType);
  const totalAdvancing = previousRoundMatches.length + byeTeamIds.length;

  if (totalAdvancing === 1 && bracketType === 'winners') {
    return []; // Only 1 team left — tournament should end
  }

  const { gameModes, gameMaps } = await fetchGameData(tournament.game_id, tournament.game_mode_id);
  const tournamentMaps = filterTournamentMaps(gameMaps);

  return await generateNextRoundMatchesFromWinners(
    db,
    previousRoundMatches,
    byeTeamIds,
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

async function fetchByeTeamsForRound(
  db: Database,
  tournamentId: string,
  round: number,
  bracketType: string
): Promise<string[]> {
  const rows = await db.all(
    'SELECT team_id FROM tournament_round_byes WHERE tournament_id = ? AND round = ? AND bracket_type = ?',
    [tournamentId, round, bracketType]
  ) as { team_id: string }[];
  return rows.map(r => r.team_id);
}

async function saveByeTeam(
  db: Database,
  tournamentId: string,
  round: number,
  bracketType: string,
  teamId: string
): Promise<void> {
  const id = uuidv4();
  await db.run(
    'INSERT OR IGNORE INTO tournament_round_byes (id, tournament_id, round, bracket_type, team_id) VALUES (?, ?, ?, ?, ?)',
    [id, tournamentId, round, bracketType, teamId]
  );
}

async function generateNextRoundMatchesFromWinners(
  db: Database,
  previousRoundMatches: MatchResult[],
  byeTeamIds: string[],
  tournament: TournamentRecord & { description?: string | null },
  tournamentId: string,
  currentRound: number,
  bracketType: 'winners' | 'losers' | 'final',
  gameModes: GameMode[],
  tournamentMaps: GameMap[]
): Promise<GeneratedMatch[]> {
  const matches: GeneratedMatch[] = [];
  const nextRound = currentRound + 1;

  // Combine bye teams from the current round with winners from completed matches
  const allTeamIds: string[] = [
    ...byeTeamIds,
    ...previousRoundMatches.map(m => m.winner_team).filter(Boolean) as string[]
  ];

  for (let i = 0; i < allTeamIds.length; i += 2) {
    const winner1TeamId = allTeamIds[i];
    const winner2TeamId = allTeamIds[i + 1];

    if (!winner2TeamId) {
      // Odd team out — record as a bye for the next round
      await saveByeTeam(db, tournamentId, nextRound, bracketType, winner1TeamId);
      continue;
    }

    const matchId = uuidv4();

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
      team2_id: winner2TeamId,
      event_image_url: tournament.event_image_url || undefined,
      announcements: tournament.announcements ?? null,
      player_notifications: tournament.player_notifications ?? 1,
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
 * Generate a single group match for a cumulative-points tournament.
 * All tournament participants compete together; position/FFA results accumulate over events.
 */
export async function generateCumulativeMatches(
  tournamentId: string,
  gameId: string,
  roundsPerMatch: number,
  startTime?: Date
): Promise<{ matches: GeneratedMatch[]; tournamentMatches: TournamentMatchInfo[] }> {
  const db = await getDbInstance();

  const tournament = await db.get<TournamentRecord>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
  if (!tournament) throw new Error('Tournament not found');

  const { tournamentRuleset, tournamentDescription, tournamentEventImageUrl, tournamentAnnouncements, tournamentPlayerNotifications } = await fetchTournamentInfo(db, tournamentId);
  const { gameModes, gameMaps } = await fetchGameData(gameId, tournament.game_mode_id);

  const tournamentMaps = filterTournamentMaps(gameMaps);
  if (tournamentMaps.length === 0) throw new Error('No tournament-eligible maps found');

  const mode = gameModes.find(m => m.id === tournament.game_mode_id) ?? gameModes[0];
  const selectedMap = tournamentMaps[0];
  const mapList = tournamentMaps.slice(0, roundsPerMatch).map(m => m.id);

  const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const farFuture = new Date('2099-12-31T23:59:59.999Z');

  const generatedMatch: GeneratedMatch = {
    id: matchId,
    name: tournament.name ?? 'Cumulative Match',
    description: tournamentDescription ?? undefined,
    game_id: gameId,
    game_mode_id: mode.id,
    map_id: selectedMap.id,
    maps: mapList,
    rounds_per_match: roundsPerMatch,
    max_participants: 999,
    // 'assign' so transitionFirstRoundMatches picks it up when the tournament
    // moves to battle; match_teams are created in saveGeneratedMatches.
    status: 'assign',
    match_type: 'tournament',
    tournament_id: tournamentId,
    tournament_round: 1,
    tournament_bracket_type: 'winners',
    rules: tournamentRuleset,
    scheduled_time: startTime ?? farFuture,
    event_image_url: tournamentEventImageUrl,
    announcements: tournamentAnnouncements,
    player_notifications: tournamentPlayerNotifications,
  };

  const tournamentMatchInfo: TournamentMatchInfo = {
    id: matchId,
    tournament_id: tournamentId,
    round: 1,
    bracket_type: 'winners',
    match_order: 1,
  };

  return { matches: [generatedMatch], tournamentMatches: [tournamentMatchInfo] };
}

/**
 * Add all tournament team members as participants to a cumulative match.
 */
export async function addAllTeamsToMatch(tournamentId: string, matchId: string): Promise<void> {
  const db = await getDbInstance();

  const teams = await db.all<{ id: string; team_name: string }>(`
    SELECT id, team_name FROM tournament_teams WHERE tournament_id = ? ORDER BY created_at
  `, [tournamentId]);

  for (const team of teams) {
    const members = await db.all<{ user_id: string; discord_user_id: string | null; username: string; is_captain: number }>(`
      SELECT user_id, discord_user_id, username, is_captain
      FROM tournament_team_members WHERE team_id = ?
    `, [team.id]);

    for (const member of members) {
      const participantId = `participant_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      await db.run(`
        INSERT OR IGNORE INTO match_participants
          (id, match_id, user_id, discord_user_id, username, receives_map_codes, joined_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [participantId, matchId, member.user_id, member.discord_user_id, member.username, member.is_captain ? 1 : 0]);
    }
  }

  // FFA/Position: one match_teams row per participant (idempotent)
  await createMatchTeams(matchId);
}

/**
 * Build the matches the double-elimination planner asked for (see lib/double-elimination.ts).
 * Uses the same mode/map pool as every other round of the tournament.
 */
export async function generateDoubleEliminationRoundMatches(
  tournamentId: string,
  planned: PlannedMatch[]
): Promise<GeneratedMatch[]> {
  if (planned.length === 0) return [];

  const db = await getDbInstance();
  const tournament = await fetchTournamentForNextRound(db, tournamentId);
  const { gameModes, gameMaps } = await fetchGameData(tournament.game_id, tournament.game_mode_id);
  const tournamentMaps = filterTournamentMaps(gameMaps);

  const matches: GeneratedMatch[] = [];
  for (const p of planned) {
    const team1 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [p.team1]) as TeamRecord | undefined;
    const team2 = await db.get('SELECT team_name FROM tournament_teams WHERE id = ?', [p.team2]) as TeamRecord | undefined;

    const { selectedMaps, selectedModes } = selectMapsForMatch(tournament.rounds_per_match, gameModes, tournamentMaps);
    const primaryMode = selectedModes[0] ? gameModes.find(m => m.id === selectedModes[0]) : gameModes[0];

    const names = `${team1?.team_name || 'Team 1'} vs ${team2?.team_name || 'Team 2'}`;
    let name = names;
    if (p.bracket === 'final') name = `${p.reset ? 'Grand Finals Reset' : 'Grand Finals'}: ${names}`;

    matches.push({
      id: uuidv4(),
      name,
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
      tournament_round: p.round,
      tournament_bracket_type: p.bracket,
      rules: tournament.ruleset,
      team1_name: team1?.team_name,
      team2_name: team2?.team_name,
      team1_id: p.team1,
      team2_id: p.team2,
      event_image_url: tournament.event_image_url || undefined,
      announcements: tournament.announcements ?? null,
      player_notifications: tournament.player_notifications ?? 1,
    });
  }
  return matches;
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
      team1_name, team2_name, red_team_id, blue_team_id, announcements, rules,
      event_image_url, stats_enabled, player_notifications, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, [
    match.id, match.name, match.description || null, match.game_id, match.game_mode_id, match.map_id,
    match.maps ? JSON.stringify(match.maps) : null, match.rounds_per_match,
    match.max_participants, match.status, match.tournament_id,
    match.tournament_round, match.tournament_bracket_type, scheduledDate,
    scheduledDateTime, match.team1_name, match.team2_name,
    match.team2_id, match.team1_id, match.announcements ?? null, match.rules || 'casual',
    match.event_image_url || null, match.stats_enabled ?? 0, match.player_notifications ?? 1
  ]);
}

/**
 * Add team members as match participants
 */
async function addTeamParticipants(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string,
  teamId: string,
  teamColor: 'red' | 'blue',
  matchTeamId?: string
): Promise<void> {
  const teamMembers = await db.all(`
    SELECT user_id, discord_user_id, username, is_captain
    FROM tournament_team_members
    WHERE team_id = ?
  `, [teamId]) as { user_id: string; discord_user_id: string | null; username: string; is_captain: number }[];

  for (const member of teamMembers) {
    const participantId = `participant_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    await db.run(`
      INSERT INTO match_participants (
        id, match_id, user_id, discord_user_id, username, team, team_assignment, team_id, receives_map_codes, joined_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [participantId, matchId, member.user_id, member.discord_user_id, member.username, teamColor, teamColor, matchTeamId ?? null, member.is_captain ? 1 : 0]);
  }
}

const TOURNAMENT_TEAM_COLORS = { blue: '#4A90E2', red: '#E04A4A' } as const;

/**
 * Create match_teams rows named after the two tournament teams (order 0 = team1/blue,
 * order 1 = team2/red) and add each tournament team's members as participants linked
 * to the matching match_teams row. Safe to call for a match whose teams are not yet
 * known (does nothing).
 */
async function setupTournamentMatchTeams(
  db: Awaited<ReturnType<typeof getDbInstance>>,
  matchId: string,
  team1Id: string | null | undefined,
  team2Id: string | null | undefined
): Promise<void> {
  if (!team1Id || !team2Id) {
    // Partially known match: still add whichever side exists so rosters are not lost
    if (team1Id) await addTeamParticipants(db, matchId, team1Id, 'blue');
    if (team2Id) await addTeamParticipants(db, matchId, team2Id, 'red');
    return;
  }

  const t1 = await db.get<{ team_name: string }>('SELECT team_name FROM tournament_teams WHERE id = ?', [team1Id]);
  const t2 = await db.get<{ team_name: string }>('SELECT team_name FROM tournament_teams WHERE id = ?', [team2Id]);

  const [blueId, redId] = await createNamedMatchTeams(matchId, [
    { name: t1?.team_name ?? 'Team 1', color: TOURNAMENT_TEAM_COLORS.blue },
    { name: t2?.team_name ?? 'Team 2', color: TOURNAMENT_TEAM_COLORS.red },
  ]);
  await db.run('UPDATE matches SET team_count = 2 WHERE id = ?', [matchId]);

  await addTeamParticipants(db, matchId, team1Id, 'blue', blueId);
  await addTeamParticipants(db, matchId, team2Id, 'red', redId);
}

/**
 * Save generated matches to database (single transaction).
 *
 * @param options.addAllTeams - cumulative-points: add every tournament team member to the
 *   (single) match and create per-participant match_teams, inside the same transaction.
 */
export async function saveGeneratedMatches(
  matches: GeneratedMatch[],
  tournamentMatches: TournamentMatchInfo[],
  options: { addAllTeams?: boolean } = {}
): Promise<void> {
  const db = await getDbInstance();

  await withTransaction(db, async () => {
    // Insert matches
    for (const match of matches) {
      await insertMatch(db, match);
    }

    // Insert tournament match relationships
    for (const tournamentMatch of tournamentMatches) {
      // Prefer the team ids carried on the generated match (they are the ones the
      // match row itself was built from); fall back to the tournament-match record.
      const generated = matches.find(m => m.id === tournamentMatch.id);
      const team1Id = generated?.team1_id || tournamentMatch.team1_id || undefined;
      const team2Id = generated?.team2_id || tournamentMatch.team2_id || undefined;

      await db.run(`
        INSERT INTO tournament_matches (
          match_id, tournament_id, round, bracket_type, team1_id, team2_id,
          match_order, parent_match1_id, parent_match2_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        tournamentMatch.id, tournamentMatch.tournament_id, tournamentMatch.round,
        tournamentMatch.bracket_type, team1Id, team2Id,
        tournamentMatch.match_order, tournamentMatch.parent_match1_id, tournamentMatch.parent_match2_id
      ]);

      // match_teams named after the tournament teams + participants linked to them
      if (!options.addAllTeams) {
        await setupTournamentMatchTeams(db, tournamentMatch.id, team1Id, team2Id);
      }
    }

    // Initialize match games for each match
    const { initializeMatchGames } = await import('./scoring-functions');
    for (const match of matches) {
      if (match.maps && match.maps.length > 0) {
        await initializeMatchGames(match.id);
      }
    }

    if (options.addAllTeams) {
      for (const match of matches) {
        await addAllTeamsToMatch(match.tournament_id, match.id);
      }
    }
  });

  // Create voice channels for all tournament matches (after commit; skipped for
  // cumulative matches which hold every participant)
  if (!options.addAllTeams) {
    for (const match of matches) {
      try {
        await VoiceChannelService.setupMatchVoiceChannels(match.id);
      } catch (error) {
        // Log error but don't fail the entire operation
        logger.error(`Failed to create voice channels for tournament match ${match.id}:`, error);
      }
    }
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