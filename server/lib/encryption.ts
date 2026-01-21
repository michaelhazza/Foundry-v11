import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for encryption');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt sensitive data using AES-256-GCM.
 * @param text - Plain text to encrypt
 * @returns Encrypted string (format: iv:authTag:encrypted)
 */
export function encrypt(text: string): string {
  const ENCRYPTION_KEY = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt data encrypted with encrypt().
 * @param encryptedText - Encrypted string from encrypt()
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  const ENCRYPTION_KEY = getEncryptionKey();
  const [ivHex, authTagHex, encryptedData] = encryptedText.split(':');

  if (!ivHex || !authTagHex || !encryptedData) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a random encryption key.
 * Use this to generate a new ENCRYPTION_KEY for .env
 * @returns 64-character hex string (32 bytes)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
