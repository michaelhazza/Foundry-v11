import { Resend } from 'resend';

let resend: Resend | null = null;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5000';
const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Send password reset email.
 * Falls back to console logging in development or if Resend not configured.
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  name: string
): Promise<void> {
  const resetLink = `${FRONTEND_URL}/reset-password?token=${token}`;

  if (resend) {
    try {
      await resend.emails.send({
        from: 'Foundry <noreply@foundry.app>',
        to: email,
        subject: 'Reset your Foundry password',
        html: `
          <h1>Password Reset Request</h1>
          <p>Hi ${name},</p>
          <p>We received a request to reset your password. Click the link below to set a new password:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, you can safely ignore this email.</p>
          <p>Best,<br>The Foundry Team</p>
        `,
      });
    } catch (error) {
      console.error('[Email] Failed to send password reset email:', error);
      // Don't throw - graceful degradation
    }
  } else if (isDevelopment) {
    console.log(`[DEV Email] Password reset link for ${email}:`);
    console.log(`[DEV Email] ${resetLink}`);
    console.log(`[DEV Email] Token: ${token}`);
  }
}

/**
 * Send team invitation email.
 * Falls back to console logging in development or if Resend not configured.
 */
export async function sendInvitationEmail(
  email: string,
  token: string,
  inviterName: string,
  organisationName: string
): Promise<void> {
  const inviteLink = `${FRONTEND_URL}/accept-invite/${token}`;

  if (resend) {
    try {
      await resend.emails.send({
        from: 'Foundry <noreply@foundry.app>',
        to: email,
        subject: `You're invited to join ${organisationName} on Foundry`,
        html: `
          <h1>Team Invitation</h1>
          <p>Hi,</p>
          <p>${inviterName} has invited you to join <strong>${organisationName}</strong> on Foundry.</p>
          <p>Click the link below to accept the invitation and create your account:</p>
          <p><a href="${inviteLink}">${inviteLink}</a></p>
          <p>This invitation will expire in 7 days.</p>
          <p>Best,<br>The Foundry Team</p>
        `,
      });
    } catch (error) {
      console.error('[Email] Failed to send invitation email:', error);
      // Don't throw - graceful degradation
    }
  } else if (isDevelopment) {
    console.log(`[DEV Email] Team invitation for ${email}:`);
    console.log(`[DEV Email] ${inviteLink}`);
    console.log(`[DEV Email] Token: ${token}`);
    console.log(`[DEV Email] Organisation: ${organisationName}`);
  }
}
