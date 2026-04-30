// @ts-nocheck - Database method calls have complex typing issues
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../../src/lib/logger/server';
import type { AIExtractionResult, GameStatDefinition } from '../../../shared/types';
import { AI_PROVIDER_CALLS } from './providers';
import { resolveModelId } from '../../../src/lib/ai-model-resolver';
import { logFeedEvent } from '../../../src/lib/feed-helpers';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [30000, 60000, 120000]; // 30s, 60s, 120s

export class AIExtractor {
  constructor(private db: unknown) {}

  private async appendLog(submissionId: string, message: string): Promise<void> {
    await this.db.run(
      `UPDATE scorecard_submissions
       SET ai_processing_log = json_insert(COALESCE(ai_processing_log, '[]'), '$[#]', json(?))
       WHERE id = ?`,
      [JSON.stringify({ message, ts: new Date().toISOString() }), submissionId]
    );
  }

  async processSubmission(submissionId: string, queueId: string): Promise<void> {
    try {
      // Mark as processing
      await this.db.run(
        `UPDATE stats_processing_queue SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [queueId]
      );
      await this.db.run(
        `UPDATE scorecard_submissions SET ai_extraction_status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [submissionId]
      );

      // Load submission
      const submission = await this.db.get(
        'SELECT * FROM scorecard_submissions WHERE id = ?',
        [submissionId]
      );
      if (!submission) throw new Error(`Submission ${submissionId} not found`);

      // Load match to get game_id
      const match = await this.db.get(
        'SELECT id, game_id FROM matches WHERE id = ?',
        [submission.match_id]
      );
      if (!match) throw new Error(`Match ${submission.match_id} not found`);

      // Load stat definitions
      const statDefs = await this.db.all(
        'SELECT * FROM game_stat_definitions WHERE game_id = ? ORDER BY sort_order',
        [match.game_id]
      ) as GameStatDefinition[];

      if (!statDefs || statDefs.length === 0) {
        throw new Error(`No stat definitions found for game ${match.game_id}`);
      }

      // Load game name and AI notes
      const game = await this.db.get('SELECT name, ai_screenshot_notes FROM games WHERE id = ?', [match.game_id]);

      // Load settings
      const settings = await this.db.get(
        'SELECT ai_providers_config, ai_api_key, ai_model, google_api_key, openrouter_api_key FROM stats_settings WHERE id = 1'
      );

      const providersConfig = settings?.ai_providers_config
        ? JSON.parse(settings.ai_providers_config)
        : [{ instanceId: 'anthropic-sonnet', providerId: 'anthropic', model: settings?.ai_model || 'sonnet', sortOrder: 0 }];
      const enabledProviders = (providersConfig as Array<{ instanceId: string; providerId: string; model: string; sortOrder: number }>)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      if (enabledProviders.length === 0) throw new Error('No AI providers enabled');

      // Load screenshot
      const publicDir = path.join(process.cwd(), 'public');
      const resolvedImagePath = path.resolve(publicDir, submission.screenshot_url.replace(/^\//, ''));
      if (!resolvedImagePath.startsWith(publicDir + path.sep)) {
        throw new Error(`screenshot_url escapes public directory: ${submission.screenshot_url}`);
      }
      const imagePath = resolvedImagePath;
      if (!fs.existsSync(imagePath)) throw new Error(`Screenshot not found: ${imagePath}`);

      const imageBuffer = fs.readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      const ext = path.extname(submission.screenshot_url).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';

      // Build prompt and try providers in order with fallback
      const prompt = this.buildPrompt(statDefs, game?.name || match.game_id, submission.team_side, game?.ai_screenshot_notes);
      let rawResponse: string | null = null;
      let bestFallback: { response: string; minConfidence: number } | null = null;
      let lastError: Error | null = null;
      for (const provider of enabledProviders) {
        const apiKey = provider.providerId === 'anthropic' ? settings?.ai_api_key
                     : provider.providerId === 'google' ? settings?.google_api_key
                     : settings?.openrouter_api_key;
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

      // Store raw response on submission
      await this.db.run(
        `UPDATE scorecard_submissions SET ai_raw_response = ? WHERE id = ?`,
        [rawResponse, submissionId]
      );

      // Create scorecard_player_stats rows
      for (const player of extractionResult.players) {
        const statId = crypto.randomUUID();
        await this.db.run(
          `INSERT INTO scorecard_player_stats (id, submission_id, match_id, match_game_id, extracted_player_name, team_side, stats_json, confidence_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            statId,
            submissionId,
            submission.match_id,
            submission.match_game_id,
            player.playerName,
            player.teamSide === 'unknown' ? null : player.teamSide,
            JSON.stringify(player.stats),
            player.confidence,
          ]
        );
      }

      // Apply carry-over assignments from previous maps of this match
      await this.applyCarryOverAssignments(submissionId, submission.match_id, submission.match_game_id);

      // Auto-assign participants by name matching (fills remaining unassigned rows)
      await this.autoAssignParticipants(submissionId, submission.match_id, extractionResult.players);

      // If any player stats are still unassigned, log a high-priority feed event so admins know to assign them
      try {
        const unassignedRow = await this.db.get<{ count: number }>(
          `SELECT COUNT(*) as count FROM scorecard_player_stats WHERE submission_id = ? AND assignment_status = 'unassigned'`,
          [submissionId]
        );
        const unassignedCount = unassignedRow?.count ?? 0;
        if (unassignedCount > 0) {
          // Only create one event per match — skip if one already exists
          const existing = await this.db.get(
            `SELECT id FROM activity_feed WHERE event_type = 'scorecard_player_matching_required' AND match_id = ?`,
            [submission.match_id]
          );
          if (!existing) {
            await logFeedEvent({
              eventType: 'scorecard_player_matching_required',
              priority: 2,
              title: 'Scorecard Ready for Player Assignment',
              description: `${unassignedCount} extracted player stat${unassignedCount === 1 ? '' : 's'} waiting to be matched to participants`,
              matchId: submission.match_id,
              metadata: { submissionId, matchGameId: submission.match_game_id, unassignedCount },
            });
          }
        }
      } catch (feedError) {
        logger.error('Error creating scorecard player matching feed event:', feedError);
      }

      // Mark as completed
      await this.db.run(
        `UPDATE scorecard_submissions SET ai_extraction_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [submissionId]
      );
      await this.db.run(
        `UPDATE stats_processing_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [queueId]
      );

      logger.debug(`✅ AI extraction completed for submission ${submissionId}, extracted ${extractionResult.players.length} players`);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`❌ AI extraction failed for submission ${submissionId}:`, message);

      // Get current retry count
      const queueItem = await this.db.get('SELECT retry_count FROM stats_processing_queue WHERE id = ?', [queueId]);
      const retryCount = queueItem?.retry_count || 0;

      if (retryCount < MAX_RETRIES) {
        await this.db.run(
          `UPDATE stats_processing_queue SET status = 'pending', retry_count = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [retryCount + 1, message, queueId]
        );
        await this.db.run(
          `UPDATE scorecard_submissions SET ai_extraction_status = 'retrying', ai_error_message = ? WHERE id = ?`,
          [message, submissionId]
        );
        // Schedule retry after delay
        const delay = RETRY_DELAYS[retryCount] || 120000;
        setTimeout(async () => {
          try {
            await this.db.run(
              `UPDATE stats_processing_queue SET status = 'pending' WHERE id = ? AND status = 'processing'`,
              [queueId]
            );
          } catch (retryErr) {
            logger.error('Failed to reset queue item for retry:', retryErr);
          }
        }, delay);
      } else {
        await this.db.run(
          `UPDATE stats_processing_queue SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [message, queueId]
        );
        await this.db.run(
          `UPDATE scorecard_submissions SET ai_extraction_status = 'failed', ai_error_message = ? WHERE id = ?`,
          [message, submissionId]
        );

        // Log to activity feed — only on final failure after all retries exhausted
        try {
          const sub = await this.db.get('SELECT match_id FROM scorecard_submissions WHERE id = ?', [submissionId]);
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
          });
        } catch (feedError) {
          logger.error('Failed to log AI error feed event:', feedError);
        }
      }
    }
  }

  buildPrompt(statDefs: GameStatDefinition[], gameName: string, teamSide?: string, aiNotes?: string): string {
    const statList = statDefs.map(s => `- ${s.name}: ${s.display_name} (${s.stat_type})`).join('\n');
    const gameSpecificSection = aiNotes
      ? `\nGAME-SPECIFIC NOTES:\n${aiNotes}${teamSide ? `\nThe submitter is on the ${teamSide} team.` : ''}\n`
      : '';
    return `You are analyzing a ${gameName} end-of-match scorecard screenshot.

Extract ALL player statistics visible in the image. For each player, provide:
- playerName: the in-game username exactly as shown
- teamSide: "blue", "red", or "unknown" based on team colors or positioning
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

Return JSON matching this exact structure:
{
  "players": [
    {
      "playerName": "string",
      "teamSide": "blue" | "red" | "unknown",
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

    for (const player of parsed.players) {
      if (!player.playerName || typeof player.playerName !== 'string') return 'player missing playerName';
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
    // Strip markdown fences if present
    let cleaned = rawResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    return JSON.parse(cleaned) as AIExtractionResult;
  }

  async autoAssignParticipants(
    submissionId: string,
    matchId: string,
    players: AIExtractionResult['players']
  ): Promise<void> {
    const participants = await this.db.all(
      'SELECT id, username FROM match_participants WHERE match_id = ?',
      [matchId]
    );
    if (!participants || participants.length === 0) return;

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const player of players) {
      const normalizedExtracted = normalize(player.playerName);
      const matches = participants.filter((p: { username: string }) =>
        normalize(p.username) === normalizedExtracted
      );

      if (matches.length === 1 && player.confidence > 0.7) {
        await this.db.run(
          `UPDATE scorecard_player_stats SET participant_id = ?, assignment_status = 'assigned'
           WHERE submission_id = ? AND extracted_player_name = ? AND assignment_status = 'unassigned'`,
          [matches[0].id, submissionId, player.playerName]
        );
      }
    }
  }

  async applyCarryOverAssignments(
    submissionId: string,
    matchId: string,
    matchGameId: string
  ): Promise<void> {
    // Find the most recent assignment per extracted player name from previous maps of this match
    const previousAssignments = await this.db.all<{ extracted_player_name: string; participant_id: string }>(
      `SELECT sps.extracted_player_name, sps.participant_id
       FROM scorecard_player_stats sps
       INNER JOIN scorecard_submissions ss ON ss.id = sps.submission_id
       WHERE sps.match_id = ?
         AND sps.match_game_id != ?
         AND sps.participant_id IS NOT NULL
       GROUP BY sps.extracted_player_name
       HAVING ss.created_at = MAX(ss.created_at)`,
      [matchId, matchGameId]
    );

    if (!previousAssignments || previousAssignments.length === 0) return;

    for (const prev of previousAssignments) {
      await this.db.run(
        `UPDATE scorecard_player_stats
         SET participant_id = ?, assignment_status = 'assigned'
         WHERE submission_id = ?
           AND extracted_player_name = ?
           AND assignment_status = 'unassigned'`,
        [prev.participant_id, submissionId, prev.extracted_player_name]
      );
    }
  }

}
