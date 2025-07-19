import { Router, Request, Response } from 'express';
import { getPrismaClient } from '@matchexec/shared';

const router = Router();

// Basic health check
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Web server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Detailed health check with database connection
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();
    
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      success: true,
      message: 'Web server is healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      memory: process.memoryUsage(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Database connection failed',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'disconnected',
      error: (error as Error).message,
    });
  }
});

export default router; 