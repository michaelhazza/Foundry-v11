import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { createDataSourceSchema } from '../../shared/validators';
import * as dataSourcesController from '../controllers/data-sources.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/data-sources (project scoped via query param)
router.get('/', asyncHandler(dataSourcesController.list));

// POST /api/data-sources
router.post(
  '/',
  validate(createDataSourceSchema),
  asyncHandler(dataSourcesController.create)
);

// GET /api/data-sources/:dataSourceId
router.get('/:dataSourceId', asyncHandler(dataSourcesController.get));

// DELETE /api/data-sources/:dataSourceId
router.delete('/:dataSourceId', asyncHandler(dataSourcesController.remove));

// POST /api/data-sources/:dataSourceId/upload
router.post('/:dataSourceId/upload', asyncHandler(dataSourcesController.uploadFile));

// GET /api/data-sources/:dataSourceId/preview
router.get('/:dataSourceId/preview', asyncHandler(dataSourcesController.preview));

export default router;
