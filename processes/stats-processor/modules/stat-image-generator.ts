// @ts-nocheck - Database method calls have complex typing issues
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../../src/lib/logger/server';
import type { GameStatDefinition } from '../../../shared/types';

export class StatImageGenerator {
  constructor(private db: unknown) {}

  async generateMatchStatImages(queueId: string, matchId: string): Promise<void> {
    try {
      await this.db.run(
        `UPDATE stats_image_queue SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [queueId]
      );

      // Aggregate stats first
      await this.aggregateStats(matchId);

      // Load aggregated stats
      const matchStats = await this.db.all(
        `SELECT mps.*, mp.username, mp.team_assignment
         FROM match_player_stats mps
         JOIN match_participants mp ON mp.id = mps.participant_id
         WHERE mps.match_id = ?`,
        [matchId]
      );

      if (!matchStats || matchStats.length === 0) {
        await this.db.run(
          `UPDATE stats_image_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [queueId]
        );
        return;
      }

      // Load game stat definitions
      const match = await this.db.get('SELECT game_id FROM matches WHERE id = ?', [matchId]);
      const statDefs = match ? await this.db.all(
        'SELECT * FROM game_stat_definitions WHERE game_id = ? ORDER BY sort_order',
        [match.game_id]
      ) as GameStatDefinition[] : [];

      // Ensure output dir exists
      const outputDir = path.join(process.cwd(), 'public', 'uploads', 'stats', matchId);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      try {
        // Generate team stat image
        const teamImagePath = await this.generateTeamStatImage(matchId, matchStats, statDefs, outputDir);
        logger.debug(`🖼️ Generated team stat image: ${teamImagePath}`);

        // Generate individual player images
        for (const playerStat of matchStats) {
          const playerImagePath = await this.generatePlayerStatImage(
            matchId,
            playerStat,
            statDefs,
            outputDir
          );
          if (playerImagePath) {
            await this.db.run(
              `UPDATE match_player_stats SET stat_image_url = ? WHERE id = ?`,
              [playerImagePath, playerStat.id]
            );
          }
        }
      } catch (imageError) {
        logger.error('Error generating images (canvas may not be available):', imageError);
        // Don't fail — just mark as completed without images
      }

      await this.db.run(
        `UPDATE stats_image_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [queueId]
      );

      logger.debug(`✅ Stat image generation completed for match ${matchId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Image generation failed for match ${matchId}:`, message);
      await this.db.run(
        `UPDATE stats_image_queue SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [message, queueId]
      );
    }
  }

  private async aggregateStats(matchId: string): Promise<void> {
    const playerStats = await this.db.all(
      `SELECT sps.* FROM scorecard_player_stats sps
       JOIN scorecard_submissions ss ON ss.id = sps.submission_id
       WHERE sps.match_id = ? AND ss.review_status IN ('approved', 'auto_approved')
       AND sps.participant_id IS NOT NULL`,
      [matchId]
    );

    if (!playerStats || playerStats.length === 0) return;

    const participantStats = new Map<string, { totalStats: Record<string, number>; mapsPlayed: Set<string> }>();

    for (const stat of playerStats) {
      if (!stat.participant_id) continue;
      if (!participantStats.has(stat.participant_id)) {
        participantStats.set(stat.participant_id, { totalStats: {}, mapsPlayed: new Set() });
      }
      const entry = participantStats.get(stat.participant_id)!;
      entry.mapsPlayed.add(stat.match_game_id);
      try {
        const stats = JSON.parse(stat.stats_json) as Record<string, number>;
        for (const [key, value] of Object.entries(stats)) {
          if (typeof value === 'number') {
            entry.totalStats[key] = (entry.totalStats[key] || 0) + value;
          }
        }
      } catch { /* skip */ }
    }

    for (const [participantId, data] of participantStats.entries()) {
      const id = crypto.randomUUID();
      await this.db.run(
        `INSERT INTO match_player_stats (id, match_id, participant_id, total_stats_json, maps_played)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(match_id, participant_id) DO UPDATE SET
           total_stats_json = excluded.total_stats_json,
           maps_played = excluded.maps_played`,
        [id, matchId, participantId, JSON.stringify(data.totalStats), data.mapsPlayed.size]
      );
    }
  }

  private async generateTeamStatImage(
    matchId: string,
    matchStats: unknown[],
    statDefs: GameStatDefinition[],
    outputDir: string
  ): Promise<string | null> {
    try {
      // Dynamically import @napi-rs/canvas
      const { createCanvas } = await import('@napi-rs/canvas');

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
      const colWidth = (width - 300) / Math.max(primaryStats.length, 1);

      ctx.fillStyle = '#a0a0a0';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Player', 20, 90);
      ctx.fillText('Team', 200, 90);
      primaryStats.forEach((stat, i) => {
        ctx.textAlign = 'center';
        ctx.fillText(stat.display_name, 300 + colWidth * i + colWidth / 2, 90);
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

        const teamColor = stat.team_assignment === 'blue' ? '#5b9bd5' : '#e06c75';
        ctx.fillStyle = teamColor;
        ctx.fillText(String(stat.team_assignment || '').toUpperCase(), 200, y + 10);

        let statsObj: Record<string, number> = {};
        try { statsObj = JSON.parse(String(stat.total_stats_json || '{}')); } catch { /* skip */ }

        ctx.fillStyle = '#ffffff';
        primaryStats.forEach((s, j) => {
          ctx.textAlign = 'center';
          const val = statsObj[s.name] || 0;
          const display = s.format === 'thousands' && val >= 1000
            ? `${(val / 1000).toFixed(1)}K`
            : s.format === 'decimal'
            ? val.toFixed(2)
            : String(Math.round(val));
          ctx.fillText(display, 300 + colWidth * j + colWidth / 2, y + 10);
        });
      }

      // Footer
      ctx.fillStyle = '#4a4a6a';
      ctx.fillRect(0, height - 30, width, 30);
      ctx.fillStyle = '#a0a0a0';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MatchExec', width / 2, height - 10);

      const imagePath = path.join(outputDir, 'team.png');
      const imageUrl = `/uploads/stats/${matchId}/team.png`;
      fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));
      return imageUrl;
    } catch {
      return null;
    }
  }

  private async generatePlayerStatImage(
    matchId: string,
    playerStat: Record<string, unknown>,
    statDefs: GameStatDefinition[],
    outputDir: string
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

      // Header bar
      const teamColor = playerStat.team_assignment === 'blue' ? '#5b9bd5' : '#e06c75';
      ctx.fillStyle = teamColor;
      ctx.fillRect(0, 0, width, 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(playerStat.username || 'Unknown Player'), width / 2, 40);

      // Stats grid
      let statsObj: Record<string, number> = {};
      try { statsObj = JSON.parse(String(playerStat.total_stats_json || '{}')); } catch { /* skip */ }

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
      const imagePath = path.join(outputDir, filename);
      const imageUrl = `/uploads/stats/${matchId}/${filename}`;
      fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));
      return imageUrl;
    } catch {
      return null;
    }
  }
}
