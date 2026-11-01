/**
 * Helper functions for Discord interaction handling
 */

import type { Client, ModalSubmitInteraction } from 'discord.js';
import type { ParsedModalId } from '../utils/id-parsers';
import { getDiscordAvatarUrl } from '../utils/avatar-fetcher';
import { db as pgDb } from '../../../lib/db';
import { addParticipant, countParticipants } from '../../../src/lib/matches';
import { addParticipant as addTournamentParticipant, countParticipants as countTournamentParticipants, getTeamName } from '../../../src/lib/tournaments';

/** The user is already signed up (unique match + user). */
export class DuplicateSignupError extends Error {
  constructor() {
    super('UNIQUE constraint failed: already signed up');
    this.name = 'DuplicateSignupError';
  }
}

interface SignupFormField {
  id: string;
  label: string;
  required?: boolean;
}

interface SignupForm {
  fields: SignupFormField[];
}

interface CollectedFormData {
  signupData: Record<string, string>;
  displayUsername: string;
}

/**
 * Collect form data from modal interaction
 */
export function collectFormData(
  interaction: ModalSubmitInteraction,
  signupForm: SignupForm
): CollectedFormData {
  const signupData: Record<string, string> = {};
  let displayUsername = interaction.user.username; // fallback

  for (const field of signupForm.fields) {
    try {
      const value = interaction.fields.getTextInputValue(field.id);
      signupData[field.id] = value;

      // Use the first field as the display username (usually username/battlenet_name)
      if (field.id === 'username' || field.id === 'battlenet_name') {
        displayUsername = value;
      }
    } catch {
      // Field might not exist in modal if we hit the 5-field limit
      if (field.required) {
        throw new Error(`Required field ${field.id} is missing`);
      }
    }
  }

  return { signupData, displayUsername };
}

/**
 * Insert participant into database
 */
export async function insertParticipant(
  parsedId: ParsedModalId,
  interaction: ModalSubmitInteraction,
  displayUsername: string,
  signupData: Record<string, string>,
  client: Client
): Promise<string> {
  // Fetch avatar URL when user signs up
  const avatarUrl = await getDiscordAvatarUrl(client, interaction.user.id);

  if (parsedId.isTournament) {
    // The unique (tournament, user) key makes a double submit a DuplicateSignupError; picking a team also adds the player to it.
    const result = await addTournamentParticipant(pgDb, {
      tournamentId: parsedId.eventId,
      userId: interaction.user.id,
      discordUserId: interaction.user.id,
      username: displayUsername,
      signupData,
      teamId: parsedId.selectedTeamId,
    });
    if (result.status !== 'added') throw new DuplicateSignupError();
    return result.id;
  }
    // Match participant (Postgres). Capacity was checked before the modal; the unique (match, user) key makes a
    // double submit a DuplicateSignupError instead of a second row.
    const result = await addParticipant(pgDb, {
      matchId: parsedId.eventId,
      userId: interaction.user.id,
      discordUserId: interaction.user.id,
      username: displayUsername,
      signupData,
      avatarUrl,
    });
    if (result.status !== 'added') throw new DuplicateSignupError();
    return result.id;
  
}

/**
 * Get participant count for an event
 */
export async function getParticipantCount(
  eventId: string,
  isTournament: boolean
): Promise<number> {
  if (!isTournament) return (await countParticipants(pgDb, eventId)) || 1;

  return (await countTournamentParticipants(pgDb, eventId)) || 1;
}

/**
 * Build confirmation message for signup
 */
export async function buildConfirmationMessage(
  parsedId: ParsedModalId,
  signupForm: SignupForm,
  signupData: Record<string, string>,
  participantCount: number
): Promise<string> {
  let message = `✅ Successfully signed up for the event!\n`;

  // Show team name if selected
  if (parsedId.selectedTeamId) {
    const teamName = await getTeamName(pgDb, parsedId.selectedTeamId);

    if (teamName) {
      message += `**Team:** ${teamName}\n`;
    }
  }

  // Show key information from the signup form (first 3 fields)
  for (const field of signupForm.fields.slice(0, 3)) {
    if (signupData[field.id]) {
      const label = field.label.replace(/ \(Optional\)$/i, '').trim(); // Remove "(Optional)" from display
      message += `**${label}:** ${signupData[field.id]}\n`;
    }
  }

  message += `**Participants:** ${participantCount}`;

  return message;
}
