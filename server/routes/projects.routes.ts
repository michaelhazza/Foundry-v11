import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { createProjectSchema, updateProjectSchema } from '../../shared/validators';
import * as projectsController from '../controllers/projects.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/projects
router.get('/', asyncHandler(projectsController.list));

// POST /api/projects
router.post(
  '/',
  validate(createProjectSchema),
  asyncHandler(projectsController.create)
);

// GET /api/projects/:projectId
router.get('/:projectId', asyncHandler(projectsController.get));

// PATCH /api/projects/:projectId
router.patch(
  '/:projectId',
  validate(updateProjectSchema),
  asyncHandler(projectsController.update)
);

// DELETE /api/projects/:projectId
router.delete('/:projectId', asyncHandler(projectsController.remove));

// GET /api/projects/:projectId/summary
router.get('/:projectId/summary', asyncHandler(projectsController.summary));

export default router;
