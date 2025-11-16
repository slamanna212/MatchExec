import type { TournamentFormData } from './useTournamentForm';

/**
 * Builds tournament payload from form data
 */
export function buildTournamentPayload(formData: Partial<TournamentFormData>) {
  let startDateTime: Date | null = null;

  if (formData.date && formData.time) {
    // Parse components explicitly to ensure we use the browser's local timezone
    const [year, month, day] = formData.date.split('-').map(Number);
    const [hours, minutes] = formData.time.split(':').map(Number);

    // Create Date using Date constructor with components - always uses local timezone
    // Month is 0-indexed in JavaScript Date constructor
    startDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  return {
    name: formData.name,
    description: formData.description,
    gameId: formData.gameId,
    gameModeId: formData.gameModeId,
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
