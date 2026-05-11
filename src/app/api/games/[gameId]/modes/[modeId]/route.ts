import type {NextResponse,  NextRequest} from 'next/server';
import { promises as fs } from 'fs';
import { apiError, apiOk } from '@/lib/api-response';
import path from 'path';
import type { ModeDataJson } from '@/shared/types';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; modeId: string }> }
): Promise<NextResponse> {
  try {
    const { gameId, modeId } = await params;

    // Read the modes.json file for the specified game
    const modesPath = path.join(process.cwd(), 'data', 'games', gameId, 'modes.json');
    
    try {
      const modesData = await fs.readFile(modesPath, 'utf8');
      const modes: ModeDataJson[] = JSON.parse(modesData);
      
      // Find the specific mode
      const mode = modes.find(m => m.id === modeId);
      
      if (!mode) {
        return apiError(`Mode '${modeId}' not found in game '${gameId}'`, 404);
      }

      return apiOk(mode);
    } catch (fileError) {
      logger.error(`Error reading modes file for game ${gameId}:`, fileError);
      return apiError(`Game '${gameId}' not found or modes data unavailable`, 404);
    }
  } catch (error) {
    logger.error('Error in GET /api/games/[gameId]/modes/[modeId]:', error);
    return apiError('Internal server error');
  }
}