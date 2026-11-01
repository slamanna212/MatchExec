/** Bracket generation for a tournament in the 'assign' phase (`POST /api/tournaments/:id/generate-matches`). */
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../lib/db';
import { matches, tournamentTeams } from '../../../lib/db/schema';
import { logger } from '../logger';
import { enqueueAnnouncement } from '../discord-queues';
import { AfterCommit, bestEffort } from '../matches/effects';
import {
  generateCumulativeMatches, generateFirstRoundMatches, saveGeneratedMatches, type BracketAssignment, type GeneratedMatch, type TournamentMatchInfo,
} from './bracket';
import { lockTournament, touchTournament, TournamentError } from './tournaments';

export interface GenerateResult {
  message: string;
  matchCount: number;
  format: string;
  tournamentId: string;
}

/**
 * Generate the first round (or the single cumulative match) and queue the Discord announcements. One transaction under
 * the tournament row lock: two overlapping requests can't both pass the "no matches yet" check and build a bracket twice.
 * Throws TournamentError (404 / 400).
 */
export async function generateTournamentMatches(db: Db, tournamentId: string, provided?: BracketAssignment[]): Promise<GenerateResult> {
  const after = new AfterCommit();
  const result = await db.transaction(async (tx) => {
    const tournament = await lockTournament(tx, tournamentId);
    if (!tournament) throw new TournamentError('Tournament not found', 404);
    if (tournament.status !== 'assign') throw new TournamentError('Tournament must be in assign phase to generate matches', 400);

    const [existing] = await tx.select({ n: count() }).from(matches).where(eq(matches.tournament_id, tournamentId));
    if (existing && existing.n > 0) throw new TournamentError('Matches have already been generated for this tournament', 400);

    const startTime = tournament.start_time ?? undefined;
    let generated: GeneratedMatch[];
    let infos: TournamentMatchInfo[];
    const cumulative = tournament.format === 'cumulative-points';

    if (cumulative) {
      // No bracket assignments: all participants play together
      ({ matches: generated, tournamentMatches: infos } = await generateCumulativeMatches(tx, tournamentId, startTime));
    } else {
      let assignments = provided && provided.length > 0 ? provided : undefined;
      if (!assignments) {
        const teams = await tx.select({ id: tournamentTeams.id }).from(tournamentTeams)
          .where(eq(tournamentTeams.tournament_id, tournamentId)).orderBy(asc(tournamentTeams.created_at), asc(tournamentTeams.id));
        if (teams.length < 2) throw new TournamentError('At least 2 teams are required to generate matches', 400);
        assignments = teams.map((team, index) => ({ position: index, teamId: team.id }));
      }
      if (assignments.length < 2) throw new TournamentError('At least 2 teams must be assigned to bracket positions', 400);

      const ids = assignments.map((a) => a.teamId);
      const owned = await tx.select({ id: tournamentTeams.id }).from(tournamentTeams)
        .where(and(eq(tournamentTeams.tournament_id, tournamentId), inArray(tournamentTeams.id, ids)));
      const known = new Set(owned.map((t) => t.id));
      const unknown = ids.find((id) => !known.has(id));
      if (unknown) throw new TournamentError(`Team ${unknown} not found in tournament`, 400);

      generated = await generateFirstRoundMatches(tx, tournamentId, assignments, startTime);
      infos = generated.map((match, index) => ({
        id: match.id, tournament_id: tournamentId, round: match.tournament_round,
        bracket_type: match.tournament_bracket_type as TournamentMatchInfo['bracket_type'],
        team1_id: match.team1_id, team2_id: match.team2_id, match_order: index + 1,
      }));
    }

    await saveGeneratedMatches(tx, generated, infos, { addAllTeams: cumulative }, after);

    for (const match of generated) {
      await bestEffort(tx, `Failed to queue announcement for match ${match.id}`, (sp) => enqueueAnnouncement(sp, { matchId: match.id, type: 'standard' }), null);
    }
    await touchTournament(tx, tournamentId);
    logger.debug(`Generated ${generated.length} matches for tournament ${tournamentId}`);

    return { message: 'Tournament bracket generated successfully', matchCount: generated.length, format: tournament.format, tournamentId };
  });
  await after.run();
  return result;
}
