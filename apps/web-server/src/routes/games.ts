import { Router, Request, Response } from 'express';
import { getPrismaClient, ApiResponse } from '@matchexec/shared';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const prisma = getPrismaClient();

// Get all games
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const games = await prisma.game.findMany({
    where: { isActive: true },
    include: {
      _count: {
        select: {
          players: true,
          matches: true,
          characters: true,
          maps: true,
        },
      },
    },
  });

  const response: ApiResponse = {
    success: true,
    data: games,
    message: 'Games retrieved successfully',
  };

  res.json(response);
}));

// Get specific game by ID
router.get('/:gameId', asyncHandler(async (req: Request, res: Response) => {
  const { gameId } = req.params;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      characters: {
        where: { isActive: true },
        orderBy: { displayName: 'asc' },
      },
      maps: {
        where: { isActive: true },
        orderBy: { displayName: 'asc' },
      },
      gameModes: {
        where: { isActive: true },
        orderBy: { displayName: 'asc' },
      },
      _count: {
        select: {
          players: true,
          matches: true,
        },
      },
    },
  });

  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Game not found',
    } as ApiResponse);
  }

  const response: ApiResponse = {
    success: true,
    data: game,
    message: 'Game retrieved successfully',
  };

  res.json(response);
}));

// Get game characters
router.get('/:gameId/characters', asyncHandler(async (req: Request, res: Response) => {
  const { gameId } = req.params;
  const { role } = req.query;

  const characters = await prisma.character.findMany({
    where: {
      gameId,
      isActive: true,
      ...(role && { role: role as string }),
    },
    orderBy: { displayName: 'asc' },
  });

  const response: ApiResponse = {
    success: true,
    data: characters,
    message: 'Characters retrieved successfully',
  };

  res.json(response);
}));

// Get game maps
router.get('/:gameId/maps', asyncHandler(async (req: Request, res: Response) => {
  const { gameId } = req.params;
  const { mapType } = req.query;

  const maps = await prisma.map.findMany({
    where: {
      gameId,
      isActive: true,
      ...(mapType && { mapType: mapType as string }),
    },
    orderBy: { displayName: 'asc' },
  });

  const response: ApiResponse = {
    success: true,
    data: maps,
    message: 'Maps retrieved successfully',
  };

  res.json(response);
}));

// Get game modes
router.get('/:gameId/modes', asyncHandler(async (req: Request, res: Response) => {
  const { gameId } = req.params;

  const gameModes = await prisma.gameMode.findMany({
    where: {
      gameId,
      isActive: true,
    },
    orderBy: { displayName: 'asc' },
  });

  const response: ApiResponse = {
    success: true,
    data: gameModes,
    message: 'Game modes retrieved successfully',
  };

  res.json(response);
}));

export default router; 