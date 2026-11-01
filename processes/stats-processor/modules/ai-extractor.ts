import { logger } from '../../../src/lib/logger/server';
import type { AIExtractionResult, GameStatDefinition } from '../../../shared/types';
import { AI_PROVIDER_CALLS } from './providers';
import { resolveModelId } from '../../../src/lib/ai-model-resolver';
import { hasFeedEvent, insertFeedEvent, logFeedEvent } from '../../../src/lib/feed-helpers';
import { db as pgDb, type Executor } from '../../../lib/db';
import { getBlob } from '../../../lib/storage';
import { completeJob, failJob } from '../../../src/lib/discord-queues';
import { getGameAiNotes, getModeScoringType, listStatDefinitions } from '../../../src/lib/games';
import { bestEffort, getMatch, getMatchTeams, listParticipants, lockMatch } from '../../../src/lib/matches';
import {
  appendProcessingLog, assignByExtractedName, countUnassignedForSubmission, getStatsSettings, getSubmissionById, insertPlayerStats,
  listCarryOverAssignments, parseProvidersConfig, providerApiKey, setExtractionStatus, setRawResponse, setSuggestedPositions,
} from '../../../src/lib/stats';

const MAX_PLAYERS = 64;
const MAX_NAME_LENGTH = 100;
/** Retry backoff for failed extractions: 30s, 60s, 2m (the queue row's max_attempts bounds the retries). */
const RETRY_BACKOFF_BASE_MS = 30_000;

export class AIExtractor {
  /** `ex` holds scorecards, stats settings and the stats_processing_queue (tests inject their own). */
  constructor(private ex: Executor = pgDb) {}

  private async appendLog(submissionId: string, message: string): Promise<void> {
    await appendProcessingLog(this.ex, submissionId, message);
  }

