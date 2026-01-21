import { Router, Request, Response } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connection
    await db.execute(sql`SELECT 1`);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: 'connected',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: 'disconnected',
      },
    });
  }
});

export default router;
