import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Hash a password using bcrypt.
 *
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a password with a hash.
 *
 * @param password - Plain text password
 * @param hash - Hashed password
 * @returns True if password matches
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
