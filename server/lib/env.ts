/**
 * Environment variable validation.
 * Server MUST crash on startup if REQUIRED variables are missing.
 * OPTIONAL variables degrade gracefully.
 */

interface EnvironmentConfig {
  // Database
  DATABASE_URL: string;

  // Authentication
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;

  // S3 Storage (REQUIRED)
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;

  // OAuth - Teamwork (REQUIRED)
  TEAMWORK_CLIENT_ID: string;
  TEAMWORK_CLIENT_SECRET: string;
  TEAMWORK_REDIRECT_URI: string;

  // Email (OPTIONAL)
  RESEND_API_KEY?: string;

  // Application
  NODE_ENV: string;
  PORT: number;
  FRONTEND_URL: string;
}

function validateRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`REQUIRED environment variable missing: ${name}`);
  }
  return value;
}

function validateEncryptionKey(key: string): string {
  if (key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      'ENCRYPTION_KEY must be 64-character hex string (32 bytes for AES-256)'
    );
  }
  return key;
}

function validateJwtSecret(secret: string): string {
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return secret;
}

export const env: EnvironmentConfig = {
  DATABASE_URL: validateRequiredEnv('DATABASE_URL'),
  JWT_SECRET: validateJwtSecret(validateRequiredEnv('JWT_SECRET')),
  ENCRYPTION_KEY: validateEncryptionKey(validateRequiredEnv('ENCRYPTION_KEY')),

  S3_ENDPOINT: validateRequiredEnv('S3_ENDPOINT'),
  S3_REGION: validateRequiredEnv('S3_REGION'),
  S3_BUCKET: validateRequiredEnv('S3_BUCKET'),
  S3_ACCESS_KEY_ID: validateRequiredEnv('S3_ACCESS_KEY_ID'),
  S3_SECRET_ACCESS_KEY: validateRequiredEnv('S3_SECRET_ACCESS_KEY'),

  TEAMWORK_CLIENT_ID: validateRequiredEnv('TEAMWORK_CLIENT_ID'),
  TEAMWORK_CLIENT_SECRET: validateRequiredEnv('TEAMWORK_CLIENT_SECRET'),
  TEAMWORK_REDIRECT_URI: validateRequiredEnv('TEAMWORK_REDIRECT_URI'),

  RESEND_API_KEY: process.env.RESEND_API_KEY, // OPTIONAL

  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5000',
};

console.log('[Environment] Validation passed');
if (!env.RESEND_API_KEY) {
  console.warn(
    '[Environment] RESEND_API_KEY not set - email features will log to console'
  );
}
