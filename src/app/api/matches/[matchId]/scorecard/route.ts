import type { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDbInstance } from '@/lib/database-init';
import { logger } from '@/lib/logger';
import type { ScorecardSubmission, ScorecardPlayerStat } from '@/shared/types';
import { apiError, apiOk } from '@/lib/api-response';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function isValidImageType(buffer: Buffer): boolean {
  const signatures = {
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    webp: [0x52, 0x49, 0x46, 0x46],
    gif: [0x47, 0x49, 0x46, 0x38]
  };

  for (const [, signature] of Object.entries(signatures)) {
    if (signature.every((byte, index) => buffer[index] === byte)) {
      return true;
    }
  }

  if (buffer.length > 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return true;
  }

  return false;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    if (!/^\d+$/.test(matchId)) {
      return apiError('Invalid match ID', 400);
    }
    const formData = await request.formData();
    const file = formData.get('screenshot') as File;
    const matchGameId = formData.get('matchGameId') as string;
    const teamSide = formData.get('teamSide') as string;

    if (!file) {
      return apiError('No screenshot file provided', 400);
    }
    if (!matchGameId) {
      return apiError('matchGameId is required', 400);
    }
    if (!teamSide || !['blue', 'red'].includes(teamSide)) {
      return apiError('teamSide must be blue or red', 400);
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return apiError('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.', 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return apiError('File too large. Maximum size is 10MB.', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isValidImageType(buffer)) {
      return apiError('Invalid image file. File content does not match image format.', 400);
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'scorecards', matchId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const extension = MIME_TO_EXT[file.type] ?? '.jpg';
    const filename = `${timestamp}_${randomBytes}${extension}`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);

    const screenshotUrl = `/uploads/scorecards/${matchId}/${filename}`;
    const submissionId = crypto.randomUUID();
    const queueId = crypto.randomUUID();

    const db = await getDbInstance();

    await db.run(
      `INSERT INTO scorecard_submissions (id, match_id, match_game_id, team_side, screenshot_url) VALUES (?, ?, ?, ?, ?)`,
      [submissionId, matchId, matchGameId, teamSide, screenshotUrl]
    );

    await db.run(
      `INSERT INTO stats_processing_queue (id, submission_id, match_id, match_game_id) VALUES (?, ?, ?, ?)`,
      [queueId, submissionId, matchId, matchGameId]
    );

    return apiOk({ success: true, submissionId, screenshotUrl });
  } catch (error) {
    logger.error('Error uploading scorecard:', error);
    return apiError('Failed to upload scorecard');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const { searchParams } = new URL(request.url);
    const matchGameId = searchParams.get('matchGameId');

    const db = await getDbInstance();

    let query = 'SELECT * FROM scorecard_submissions WHERE match_id = ?';
    const queryParams: unknown[] = [matchId];

    if (matchGameId) {
      query += ' AND match_game_id = ?';
      queryParams.push(matchGameId);
    }

    query += ' ORDER BY created_at DESC';

    const submissions = await db.all<ScorecardSubmission>(query, queryParams);

    // For each submission, fetch associated player stats
    const result = await Promise.all(
      (submissions || []).map(async (submission) => {
        const playerStats = await db.all<ScorecardPlayerStat>(
          'SELECT * FROM scorecard_player_stats WHERE submission_id = ? ORDER BY team_side, extracted_player_name',
          [submission.id]
        );
        return { ...submission, playerStats: playerStats || [] };
      })
    );

    return apiOk(result);
  } catch (error) {
    logger.error('Error fetching scorecard submissions:', error);
    return apiError('Failed to fetch submissions');
  }
}