  async processSubmission(submissionId: string, queueId: string): Promise<void> {
    try {
      // The queue row was claimed (status 'processing') by the stats-processor before this call
      await setExtractionStatus(this.ex, submissionId, 'processing');

      const submission = await getSubmissionById(this.ex, submissionId);
      if (!submission) throw new Error(`Submission ${submissionId} not found`);

      // Load match to get game_id and scoring_type
      const match = await getMatch(this.ex, submission.match_id);
      if (!match) throw new Error(`Match ${submission.match_id} not found`);
      const scoringType: string = (match.mode_id ? await getModeScoringType(this.ex, match.game_id, match.mode_id) : undefined) ?? 'Normal';

      // Load stat definitions
      const statDefs = await listStatDefinitions(this.ex, match.game_id) as GameStatDefinition[];

      if (!statDefs || statDefs.length === 0) {
        throw new Error(`No stat definitions found for game ${match.game_id}`);
      }

      // Load game name and AI notes
      const game = await getGameAiNotes(this.ex, match.game_id);

      // Load settings
      const settings = await getStatsSettings(this.ex);

      const enabledProviders = [...(parseProvidersConfig(settings?.ai_providers_config)
        ?? [{ instanceId: 'anthropic-sonnet', providerId: 'anthropic', model: settings?.ai_model || 'sonnet', sortOrder: 0 }])]
        .sort((a, b) => a.sortOrder - b.sortOrder);

      if (enabledProviders.length === 0) throw new Error('No AI providers enabled');

      // Load screenshot
      const screenshot = await getBlob(submission.screenshot_url, this.ex);
      if (!screenshot) throw new Error(`Screenshot not found: ${submission.screenshot_url}`);
      const imageBase64 = screenshot.data.toString('base64');
      const mimeType = screenshot.content_type.startsWith('image/') ? screenshot.content_type : 'image/jpeg';

      // Build prompt and try providers in order with fallback
      const prompt = this.buildPrompt(statDefs, game?.name || match.game_id, submission.team_side, game?.ai_screenshot_notes ?? undefined, scoringType);
      let rawResponse: string | null = null;
      let bestFallback: { response: string; minConfidence: number } | null = null;
      let lastError: Error | null = null;
      for (const provider of enabledProviders) {
        const apiKey = providerApiKey(settings, provider.providerId);
        if (!apiKey) continue;
        const callProvider = AI_PROVIDER_CALLS[provider.providerId];
        if (!callProvider) { lastError = new Error(`Unknown provider: ${provider.providerId}`); continue; }
        try {
          const candidateResponse = await callProvider(apiKey, resolveModelId(provider.providerId, provider.model), imageBase64, mimeType, prompt);
          const validationError = this.validateExtractionResponse(candidateResponse);
          if (validationError) {
            lastError = new Error(`Provider ${provider.instanceId} returned unusable data: ${validationError}`);
            logger.warning(`Provider ${provider.instanceId} returned unusable data (${validationError}), trying next provider`);
            await this.appendLog(submissionId, `Provider ${provider.instanceId}: unusable data (${validationError}), trying next provider`);
            continue;
          }
          const minConfidence = this.getMinPlayerConfidence(candidateResponse);
          if (minConfidence >= 0.8) {
            rawResponse = candidateResponse;
            break;
          } else if (minConfidence >= 0.5) {
            logger.info(`Provider ${provider.instanceId} returned confidence ${minConfidence.toFixed(2)}, trying next provider for better result`);
            await this.appendLog(submissionId, `Provider ${provider.instanceId}: confidence ${minConfidence.toFixed(2)}, trying next provider for better result`);
            if (!bestFallback || minConfidence > bestFallback.minConfidence) {
              bestFallback = { response: candidateResponse, minConfidence };
            }
          } else {
            lastError = new Error(`Provider ${provider.instanceId} returned low confidence: ${minConfidence.toFixed(2)}`);
            logger.warning(`Provider ${provider.instanceId} returned confidence below 0.5 (${minConfidence.toFixed(2)}), trying next provider`);
            await this.appendLog(submissionId, `Provider ${provider.instanceId}: confidence below 0.5 (${minConfidence.toFixed(2)}), trying next provider`);
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          logger.warning(`Provider ${provider.providerId} failed, trying next: ${lastError.message}`);
          await this.appendLog(submissionId, `Provider ${provider.providerId}: failed (${lastError.message}), trying next`);
        }
      }
      if (!rawResponse && bestFallback) {
        logger.info(`No provider reached 0.8 confidence; using best available result (min confidence: ${bestFallback.minConfidence.toFixed(2)})`);
        await this.appendLog(submissionId, `No provider reached 0.8 confidence; using best available result (min confidence: ${bestFallback.minConfidence.toFixed(2)})`);
        rawResponse = bestFallback.response;
      }
      if (!rawResponse) throw lastError ?? new Error('No configured providers succeeded');

      // Parse response
      const extractionResult = this.parseExtractionResult(rawResponse);

      // Resolve team_side ('blue'/'red') to the match's real match_teams.id
      // (team_order 0/1) — team_id is the new authoritative FK that replaces
      // team_side's role; team_side is kept for legacy display only.
      const teamIdBySide = scoringType === 'Normal'
        ? await this.resolveNormalTeamIds(submission.match_id)
        : null;

      // Everything the extraction produced is stored in ONE transaction under the match lock: a failure rolls back (a
      // retry cannot leave duplicate player rows behind) and concurrent extractions for one match cannot both create
      // the "players need matching" feed event.
      await this.ex.transaction(async (tx) => {
        await lockMatch(tx, submission.match_id);
        await setRawResponse(tx, submissionId, rawResponse as string);

        await insertPlayerStats(tx, extractionResult.players.map((player) => {
          const teamSide = player.teamSide === 'unknown' || !player.teamSide ? null : player.teamSide;
          return {
            submissionId, matchId: submission.match_id, matchGameId: submission.match_game_id, playerName: player.playerName,
            teamSide, teamId: teamSide && teamIdBySide ? (teamIdBySide[teamSide] ?? null) : null,
            stats: player.stats, confidence: player.confidence,
          };
        }));

        // Store extracted positions for FFA/Position modes as a suggestion only
        // (pre-fills the Position scoring UI; an admin must confirm).
        if (scoringType !== 'Normal' && extractionResult.playerPositions) {
          const positions = extractionResult.playerPositions;
          await bestEffort(tx, 'Error storing AI position suggestion', (sp) => this.storeSuggestedPositions(sp, submissionId, submission.match_id, positions), undefined);
        }

        // Apply carry-over assignments from previous maps of this match
        await this.applyCarryOverAssignments(submissionId, submission.match_id, submission.match_game_id, tx);

        // Auto-assign participants by name matching (fills remaining unassigned rows)
        await this.autoAssignParticipants(submissionId, submission.match_id, extractionResult.players, tx);

        // If any player stats are still unassigned, log a high-priority feed event so admins know to assign them
        // (one event per match: the existence check runs under the match lock)
        const unassigned = await countUnassignedForSubmission(tx, submissionId);
        if (unassigned > 0) {
          await bestEffort(tx, 'Error creating scorecard player matching feed event', async (sp) => {
            if (await hasFeedEvent(sp, 'scorecard_player_matching_required', submission.match_id)) return;
            await insertFeedEvent(sp, {
              eventType: 'scorecard_player_matching_required',
              priority: 2,
              title: 'Scorecard Ready for Player Assignment',
              description: `${unassigned} extracted player stat${unassigned === 1 ? '' : 's'} waiting to be matched to participants`,
              matchId: submission.match_id,
              metadata: { submissionId, matchGameId: submission.match_game_id, unassignedCount: unassigned },
            });
          }, undefined);
        }

        await setExtractionStatus(tx, submissionId, 'completed');
        await completeJob(tx, 'statsProcessing', queueId);
      });

      logger.debug(`✅ AI extraction completed for submission ${submissionId}, extracted ${extractionResult.players.length} players`);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`❌ AI extraction failed for submission ${submissionId}:`, message);

      // Back to 'pending' with backoff while attempts remain, otherwise 'failed'
      const outcome = await failJob(this.ex, 'statsProcessing', queueId, message, { backoffBaseMs: RETRY_BACKOFF_BASE_MS });

      if (outcome === 'pending') {
        await setExtractionStatus(this.ex, submissionId, 'retrying', message);
      } else if (outcome === 'failed') {
        await setExtractionStatus(this.ex, submissionId, 'failed', message);

        // Log to activity feed — only on final failure after all retries exhausted
        const sub = await getSubmissionById(this.ex, submissionId).catch(() => undefined);
        await logFeedEvent({
          eventType: 'ai_error',
          priority: 2,
          title: 'AI Processing Error',
          description: `Scorecard extraction failed after all retries`,
          matchId: sub?.match_id ?? undefined,
          metadata: {
            submissionId,
            error: message.substring(0, 200),
          },
        }, this.ex);
      }
    }
  }

