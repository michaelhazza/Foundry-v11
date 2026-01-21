import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { authenticate } from '../middleware/auth';
import * as datasetsController from '../controllers/datasets.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/datasets (project scoped via query param)
router.get('/', asyncHandler(datasetsController.list));

// GET /api/datasets/:datasetId
router.get('/:datasetId', asyncHandler(datasetsController.get));

// GET /api/datasets/:datasetId/download
router.get('/:datasetId/download', asyncHandler(datasetsController.download));

// DELETE /api/datasets/:datasetId
router.delete('/:datasetId', asyncHandler(datasetsController.remove));

export default router;
