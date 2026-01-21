import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import {
  createSchemaMappingSchema,
  updateSchemaMappingSchema,
} from '../../shared/validators';
import * as schemaMappingsController from '../controllers/schema-mappings.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/schema-mappings (project scoped via query param)
router.get('/', asyncHandler(schemaMappingsController.list));

// POST /api/schema-mappings
router.post(
  '/',
  validate(createSchemaMappingSchema),
  asyncHandler(schemaMappingsController.create)
);

// GET /api/schema-mappings/:mappingId
router.get('/:mappingId', asyncHandler(schemaMappingsController.get));

// PATCH /api/schema-mappings/:mappingId
router.patch(
  '/:mappingId',
  validate(updateSchemaMappingSchema),
  asyncHandler(schemaMappingsController.update)
);

// DELETE /api/schema-mappings/:mappingId
router.delete('/:mappingId', asyncHandler(schemaMappingsController.remove));

export default router;