  private async resolveNormalTeamIds(matchId: string): Promise<Record<string, string>> {
    const teams = (await getMatchTeams(this.ex, matchId)).filter(t => !t.is_reserve).slice(0, 2);
    const bySide: Record<string, string> = {};
    for (const t of teams) {
      if (t.team_order === 0) bySide.blue = t.id;
      else if (t.team_order === 1) bySide.red = t.id;
    }
    return bySide;
  }

  buildPrompt(statDefs: GameStatDefinition[], gameName: string, teamSide?: string, aiNotes?: string, scoringType = 'Normal'): string {
    const statList = statDefs.map(s => `- ${s.name}: ${s.display_name} (${s.stat_type})`).join('\n');
    const gameSpecificSection = aiNotes
      ? `\nGAME-SPECIFIC NOTES:\n${aiNotes}${teamSide ? `\nThe submitter is on the ${teamSide} team.` : ''}\n`
      : '';

    const isPositionBased = scoringType === 'Position' || scoringType === 'FFA';
    const positionInstruction = isPositionBased
      ? `- position: the player's finishing position/rank (1 = first place). Include this for ALL players.`
      : `- teamSide: "blue", "red", or "unknown" based on team colors or positioning`;

    const positionSchema = isPositionBased
      ? `      "position": number,`
      : `      "teamSide": "blue" | "red" | "unknown",`;

    const positionNote = isPositionBased
      ? `- This is a ${scoringType} mode — extract finishing positions/ranks for ALL players\n- position 1 = winner/first place`
      : ``;

    return `You are analyzing a ${gameName} end-of-match scorecard screenshot.

Extract ALL player statistics visible in the image. For each player, provide:
- playerName: the in-game username exactly as shown
${positionInstruction}
- stats: an object with the following fields (use 0 if not visible):
${statList}
- confidence: a number from 0 to 1 indicating how confident you are in the extraction

Also extract if visible:
- mapName: the name of the map played
- gameResult: { team1Score, team2Score, winner: "team1" or "team2" }
${gameSpecificSection}
IMPORTANT RULES:
- Return ONLY the JSON object — no markdown, no explanation, no extra text before or after
- Normalize numbers: "12.5K" → 12500, "1.2M" → 1200000
- For decimal stats (like KDA), keep as decimal number
- If a stat is not visible for a player, use 0
${positionNote}

Return JSON matching this exact structure:
{
  "players": [
    {
      "playerName": "string",
${positionSchema}
      "stats": { ${statDefs.map(s => `"${s.name}": number`).join(', ')} },
      "confidence": number
    }
  ],
  "mapName": "string or null",
  "gameResult": {
    "team1Score": number or null,
    "team2Score": number or null,
    "winner": "team1" | "team2" | null
  }
}`;
  }

  validateExtractionResponse(rawResponse: string): string | null {
    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    let parsed: AIExtractionResult;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return 'invalid JSON';
    }

    if (!Array.isArray(parsed.players)) return 'players is not an array';
    if (parsed.players.length === 0) return 'players array is empty';
    if (parsed.players.length > MAX_PLAYERS) return 'too many players';

