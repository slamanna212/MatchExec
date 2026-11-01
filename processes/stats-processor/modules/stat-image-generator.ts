import crypto from 'crypto';
import { logger } from '../../../src/lib/logger/server';
import type { GameStatDefinition } from '../../../shared/types';
import { db as pgDb, type Executor } from '../../../lib/db';
import { putBlob } from '../../../lib/storage';
import { completeJob, failJob } from '../../../src/lib/discord-queues';
import { getModeScoringType, listStatDefinitions } from '../../../src/lib/games';
import { getMatch, lockMatch } from '../../../src/lib/matches';
import { aggregateMatchStats, listStatImageRows, setStatImageUrl } from '../../../src/lib/stats';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Pick a display color for a player's team. Teams 1/2 keep the classic
 * blue/red; 3+ teams use their match_teams.team_color (when it is a valid hex).
 */
function resolveTeamColor(stat: { team_assignment?: unknown; team_color?: unknown }): string {
  if (stat.team_assignment === 'blue') return '#5b9bd5';
  if (stat.team_assignment === 'red') return '#e06c75';
  if (typeof stat.team_color === 'string' && HEX_COLOR.test(stat.team_color)) return stat.team_color;
  return '#8a6fd8';
}

const sideOf = (team: { team_order: number | null; is_reserve: boolean | null }): string | null =>
  team.team_order === null ? null : team.is_reserve ? 'reserve' : team.team_order === 0 ? 'blue' : team.team_order === 1 ? 'red' : null;

export class StatImageGenerator {
  /** `ex` holds the stats tables, matches / participants and the stats_image_queue (tests inject their own). */
  constructor(private ex: Executor = pgDb) {}

  async generateMatchStatImages(queueId: string, matchId: string): Promise<void> {
    try {
      // The queue row was claimed (status 'processing') by the stats-processor before this call

      // Aggregate stats first (under the match lock, so it cannot interleave with a review's aggregation)
      await this.ex.transaction(async (tx) => {
        await lockMatch(tx, matchId);
        await aggregateMatchStats(tx, matchId);
      });

      // Load aggregated stats with each player's name and team
      const matchStats = (await listStatImageRows(this.ex, matchId)).map((row) => ({
        ...row,
        team_assignment: sideOf(row),
      })) as Array<Record<string, any>>;

      if (matchStats.length === 0) {
        await completeJob(this.ex, 'statsImage', queueId);
        return;
      }

      // Load game stat definitions + scoring_type (Normal shows a Team column;
      // FFA/Position have no meaningful team_assignment, so that column and
      // its blue/red coloring would be nonsensical for them).
      const match = await getMatch(this.ex, matchId);
      const scoringType: string = (match?.mode_id ? await getModeScoringType(this.ex, match.game_id, match.mode_id) : undefined) ?? 'Normal';
      const statDefs = match ? await listStatDefinitions(this.ex, match.game_id) as GameStatDefinition[] : [];

      try {
        // Generate team stat image
        const teamImagePath = await this.generateTeamStatImage(matchId, matchStats, statDefs, scoringType);
        logger.debug(`🖼️ Generated team stat image: ${teamImagePath}`);

        // Generate individual player images
        for (const playerStat of matchStats) {
          const playerImagePath = await this.generatePlayerStatImage(matchId, playerStat, statDefs, scoringType);
          if (playerImagePath) {
            await setStatImageUrl(this.ex, playerStat.id, playerImagePath);
          }
        }
      } catch (imageError) {
        logger.error('Error generating images (canvas may not be available):', imageError);
        // Don't fail — just mark as completed without images
      }

      await completeJob(this.ex, 'statsImage', queueId);

      logger.debug(`✅ Stat image generation completed for match ${matchId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Image generation failed for match ${matchId}:`, message);
      // Back to 'pending' with backoff while attempts remain, otherwise 'failed'
      await failJob(this.ex, 'statsImage', queueId, message);
    }
  }

  /** Store a rendered image as a blob (same URL shape as before; regenerating replaces the file). */
  private async saveImage(matchId: string, filename: string, data: Buffer): Promise<string> {
    const imageUrl = `/uploads/stats/${matchId}/${filename}`;
    await putBlob(this.ex, { path: imageUrl, kind: 'stat-image', contentType: 'image/png', data, filename, owner: { type: 'match', id: matchId } });
    return imageUrl;
  }

