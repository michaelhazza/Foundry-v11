import { Request, Response } from 'express';
import { db } from '../db';
import { oauthConnections, auditLogs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { parseIntParam } from '../lib/validation';
import { sendSuccess, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors';
import { encrypt, decrypt } from '../lib/encryption';

const TEAMWORK_AUTH_URL = 'https://www.teamwork.com/launchpad/login';
const TEAMWORK_TOKEN_URL = 'https://www.teamwork.com/launchpad/v1/token.json';

/**
 * GET /api/oauth/connect/teamwork
 * Initiate OAuth flow for Teamwork
 */
export async function connectTeamwork(
  req: Request,
  res: Response
): Promise<void> {
  const clientId = process.env.TEAMWORK_CLIENT_ID;
  const redirectUri = process.env.TEAMWORK_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new BadRequestError('Teamwork OAuth not configured');
  }

  // Store state for CSRF protection
  const state = `${req.user!.organisationId}:${req.user!.id}:${Date.now()}`;
  const encodedState = Buffer.from(state).toString('base64');

  const authUrl = new URL(TEAMWORK_AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', encodedState);

  sendSuccess(res, {
    authUrl: authUrl.toString(),
    message: 'Redirect user to authUrl to authorize',
  });
}

/**
 * GET /api/oauth/callback/teamwork
 * Handle OAuth callback from Teamwork
 */
export async function callbackTeamwork(
  req: Request,
  res: Response
): Promise<void> {
  const { code, state, error } = req.query;

  if (error) {
    // Redirect to frontend with error
    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=oauth_denied`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=invalid_callback`);
    return;
  }

  // Decode and validate state
  let organisationId: number;
  let userId: number;

  try {
    const decodedState = Buffer.from(state as string, 'base64').toString('utf8');
    const [orgIdStr, userIdStr] = decodedState.split(':');
    organisationId = parseInt(orgIdStr, 10);
    userId = parseInt(userIdStr, 10);

    if (!organisationId || !userId) {
      throw new Error('Invalid state');
    }
  } catch {
    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=invalid_state`);
    return;
  }

  // Exchange code for tokens
  const clientId = process.env.TEAMWORK_CLIENT_ID!;
  const clientSecret = process.env.TEAMWORK_CLIENT_SECRET!;
  const redirectUri = process.env.TEAMWORK_REDIRECT_URI!;

  try {
    const tokenResponse = await fetch(TEAMWORK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('[OAuth] Token exchange failed:', await tokenResponse.text());
      res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=token_exchange_failed`);
      return;
    }

    const tokens = await tokenResponse.json();

    // Encrypt tokens before storage
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : null;

    // Check if connection already exists
    const existing = await db
      .select()
      .from(oauthConnections)
      .where(
        and(
          eq(oauthConnections.organisationId, organisationId),
          eq(oauthConnections.provider, 'teamwork_desk')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing connection
      await db
        .update(oauthConnections)
        .set({
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : null,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.id, existing[0].id));
    } else {
      // Create new connection
      await db.insert(oauthConnections).values({
        organisationId,
        provider: 'teamwork_desk',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        accountName: tokens.installation?.company?.name || 'Teamwork Account',
      });
    }

    // Create audit log
    await db.insert(auditLogs).values({
      organisationId,
      userId,
      action: 'oauth.connect',
      resourceType: 'oauth_connection',
      metadata: { provider: 'teamwork_desk' },
    });

    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?success=connected`);
  } catch (error) {
    console.error('[OAuth] Callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=connection_failed`);
  }
}

/**
 * GET /api/oauth/connections
 * List OAuth connections for organisation
 */
export async function listConnections(
  req: Request,
  res: Response
): Promise<void> {
  const connections = await db
    .select({
      id: oauthConnections.id,
      provider: oauthConnections.provider,
      accountName: oauthConnections.accountName,
      isActive: oauthConnections.isActive,
      lastSyncedAt: oauthConnections.lastSyncedAt,
      createdAt: oauthConnections.createdAt,
    })
    .from(oauthConnections)
    .where(eq(oauthConnections.organisationId, req.user!.organisationId));

  sendSuccess(res, { connections });
}

/**
 * DELETE /api/oauth/connections/:connectionId
 * Disconnect OAuth connection
 */
export async function disconnectConnection(
  req: Request,
  res: Response
): Promise<void> {
  const connectionId = parseIntParam(req.params.connectionId, 'connectionId');

  const connection = await db
    .select()
    .from(oauthConnections)
    .where(eq(oauthConnections.id, connectionId))
    .limit(1);

  if (connection.length === 0) {
    throw new NotFoundError('OAuth connection');
  }

  if (connection[0].organisationId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  await db.delete(oauthConnections).where(eq(oauthConnections.id, connectionId));

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'oauth.disconnect',
    resourceType: 'oauth_connection',
    resourceId: connectionId,
    metadata: { provider: connection[0].provider },
  });

  sendNoContent(res);
}
