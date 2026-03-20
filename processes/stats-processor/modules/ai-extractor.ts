// @ts-nocheck - Database method calls have complex typing issues
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../../src/lib/logger/server';
import type { AIExtractionResult, GameStatDefinition } from '../../../shared/types';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [30000, 60000, 120000]; // 30s, 60s, 120s

export class AIExtractor {
  constructor(private db: unknown) {}

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

      // Load game name
      const game = await this.db.get('SELECT name FROM games WHERE id = ?', [match.game_id]);

      // Load settings
      const settings = await this.db.get(
        'SELECT ai_providers_config, ai_api_key, ai_model, google_api_key FROM stats_settings WHERE id = 1'
      );

      const providersConfig = settings?.ai_providers_config
        ? JSON.parse(settings.ai_providers_config)
        : [{ id: 'anthropic', enabled: true, model: settings?.ai_model || 'claude-sonnet-4-20250514', sortOrder: 0 }];
      const enabledProviders = (providersConfig as Array<{ id: string; model: string; enabled: boolean; sortOrder: number }>)
        .filter(p => p.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      if (enabledProviders.length === 0) throw new Error('No AI providers enabled');

      // Load screenshot
      const imagePath = path.join(process.cwd(), 'public', submission.screenshot_url);
      if (!fs.existsSync(imagePath)) throw new Error(`Screenshot not found: ${imagePath}`);

      const imageBuffer = fs.readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      const ext = path.extname(submission.screenshot_url).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';

      // Build prompt and try providers in order with fallback
      const prompt = this.buildPrompt(statDefs, game?.name || match.game_id);
      let rawResponse: string | null = null;
      let lastError: Error | null = null;
      for (const provider of enabledProviders) {
        const apiKey = provider.id === 'anthropic' ? settings?.ai_api_key : settings?.google_api_key;
        if (!apiKey) continue;
        try {
          rawResponse = provider.id === 'google'
            ? await this.callGeminiVisionAPI(apiKey, provider.model, imageBase64, mimeType, prompt)
            : await this.callClaudeVisionAPI(apiKey, provider.model, imageBase64, mimeType, prompt);
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          logger.warning(`Provider ${provider.id} failed, trying next: ${lastError.message}`);
        }
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
          `INSERT INTO scorecard_player_stats (id, submission_id, match_id, match_game_id, extracted_player_name, extracted_hero, team_side, stats_json, confidence_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            statId,
            submissionId,
            submission.match_id,
            submission.match_game_id,
            player.playerName,
            player.hero || null,
            player.teamSide === 'unknown' ? null : player.teamSide,
            JSON.stringify(player.stats),
            player.confidence,
          ]
        );
      }

      // Auto-assign participants by name matching
      await this.autoAssignParticipants(submissionId, submission.match_id, extractionResult.players);

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

      // Check both-sides auto-advance
      await this.checkBothSidesAndAutoAdvance(submission.match_id, submission.match_game_id);

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
          await this.db.run(
            `UPDATE stats_processing_queue SET status = 'pending' WHERE id = ? AND status = 'processing'`,
            [queueId]
          );
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
      }
    }
  }

  buildPrompt(statDefs: GameStatDefinition[], gameName: string): string {
    const statList = statDefs.map(s => `- ${s.name}: ${s.display_name} (${s.stat_type})`).join('\n');
    return `You are analyzing a ${gameName} end-of-match scorecard screenshot.

Extract ALL player statistics visible in the image. For each player, provide:
- playerName: the in-game username exactly as shown
- hero: the character/hero they played (if visible)
- teamSide: "blue", "red", or "unknown" based on team colors or positioning
- stats: an object with the following fields (use 0 if not visible):
${statList}
- confidence: a number from 0 to 1 indicating how confident you are in the extraction

Also extract if visible:
- mapName: the name of the map played
- gameResult: { team1Score, team2Score, winner: "team1" or "team2" }

IMPORTANT RULES:
- Return ONLY valid JSON, no markdown fences or explanation
- Normalize numbers: "12.5K" → 12500, "1.2M" → 1200000
- For decimal stats (like KDA), keep as decimal number
- If a stat is not visible for a player, use 0

Return JSON matching this exact structure:
{
  "players": [
    {
      "playerName": "string",
      "hero": "string or null",
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

  async callClaudeVisionAPI(
    apiKey: string,
    model: string,
    imageBase64: string,
    mimeType: string,
    prompt: string
  ): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    return data.content[0]?.text || '';
  }

  async callGeminiVisionAPI(
    apiKey: string,
    model: string,
    imageBase64: string,
    mimeType: string,
    prompt: string
  ): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              { text: prompt },
            ],
          }],
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
           WHERE submission_id = ? AND extracted_player_name = ?`,
          [matches[0].id, submissionId, player.playerName]
        );
      }
    }
  }

  async checkBothSidesAndAutoAdvance(matchId: string, matchGameId: string): Promise<void> {
    const settings = await this.db.get(
      'SELECT both_sides_required, auto_advance_on_match FROM stats_settings WHERE id = 1'
    );
    if (!settings?.both_sides_required) return;

    // Check if we have completed submissions for both sides
    const blueSubmission = await this.db.get(
      `SELECT * FROM scorecard_submissions WHERE match_id = ? AND match_game_id = ? AND team_side = 'blue' AND ai_extraction_status = 'completed'`,
      [matchId, matchGameId]
    );
    const redSubmission = await this.db.get(
      `SELECT * FROM scorecard_submissions WHERE match_id = ? AND match_game_id = ? AND team_side = 'red' AND ai_extraction_status = 'completed'`,
      [matchId, matchGameId]
    );

    if (!blueSubmission || !redSubmission) return;

    // Load player stats for each submission
    const blueStats = await this.db.all(
      'SELECT * FROM scorecard_player_stats WHERE submission_id = ?',
      [blueSubmission.id]
    );
    const redStats = await this.db.all(
      'SELECT * FROM scorecard_player_stats WHERE submission_id = ?',
      [redSubmission.id]
    );

    // Compare stats between submissions
    let allMatch = true;
    const allPlayers = [...(blueStats || []), ...(redStats || [])];

    // Find matching players between the two submissions (by team_side + name)
    for (const stat of blueStats || []) {
      const matchInRed = (redStats || []).find(
        (r: { extracted_player_name: string; team_side: string }) =>
          r.extracted_player_name === stat.extracted_player_name &&
          r.team_side === stat.team_side
      );
      if (!matchInRed) continue;

      try {
        const blueStatValues = JSON.parse(stat.stats_json);
        const redStatValues = JSON.parse(matchInRed.stats_json);
        for (const key of Object.keys(blueStatValues)) {
          if (Math.round(blueStatValues[key]) !== Math.round(redStatValues[key] || 0)) {
            allMatch = false;
            logger.debug(`📊 Stat mismatch for ${stat.extracted_player_name}.${key}: ${blueStatValues[key]} vs ${redStatValues[key]}`);
          }
        }
      } catch {
        allMatch = false;
      }
    }

    if (allMatch && allPlayers.length > 0) {
      logger.debug(`✅ Both sides match for match ${matchId} game ${matchGameId} — auto-approving`);
      await this.db.run(
        `UPDATE scorecard_submissions SET review_status = 'auto_approved' WHERE id IN (?, ?)`,
        [blueSubmission.id, redSubmission.id]
      );

      // Auto-advance if enabled
      if (settings.auto_advance_on_match) {
        try {
          const blueRaw = JSON.parse(blueSubmission.ai_raw_response || '{}') as AIExtractionResult;
          if (blueRaw.gameResult?.winner) {
            const { saveMatchResult } = await import('../../../src/lib/scoring-functions');
            // Determine winner team based on team_side mapping
            const blueTeam = await this.db.get(
              `SELECT team_assignment FROM match_participants WHERE match_id = ? AND team_assignment = 'blue' LIMIT 1`,
              [matchId]
            );
            const winner = blueRaw.gameResult.winner === 'team1' ? (blueTeam ? 'blue' : 'red') : (blueTeam ? 'red' : 'blue');
            await saveMatchResult(matchId, matchGameId, winner, null);
          }
        } catch (err) {
          logger.error('Error auto-advancing match after both-sides match:', err);
        }
      }
    } else if (!allMatch) {
      logger.debug(`⚠️ Stat mismatch between sides for match ${matchId} game ${matchGameId} — flagging for manual review`);
    }
  }
}
