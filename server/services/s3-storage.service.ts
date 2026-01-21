import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../lib/env';
import crypto from 'crypto';

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = env.S3_BUCKET_NAME;

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  bucket: string;
  size: number;
  etag: string;
}

/**
 * Generate a unique S3 key for a file upload
 */
export function generateS3Key(
  organisationId: number,
  projectId: number,
  type: 'sources' | 'datasets' | 'exports',
  filename: string
): string {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `org-${organisationId}/project-${projectId}/${type}/${timestamp}-${randomSuffix}-${sanitizedFilename}`;
}

/**
 * Upload a file to S3
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const { contentType = 'application/octet-stream', metadata = {} } = options;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  });

  const result = await s3Client.send(command);

  return {
    key,
    bucket: BUCKET_NAME,
    size: Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body),
    etag: result.ETag?.replace(/"/g, '') || '',
  };
}

/**
 * Upload a file from a stream
 */
export async function uploadStream(
  key: string,
  stream: NodeJS.ReadableStream,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks);
  return uploadFile(key, body, options);
}

/**
 * Download a file from S3
 */
export async function downloadFile(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`File not found: ${key}`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * Get a readable stream for a file
 */
export async function getFileStream(
  key: string
): Promise<NodeJS.ReadableStream> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`File not found: ${key}`);
  }

  return response.Body as NodeJS.ReadableStream;
}

/**
 * Delete a file from S3
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Check if a file exists in S3
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(key: string): Promise<{
  size: number;
  contentType: string;
  lastModified: Date;
  metadata: Record<string, string>;
}> {
  const command = new HeadObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);

  return {
    size: response.ContentLength || 0,
    contentType: response.ContentType || 'application/octet-stream',
    lastModified: response.LastModified || new Date(),
    metadata: response.Metadata || {},
  };
}

/**
 * Generate a presigned URL for uploading
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600,
  filename?: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ...(filename && {
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * List files in a prefix
 */
export async function listFiles(
  prefix: string,
  maxKeys: number = 1000
): Promise<{ key: string; size: number; lastModified: Date }[]> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await s3Client.send(command);

  return (response.Contents || []).map((item) => ({
    key: item.Key || '',
    size: item.Size || 0,
    lastModified: item.LastModified || new Date(),
  }));
}

/**
 * Delete all files with a given prefix
 */
export async function deletePrefix(prefix: string): Promise<number> {
  const files = await listFiles(prefix);
  let deleted = 0;

  for (const file of files) {
    await deleteFile(file.key);
    deleted++;
  }

  return deleted;
}

/**
 * Copy a file within S3
 */
export async function copyFile(
  sourceKey: string,
  destinationKey: string
): Promise<void> {
  const { CopyObjectCommand } = await import('@aws-sdk/client-s3');

  const command = new CopyObjectCommand({
    Bucket: BUCKET_NAME,
    CopySource: `${BUCKET_NAME}/${sourceKey}`,
    Key: destinationKey,
  });

  await s3Client.send(command);
}
