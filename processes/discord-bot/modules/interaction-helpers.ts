/**
 * Helper functions for Discord interaction handling
 */

import type { ModalSubmitInteraction } from 'discord.js';
import type { ParsedModalId } from '../utils/id-parsers';
import type { Database } from '../../../lib/database/connection';

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

interface TeamInfo {
  team_name: string;
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
  db: Database,
  parsedId: ParsedModalId,
  interaction: ModalSubmitInteraction,
  displayUsername: string,
  signupData: Record<string, string>
): Promise<string> {
  const participantId = `participant_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  if (parsedId.isTournament) {
    // Insert tournament participant
    await db.run(`
      INSERT INTO tournament_participants (id, tournament_id, user_id, discord_user_id, username, signup_data, team_assignment)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      participantId,
      parsedId.eventId,
      interaction.user.id,
      interaction.user.id,
      displayUsername,
      JSON.stringify(signupData),
      parsedId.selectedTeamId
    ]);

    // If team was selected, also add to tournament_team_members
    if (parsedId.selectedTeamId) {
      const memberId = `member_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      await db.run(`
        INSERT INTO tournament_team_members (id, team_id, user_id, discord_user_id, username)
        VALUES (?, ?, ?, ?, ?)
      `, [
        memberId,
        parsedId.selectedTeamId,
        interaction.user.id,
        interaction.user.id,
        displayUsername
      ]);
    }
  } else {
    // Insert match participant
    await db.run(`
      INSERT INTO match_participants (id, match_id, user_id, discord_user_id, username, signup_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      participantId,
      parsedId.eventId,
      interaction.user.id,
      interaction.user.id,
      displayUsername,
      JSON.stringify(signupData)
    ]);
  }

  return participantId;
}

/**
 * Get participant count for an event
 */
export async function getParticipantCount(
  db: Database,
  eventId: string,
  isTournament: boolean
): Promise<number> {
  let result;

  if (isTournament) {
    result = await db.get<{ count: number }>(`
      SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = ?
    `, [eventId]);
  } else {
    result = await db.get<{ count: number }>(`
      SELECT COUNT(*) as count FROM match_participants WHERE match_id = ?
    `, [eventId]);
  }

  return result?.count || 1;
}

/**
 * Build confirmation message for signup
 */
export async function buildConfirmationMessage(
  db: Database,
  parsedId: ParsedModalId,
  signupForm: SignupForm,
  signupData: Record<string, string>,
  participantCount: number
): Promise<string> {
  let message = `✅ Successfully signed up for the event!\n`;

  // Show team name if selected
  if (parsedId.selectedTeamId) {
    const team = await db.get<TeamInfo>(`
      SELECT team_name FROM tournament_teams WHERE id = ?
    `, [parsedId.selectedTeamId]);

    if (team) {
      message += `**Team:** ${team.team_name}\n`;
    }
  }

  // Show key information from the signup form (first 3 fields)
  for (const field of signupForm.fields.slice(0, 3)) {
    if (signupData[field.id]) {
      const label = field.label.replace(/\s*\(Optional\)\s*$/i, ''); // Remove "(Optional)" from display
      message += `**${label}:** ${signupData[field.id]}\n`;
    }
  }

  message += `**Participants:** ${participantCount}`;

  return message;
}
