import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a JWT token for a user.
 *
 * @param userId - User ID
 * @param email - User email
 * @returns JWT token string
 */
export function generateToken(userId: number, email: string): string {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  );
}

/**
 * Verify and decode a JWT token.
 *
 * @param token - JWT token string
 * @returns Decoded token payload
 */
export function verifyToken(token: string): { userId: number; email: string } {
  return jwt.verify(token, process.env.JWT_SECRET!) as {
    userId: number;
    email: string;
  };
}

/**
 * Generate a random token for password reset, invitations, etc.
 *
 * @returns UUID v4 token string
 */
export function generateRandomToken(): string {
  return uuidv4();
}
