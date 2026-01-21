import { Request, Response } from 'express';
import { db } from '../db';
import {
  organisations,
  users,
  invitations,
  auditLogs,
} from '../db/schema';
import { eq, and, gte, ne } from 'drizzle-orm';
import { parseIntParam } from '../lib/validation';
import { sendSuccess, sendCreated, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError, GoneError } from '../errors';
import { generateRandomToken } from '../lib/tokens';
import { hashPassword } from '../lib/password';
import { sendInvitationEmail } from '../services/email.service';
import type { CreateInvitationInput, UpdateMemberRoleInput } from '../../shared/validators';

/**
 * GET /api/organisations/current
 * Get current user's organisation
 */
export async function getCurrent(req: Request, res: Response): Promise<void> {
  const result = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, req.user!.organisationId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Organisation');
  }

  const org = result[0];

  sendSuccess(res, {
    id: org.id,
    name: org.name,
    slug: org.slug,
    subscriptionTier: org.subscriptionTier,
    subscriptionStatus: org.subscriptionStatus,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  });
}

/**
 * PATCH /api/organisations/current
 * Update current organisation (admin only)
 */
export async function updateCurrent(req: Request, res: Response): Promise<void> {
  const { name } = req.body;

  if (!name) {
    throw new BadRequestError('Name is required');
  }

  await db
    .update(organisations)
    .set({ name, updatedAt: new Date() })
    .where(eq(organisations.id, req.user!.organisationId));

  const result = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, req.user!.organisationId))
    .limit(1);

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'organisation.update',
    resourceType: 'organisation',
    resourceId: req.user!.organisationId,
    metadata: { name },
  });

  sendSuccess(res, {
    id: result[0].id,
    name: result[0].name,
    slug: result[0].slug,
    subscriptionTier: result[0].subscriptionTier,
    subscriptionStatus: result[0].subscriptionStatus,
    createdAt: result[0].createdAt,
    updatedAt: result[0].updatedAt,
  });
}

/**
 * GET /api/organisations/current/members
 * List organisation members
 */
export async function listMembers(req: Request, res: Response): Promise<void> {
  const members = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.organisationId, req.user!.organisationId));

  // Get pending invitations
  const pendingInvitations = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.organisationId, req.user!.organisationId),
        eq(invitations.status, 'pending'),
        gte(invitations.expiresAt, new Date())
      )
    );

  sendSuccess(res, { members, pendingInvitations });
}

/**
 * POST /api/organisations/current/invitations
 * Create team invitation (admin only)
 */
export async function createInvitation(
  req: Request,
  res: Response
): Promise<void> {
  const { email, role } = req.body as CreateInvitationInput;

  // Check if user already exists in org
  const existingMember = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.email, email.toLowerCase()),
        eq(users.organisationId, req.user!.organisationId)
      )
    )
    .limit(1);

  if (existingMember.length > 0) {
    throw new ConflictError('User is already a member of this organisation');
  }

  // Check for existing pending invitation
  const existingInvite = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email.toLowerCase()),
        eq(invitations.organisationId, req.user!.organisationId),
        eq(invitations.status, 'pending'),
        gte(invitations.expiresAt, new Date())
      )
    )
    .limit(1);

  if (existingInvite.length > 0) {
    throw new ConflictError('An invitation is already pending for this email');
  }

  const token = generateRandomToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const result = await db
    .insert(invitations)
    .values({
      organisationId: req.user!.organisationId,
      email: email.toLowerCase(),
      role,
      token,
      invitedBy: req.user!.id,
      expiresAt,
    })
    .returning();

  const invitation = result[0];

  // Send invitation email
  await sendInvitationEmail(
    email,
    token,
    req.user!.name || req.user!.email,
    req.user!.organisation.name
  );

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'invitation.create',
    resourceType: 'invitation',
    resourceId: invitation.id,
    metadata: { email, role },
  });

  sendCreated(res, {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  });
}

