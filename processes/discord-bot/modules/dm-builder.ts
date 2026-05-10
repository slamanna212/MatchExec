import type { Client } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { logger } from '../../../src/lib/logger/server';

/**
 * Sends a DM to a Discord user. Swallows errors silently if the user has DMs disabled.
 */
export async function sendDM(client: Client, userId: string, embed: EmbedBuilder): Promise<void> {
  try {
    const user = await client.users.fetch(userId);
    await user.send({ embeds: [embed] });
  } catch {
    logger.debug(`📵 Could not DM user ${userId} (DMs may be disabled)`);
  }
}

function parseGameColor(gameColor: string | null | undefined): number {
  if (!gameColor) return 0x5865F2;
  try {
    return parseInt(gameColor.replace('#', ''), 16);
  } catch {
    return 0x5865F2;
  }
}

/**
 * Builds the welcome DM embed sent when a player registers for a match or tournament.
 */
export function buildSignupWelcomeEmbed(
  eventName: string,
  gameName: string,
  gameColor: string | null | undefined,
  startDate: string | null | undefined,
  isTournament: boolean,
  playerReminderMinutes: number | null | undefined
): EmbedBuilder {
  const color = parseGameColor(gameColor);
  const eventType = isTournament ? 'Tournament' : 'Match';

  let eventDetails = `${gameName} · ${eventType}`;
  if (startDate) {
    const ts = Math.floor(new Date(startDate).getTime() / 1000);
    if (!isNaN(ts)) eventDetails += ` · <t:${ts}:R>`;
  }

  const whatToExpect: string[] = [];
  if (playerReminderMinutes) {
    whatToExpect.push(`You'll receive a reminder ${playerReminderMinutes} minutes before the event`);
  }
  whatToExpect.push('Team voice channels will be set up for your match');

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎮 You're registered for ${eventName}!`)
    .setDescription('Your registration has been confirmed.')
    .addFields(
      { name: '📅 Event Details', value: eventDetails, inline: false },
      { name: '🤖 Useful Commands', value: '`/matches` · `/tournaments` · `/status` · `/help`', inline: false },
      { name: '⏰ What to Expect', value: whatToExpect.join('\n'), inline: false }
    )
    .setFooter({ text: 'Need help? Use /help in the server' });
}

/**
 * Builds the commander assignment DM embed sent when a player is designated as team commander.
 */
export function buildCommanderAssignedEmbed(
  matchName: string,
  gameName: string,
  gameColor: string | null | undefined,
  teamSide: string | null | undefined
): EmbedBuilder {
  const isBlue = teamSide === 'blue';
  const isRed = teamSide === 'red';
  let color: number;
  if (isBlue) { color = 0x3498db; }
  else if (isRed) { color = 0xe74c3c; }
  else { color = parseGameColor(gameColor); }
  let teamLabel: string;
  if (isBlue) { teamLabel = 'Blue'; }
  else if (isRed) { teamLabel = 'Red'; }
  else { teamLabel = 'Your'; }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('⚔️ You\'ve been assigned as Team Commander')
    .setDescription(`You are the **${teamLabel}** team commander for **${matchName}** (${gameName}).`)
    .addFields(
      {
        name: '📋 Your Responsibilities',
        value: [
          '• You\'ll receive map codes to share with your team',
          '• You\'ll be asked to submit scorecard screenshots after each map',
          '• You\'ll be asked to vote on round winners',
        ].join('\n'),
        inline: false
      },
      { name: '🤖 Useful Commands', value: '`/matches` · `/status`', inline: false }
    )
    .setFooter({ text: 'Contact an admin if you have questions' });
}
