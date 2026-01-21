import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { processingRateLimiter } from '../middleware/rate-limit';
import { createJobSchema } from '../../shared/validators';
import * as jobsController from '../controllers/jobs.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/jobs (project scoped via query param)
router.get('/', asyncHandler(jobsController.list));

// POST /api/jobs
router.post(
  '/',
  processingRateLimiter,
  validate(createJobSchema),
  asyncHandler(jobsController.create)
);

// GET /api/jobs/:jobId
router.get('/:jobId', asyncHandler(jobsController.get));

// POST /api/jobs/:jobId/cancel
router.post('/:jobId/cancel', asyncHandler(jobsController.cancel));

// GET /api/jobs/:jobId/progress
router.get('/:jobId/progress', asyncHandler(jobsController.progress));

// GET /api/jobs/:jobId/logs
router.get('/:jobId/logs', asyncHandler(jobsController.logs));

export default router;