    for (const player of parsed.players) {
      if (!player.playerName || typeof player.playerName !== 'string') return 'player missing playerName';
      if (player.playerName.length > MAX_NAME_LENGTH) return 'playerName too long';
      if (!player.stats || typeof player.stats !== 'object' || Array.isArray(player.stats)) return 'player missing stats object';

      for (const val of Object.values(player.stats)) {
        if (typeof val !== 'number' || !isFinite(val)) return 'non-numeric stat value';
      }

      if (typeof player.confidence !== 'number') return 'missing confidence';
    }

    return null;
  }

  private getMinPlayerConfidence(rawResponse: string): number {
    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed: AIExtractionResult = JSON.parse(cleaned);
    return Math.min(...parsed.players.map(p => typeof p.confidence === 'number' ? p.confidence : 0));
  }

  parseExtractionResult(rawResponse: string): AIExtractionResult {
    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const result = JSON.parse(cleaned) as AIExtractionResult;

    // Populate playerPositions index from per-player position field
    const hasPositions = result.players.some(p => typeof p.position === 'number');
    if (hasPositions) {
      result.playerPositions = {};
      for (const player of result.players) {
        if (typeof player.position === 'number' && !(player.playerName in result.playerPositions)) {
          result.playerPositions[player.playerName] = player.position;
        }
      }
    }

    return result;
  }

  /**
   * Validate AI-extracted finishing positions and map them to this match's
   * participants. AI output is untrusted (a doctored screenshot can say
   * anything), so this only ever produces a *suggestion*: strict shape checks,
   * positive unique integers, and only participants of this match. Returns
   * null when nothing usable remains.
   */
  buildSuggestedPositions(
    playerPositions: unknown,
    participants: Array<{ id: string; username: string }>
  ): Record<string, number> | null {
    if (!playerPositions || typeof playerPositions !== 'object' || Array.isArray(playerPositions)) return null;

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const suggestion: Record<string, number> = {};
    const usedPositions = new Set<number>();

    for (const [playerName, position] of Object.entries(playerPositions as Record<string, unknown>)) {
      if (typeof position !== 'number' || !Number.isInteger(position) || position < 1 || position > MAX_PLAYERS) return null;
      if (usedPositions.has(position)) return null; // duplicate rank: ambiguous, discard the lot

      const normalizedName = normalize(String(playerName).slice(0, MAX_NAME_LENGTH));
      if (!normalizedName) continue;
      const matched = participants.filter(p => normalize(p.username) === normalizedName);
      if (matched.length !== 1) continue; // unknown or ambiguous name
      if (suggestion[matched[0].id] !== undefined) return null; // two extracted names -> same participant

      suggestion[matched[0].id] = position;
      usedPositions.add(position);
    }

    return Object.keys(suggestion).length > 0 ? suggestion : null;
  }

  /** Throws on failure; callers run it in a savepoint (`bestEffort`). Never writes official results. */
  private async storeSuggestedPositions(
    ex: Executor,
    submissionId: string,
    matchId: string,
    playerPositions: Record<string, number>
  ): Promise<void> {
    const participants = await listParticipants(ex, matchId);
    if (!participants || participants.length === 0) return;

    const suggestion = this.buildSuggestedPositions(playerPositions, participants);
    if (!suggestion) {
      logger.warning(`AI positions for submission ${submissionId} were unusable; no suggestion stored`);
      return;
    }

    // An admin confirms via the Position scoring UI.
    await setSuggestedPositions(ex, submissionId, suggestion);
    logger.debug(`Stored AI position suggestion for submission ${submissionId}`);
  }

  async autoAssignParticipants(
    submissionId: string,
    matchId: string,
    players: AIExtractionResult['players'],
    ex: Executor = this.ex
  ): Promise<void> {
    const participants = await listParticipants(ex, matchId);
    if (!participants || participants.length === 0) return;

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const player of players) {
      const normalizedExtracted = normalize(player.playerName);
      const matches = participants.filter((p: { username: string }) =>
        normalize(p.username) === normalizedExtracted
      );

      if (matches.length === 1 && player.confidence > 0.7) {
        await assignByExtractedName(ex, submissionId, player.playerName, matches[0].id);
      }
    }
  }

  async applyCarryOverAssignments(
    submissionId: string,
    matchId: string,
    matchGameId: string,
    ex: Executor = this.ex
  ): Promise<void> {
    // The most recent assignment per extracted player name from previous maps of this match
    const previousAssignments = await listCarryOverAssignments(ex, matchId, matchGameId);
    for (const prev of previousAssignments) {
      await assignByExtractedName(ex, submissionId, prev.extracted_player_name, prev.participant_id);
    }
  }

}