  private async generateTeamStatImage(
    matchId: string,
    matchStats: unknown[],
    statDefs: GameStatDefinition[],
    scoringType = 'Normal'
  ): Promise<string | null> {
    try {
      // Dynamically import @napi-rs/canvas
      const { createCanvas } = await import('@napi-rs/canvas');

      // Normal matches show a Team column (blue/red); FFA/Position have no
      // meaningful team_assignment, so that column is dropped for them and
      // the stat columns shift left to fill the space.
      const showTeamColumn = scoringType === 'Normal';
      const statsStartX = showTeamColumn ? 300 : 220;

      const width = 1200;
      const height = Math.max(600, 200 + matchStats.length * 60);
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);

      // Header
      ctx.fillStyle = '#e94560';
      ctx.fillRect(0, 0, width, 60);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Match Stats', width / 2, 40);

      // Column headers
      const primaryStats = statDefs.filter(s => s.is_primary).slice(0, 5);
      const colWidth = (width - statsStartX) / Math.max(primaryStats.length, 1);

      ctx.fillStyle = '#a0a0a0';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Player', 20, 90);
      if (showTeamColumn) ctx.fillText('Team', 200, 90);
      primaryStats.forEach((stat, i) => {
        ctx.textAlign = 'center';
        ctx.fillText(stat.display_name, statsStartX + colWidth * i + colWidth / 2, 90);
      });

      // Player rows
      for (let i = 0; i < matchStats.length; i++) {
        const stat = matchStats[i] as Record<string, unknown>;
        const y = 120 + i * 50;
        const bg = i % 2 === 0 ? '#16213e' : '#0f3460';
        ctx.fillStyle = bg;
        ctx.fillRect(0, y - 20, width, 50);

        ctx.fillStyle = '#ffffff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(String(stat.username || ''), 20, y + 10);

        if (showTeamColumn) {
          ctx.fillStyle = resolveTeamColor(stat);
          ctx.fillText(String(stat.team_assignment || stat.team_name || '').toUpperCase().slice(0, 12), 200, y + 10);
        }

        const statsObj = (stat.total_stats_json ?? {}) as Record<string, number>;

        ctx.fillStyle = '#ffffff';
        primaryStats.forEach((s, j) => {
          ctx.textAlign = 'center';
          const val = statsObj[s.name] || 0;
          const display = s.format === 'thousands' && val >= 1000
            ? `${(val / 1000).toFixed(1)}K`
            : s.format === 'decimal'
            ? val.toFixed(2)
            : String(Math.round(val));
          ctx.fillText(display, statsStartX + colWidth * j + colWidth / 2, y + 10);
        });
      }

      // Footer
      ctx.fillStyle = '#4a4a6a';
      ctx.fillRect(0, height - 30, width, 30);
      ctx.fillStyle = '#a0a0a0';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MatchExec', width / 2, height - 10);

      return await this.saveImage(matchId, 'team.png', canvas.toBuffer('image/png'));
    } catch {
      return null;
    }
  }

  private async generatePlayerStatImage(
    matchId: string,
    playerStat: Record<string, unknown>,
    statDefs: GameStatDefinition[],
    scoringType = 'Normal'
  ): Promise<string | null> {
    try {
      const { createCanvas } = await import('@napi-rs/canvas');

      const width = 800;
      const height = 400;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);

      // Header bar — team_assignment only means blue/red for Normal matches;
      // FFA/Position use a neutral accent since there's no team to color by.
      const headerColor = scoringType === 'Normal'
        ? resolveTeamColor(playerStat)
        : '#8a6fd8';
      ctx.fillStyle = headerColor;
      ctx.fillRect(0, 0, width, 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(playerStat.username || 'Unknown Player'), width / 2, 40);

      // Stats grid
      const statsObj = (playerStat.total_stats_json ?? {}) as Record<string, number>;

      const cols = 3;
      const colWidth = width / cols;
      const rowHeight = 70;
      const startY = 100;

      statDefs.forEach((stat, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * colWidth + colWidth / 2;
        const y = startY + row * rowHeight;

        ctx.fillStyle = '#a0a0a0';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(stat.display_name, x, y);

        const val = statsObj[stat.name] || 0;
        const display = stat.format === 'thousands' && val >= 1000
          ? `${(val / 1000).toFixed(1)}K`
          : stat.format === 'decimal'
          ? val.toFixed(2)
          : String(Math.round(val));

        ctx.fillStyle = stat.is_primary ? '#ffffff' : '#c0c0c0';
        ctx.font = `bold ${stat.is_primary ? '22' : '18'}px sans-serif`;
        ctx.fillText(display, x, y + 25);
      });

      // Maps played
      ctx.fillStyle = '#666688';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Maps Played: ${playerStat.maps_played || 0}`, width / 2, height - 20);

      // Footer
      ctx.fillStyle = '#4a4a6a';
      ctx.fillRect(0, height - 30, width, 30);

      const participantId = String(playerStat.participant_id || crypto.randomUUID());
      const filename = `${participantId}.png`;
      return await this.saveImage(matchId, filename, canvas.toBuffer('image/png'));
    } catch {
      return null;
    }
  }
}
