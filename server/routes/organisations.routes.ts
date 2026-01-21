import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import { authenticate, authorize } from '../middleware/auth';
import { createInvitationSchema, updateMemberRoleSchema } from '../../shared/validators';
import * as organisationsController from '../controllers/organisations.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/organisations/current
router.get('/current', asyncHandler(organisationsController.getCurrent));

// PATCH /api/organisations/current
router.patch('/current', authorize('admin'), asyncHandler(organisationsController.updateCurrent));

// GET /api/organisations/current/members
router.get('/current/members', asyncHandler(organisationsController.listMembers));

// POST /api/organisations/current/invitations
router.post(
  '/current/invitations',
  authorize('admin'),
  validate(createInvitationSchema),
  asyncHandler(organisationsController.createInvitation)
);

// DELETE /api/organisations/current/members/:userId
router.delete(
  '/current/members/:userId',
  authorize('admin'),
  asyncHandler(organisationsController.removeMember)
);

// PATCH /api/organisations/current/members/:userId
router.patch(
  '/current/members/:userId',
  authorize('admin'),
  validate(updateMemberRoleSchema),
  asyncHandler(organisationsController.updateMemberRole)
);

// POST /api/invitations/:token/accept - public endpoint for accepting invitations
router.post('/invitations/:token/accept', asyncHandler(organisationsController.acceptInvitation));

// GET /api/invitations/:token - validate invitation token (public)
router.get('/invitations/:token', asyncHandler(organisationsController.validateInvitation));

export default router;