/**
 * DELETE /api/organisations/current/members/:userId
 * Remove member from organisation (admin only)
 */
export async function removeMember(req: Request, res: Response): Promise<void> {
  const userId = parseIntParam(req.params.userId, 'userId');

  // Can't remove yourself
  if (userId === req.user!.id) {
    throw new BadRequestError('Cannot remove yourself from the organisation');
  }

  const member = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.organisationId, req.user!.organisationId)
      )
    )
    .limit(1);

  if (member.length === 0) {
    throw new NotFoundError('Member');
  }

  // Update user status to inactive (soft delete)
  await db
    .update(users)
    .set({ status: 'inactive', updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'member.remove',
    resourceType: 'user',
    resourceId: userId,
    metadata: { removedEmail: member[0].email },
  });

  sendNoContent(res);
}

/**
 * PATCH /api/organisations/current/members/:userId
 * Update member role (admin only)
 */
export async function updateMemberRole(
  req: Request,
  res: Response
): Promise<void> {
  const userId = parseIntParam(req.params.userId, 'userId');
  const { role } = req.body as UpdateMemberRoleInput;

  // Can't change your own role
  if (userId === req.user!.id) {
    throw new BadRequestError('Cannot change your own role');
  }

  const member = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.organisationId, req.user!.organisationId)
      )
    )
    .limit(1);

  if (member.length === 0) {
    throw new NotFoundError('Member');
  }

  await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId));

  const updated = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'member.role_update',
    resourceType: 'user',
    resourceId: userId,
    metadata: { newRole: role },
  });

  sendSuccess(res, updated[0]);
}

/**
 * GET /api/invitations/:token
 * Validate invitation token (public endpoint)
 */
export async function validateInvitation(
  req: Request,
  res: Response
): Promise<void> {
  const { token } = req.params;

  const result = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      status: invitations.status,
      orgName: organisations.name,
    })
    .from(invitations)
    .innerJoin(organisations, eq(invitations.organisationId, organisations.id))
    .where(eq(invitations.token, token))
    .limit(1);

  if (result.length === 0) {
    throw new GoneError('Invalid invitation token');
  }

  const invite = result[0];

  if (invite.status !== 'pending') {
    throw new GoneError('Invitation has already been used');
  }

  if (invite.expiresAt < new Date()) {
    throw new GoneError('Invitation has expired');
  }

  sendSuccess(res, {
    valid: true,
    email: invite.email,
    role: invite.role,
    organisationName: invite.orgName,
    expiresAt: invite.expiresAt,
  });
}

/**
 * POST /api/invitations/:token/accept
 * Accept invitation and create account (public endpoint)
 */
export async function acceptInvitation(
  req: Request,
  res: Response
): Promise<void> {
  const { token } = req.params;
  const { name, password } = req.body;

  if (!name || !password) {
    throw new BadRequestError('Name and password are required');
  }

  if (password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters');
  }

  const result = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.token, token),
        eq(invitations.status, 'pending'),
        gte(invitations.expiresAt, new Date())
      )
    )
    .limit(1);

  if (result.length === 0) {
    throw new GoneError('Invalid or expired invitation');
  }

  const invite = result[0];

  // Check if email already registered
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invite.email))
    .limit(1);

  if (existingUser.length > 0) {
    throw new ConflictError('Email is already registered');
  }

  const passwordHash = await hashPassword(password);

  // Create user
  const newUser = await db
    .insert(users)
    .values({
      email: invite.email,
      passwordHash,
      name,
      organisationId: invite.organisationId,
      role: invite.role,
      invitedBy: invite.invitedBy,
    })
    .returning();

  // Mark invitation as accepted
  await db
    .update(invitations)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(eq(invitations.id, invite.id));

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: invite.organisationId,
    userId: newUser[0].id,
    action: 'invitation.accept',
    resourceType: 'invitation',
    resourceId: invite.id,
  });

  sendCreated(res, {
    message: 'Account created successfully. You can now log in.',
    email: invite.email,
  });
}
