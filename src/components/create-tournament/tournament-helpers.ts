import type { TournamentFormData } from './useTournamentForm';

/**
 * Builds tournament payload from form data
 */
export function buildTournamentPayload(formData: Partial<TournamentFormData>) {
  const startDateTime = formData.date && formData.time
    ? new Date(`${formData.date}T${formData.time}`)
    : null;

  return {
    name: formData.name,
    description: formData.description,
    gameId: formData.gameId,
    format: formData.format,
    startDate: startDateTime?.toISOString(),
    startTime: startDateTime?.toISOString(),
    roundsPerMatch: formData.roundsPerMatch,
    ruleset: formData.ruleset,
    maxParticipants: formData.maxParticipants,
    eventImageUrl: formData.eventImageUrl || null,
    allowPlayerTeamSelection: formData.allowPlayerTeamSelection || false
  };
}

/**
 * Creates pre-defined teams for a tournament
 */
export async function createPreDefinedTeams(tournamentId: string, teamNames: string[]): Promise<void> {
  if (teamNames.length === 0) return;

  const teamCreationPromises = teamNames.map(teamName =>
    fetch(`/api/tournaments/${tournamentId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName }),
    })
  );

  await Promise.all(teamCreationPromises);
}

/**
 * Starts tournament signups by transitioning to gather stage
 */
export async function startTournamentSignups(tournamentId: string): Promise<void> {
  await fetch(`/api/tournaments/${tournamentId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newStatus: 'gather' }),
  });
}
