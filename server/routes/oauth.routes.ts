import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { authenticate } from '../middleware/auth';
import * as oauthController from '../controllers/oauth.controller';

const router = Router();

// GET /api/oauth/connect/teamwork - initiate OAuth flow (requires auth)
router.get('/connect/teamwork', authenticate, asyncHandler(oauthController.connectTeamwork));

// GET /api/oauth/callback/teamwork - OAuth callback (no auth required)
router.get('/callback/teamwork', asyncHandler(oauthController.callbackTeamwork));

// GET /api/oauth/connections - list connected accounts (requires auth)
router.get('/connections', authenticate, asyncHandler(oauthController.listConnections));

// DELETE /api/oauth/connections/:connectionId - disconnect (requires auth)
router.delete(
  '/connections/:connectionId',
  authenticate,
  asyncHandler(oauthController.disconnectConnection)
);

export default router;
