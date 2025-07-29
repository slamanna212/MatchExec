import { Router, Request, Response } from 'express';

const router = Router();

// API status endpoint
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'MatchExec API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API documentation endpoint
router.get('/docs', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'API Documentation',
    endpoints: {
      'GET /api': 'API status',
      'GET /api/docs': 'This documentation',
      'GET /api/games': 'List all games',
      'GET /api/games/:gameId': 'Get specific game data',
      'GET /health': 'Basic health check',
      'GET /health/detailed': 'Detailed health check with database',
    },
  });
});

export default router; 