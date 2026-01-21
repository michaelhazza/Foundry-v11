import { Request, Response } from 'express';
import { db } from '../db';
import {
  users,
  organisations,
  invitations,
  passwordResetTokens,
  auditLogs,
} from '../db/schema';
import { eq, and, gte } from 'drizzle-orm';
import { hashPassword, comparePassword } from '../lib/password';
import { generateToken, generateRandomToken } from '../lib/tokens';
import { sendSuccess, sendCreated, sendNoContent } from '../lib/response';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  GoneError,
  UnprocessableEntityError,
} from '../errors';
import type {
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
} from '../../shared/validators';
import { sendPasswordResetEmail } from '../services/email.service';

/**
 * POST /api/auth/register
 * Register a new user
 */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, name, inviteToken } = req.body as RegisterInput;

  // Check if email already exists
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existingUser.length > 0) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await hashPassword(password);
  let userId: number;
  let organisationId: number;
  let orgName: string;
  let orgSlug: string;
  let userRole = 'admin'; // Default for new org creators

  if (inviteToken) {
    // Path 1: Join existing organization via invitation
    const invite = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.token, inviteToken),
          eq(invitations.status, 'pending'),
          gte(invitations.expiresAt, new Date())
        )
      )
      .limit(1);

    if (invite.length === 0) {
      throw new GoneError('Invalid or expired invitation');
    }

    const invitation = invite[0];
    organisationId = invitation.organisationId;
    userRole = invitation.role;

    // Get organisation details
    const org = await db
      .select()
      .from(organisations)
      .where(eq(organisations.id, organisationId))
      .limit(1);

    if (org.length === 0) {
      throw new BadRequestError('Organisation not found');
    }

    orgName = org[0].name;
    orgSlug = org[0].slug;

    // Create user
    const newUser = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name,
        organisationId,
        role: userRole,
        invitedBy: invitation.invitedBy,
      })
      .returning({ id: users.id });

    userId = newUser[0].id;

    // Mark invitation as accepted
    await db
      .update(invitations)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(invitations.id, invitation.id));
  } else {
    // Path 2: Create new organization
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const newOrg = await db
      .insert(organisations)
      .values({
        name: `${name}'s Organisation`,
        slug: `${slug}-${Date.now()}`,
      })
      .returning();

    organisationId = newOrg[0].id;
    orgName = newOrg[0].name;
    orgSlug = newOrg[0].slug;

    // Create user as admin
    const newUser = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name,
        organisationId,
        role: 'admin',
      })
      .returning({ id: users.id });

    userId = newUser[0].id;
  }

  // Generate token
  const token = generateToken(userId, email);

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId,
    userId,
    action: 'user.register',
    resourceType: 'user',
    resourceId: userId,
    metadata: { inviteToken: !!inviteToken },
  });

  sendCreated(res, {
    token,
    user: {
      id: userId,
      email: email.toLowerCase(),
      name,
      role: userRole,
      organisation: {
        id: organisationId,
        name: orgName,
        slug: orgSlug,
      },
    },
  });
}

/**
 * POST /api/auth/login
 * Authenticate user and return token
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;

  // Find user with organisation
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      name: users.name,
      role: users.role,
      status: users.status,
      organisationId: users.organisationId,
      orgId: organisations.id,
      orgName: organisations.name,
      orgSlug: organisations.slug,
    })
    .from(users)
    .innerJoin(organisations, eq(users.organisationId, organisations.id))
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (result.length === 0) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const user = result[0];

  if (user.status !== 'active') {
    throw new UnauthorizedError('Account is not active');
  }

  const isValidPassword = await comparePassword(password, user.passwordHash);

  if (!isValidPassword) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  // Generate token
  const token = generateToken(user.id, user.email);

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: user.organisationId,
    userId: user.id,
    action: 'user.login',
    resourceType: 'user',
    resourceId: user.id,
  });

  sendSuccess(res, {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organisation: {
        id: user.orgId,
        name: user.orgName,
        slug: user.orgSlug,
      },
    },
  });
}

/**
 * POST /api/auth/logout
 * Log out user
 */
export async function logout(req: Request, res: Response): Promise<void> {
  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'user.logout',
    resourceType: 'user',
    resourceId: req.user!.id,
  });

  sendNoContent(res);
}

/**
 * GET /api/auth/me
 * Get current user profile
 */
export async function me(req: Request, res: Response): Promise<void> {
  sendSuccess(res, {
    user: req.user,
  });
}

/**
 * PATCH /api/auth/profile
 * Update user profile
 */
export async function updateProfile(
  req: Request,
  res: Response
): Promise<void> {
  const { name, currentPassword, newPassword } = req.body as UpdateProfileInput;

  const updateData: Partial<{ name: string; passwordHash: string }> = {};

  if (name) {
    updateData.name = name;
  }

  if (newPassword) {
    if (!currentPassword) {
      throw new BadRequestError('Current password is required to change password');
    }

    // Verify current password
    const user = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    const isValid = await comparePassword(currentPassword, user[0].passwordHash);

    if (!isValid) {
      throw new UnprocessableEntityError('Current password is incorrect');
    }

    updateData.passwordHash = await hashPassword(newPassword);
  }

  if (Object.keys(updateData).length === 0) {
    throw new BadRequestError('No fields to update');
  }

  await db
    .update(users)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(users.id, req.user!.id));

  // Fetch updated user
  const updated = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, req.user!.id))
    .limit(1);

  sendSuccess(res, {
    user: {
      ...updated[0],
      organisation: req.user!.organisation,
    },
  });
}

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
export async function forgotPassword(
  req: Request,
  res: Response
): Promise<void> {
  const { email } = req.body;

  // Always return success to prevent email enumeration
  const user = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (user.length > 0) {
    // Generate reset token
    const token = generateRandomToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({
      userId: user[0].id,
      token,
      expiresAt,
    });

    // Send email (or log in dev)
    await sendPasswordResetEmail(email, token, user[0].name || 'User');
  }

  sendSuccess(res, {
    message: 'If the email exists, a password reset link has been sent.',
  });
}

/**
 * GET /api/auth/reset-password/:token
 * Validate reset token
 */
export async function validateResetToken(
  req: Request,
  res: Response
): Promise<void> {
  const { token } = req.params;

  const result = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
      email: users.email,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(passwordResetTokens.userId, users.id))
    .where(eq(passwordResetTokens.token, token))
    .limit(1);

  if (result.length === 0) {
    throw new GoneError('Invalid or expired reset token');
  }

  const resetToken = result[0];

  if (resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new GoneError('Invalid or expired reset token');
  }

  sendSuccess(res, {
    valid: true,
    email: resetToken.email,
  });
}

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
export async function resetPassword(
  req: Request,
  res: Response
): Promise<void> {
  const { token, password } = req.body;

  const result = await db
    .select({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
      usedAt: passwordResetTokens.usedAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);

  if (result.length === 0) {
    throw new GoneError('Invalid or expired reset token');
  }

  const resetToken = result[0];

  if (resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new GoneError('Invalid or expired reset token');
  }

  // Update password
  const passwordHash = await hashPassword(password);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, resetToken.userId));

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, resetToken.id));

  sendSuccess(res, {
    message: 'Password has been reset successfully.',
  });
}
