import { Request, Response } from 'express';
import { db } from '../db';
import { datasets, projects, auditLogs } from '../db/schema';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { parseIntParam, parsePaginationParams } from '../lib/validation';
import { sendSuccess, sendPaginated, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors';

/**
 * GET /api/datasets
 * List datasets for a project
 */
export async function list(req: Request, res: Response): Promise<void> {
  const projectId = req.query.project_id
    ? parseIntParam(req.query.project_id as string, 'project_id')
    : undefined;

  if (!projectId) {
    throw new BadRequestError('project_id query parameter is required');
  }

  // Verify project access
  const project = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);

  if (project.length === 0) {
    throw new NotFoundError('Project');
  }

  if (project[0].organisationId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const { page, pageSize, skip, take } = parsePaginationParams(req.query);

  // Get total count
  const totalResult = await db
    .select({ count: count() })
    .from(datasets)
    .where(and(eq(datasets.projectId, projectId), isNull(datasets.deletedAt)));

  const totalCount = totalResult[0].count;

  // Get datasets
  const result = await db
    .select({
      id: datasets.id,
      projectId: datasets.projectId,
      jobId: datasets.jobId,
      dataSourceId: datasets.dataSourceId,
      name: datasets.name,
      format: datasets.format,
      recordCount: datasets.recordCount,
      fileSize: datasets.fileSize,
      expiresAt: datasets.expiresAt,
      createdAt: datasets.createdAt,
    })
    .from(datasets)
    .where(and(eq(datasets.projectId, projectId), isNull(datasets.deletedAt)))
    .orderBy(desc(datasets.createdAt))
    .limit(take)
    .offset(skip);

  sendPaginated(res, result, { page, pageSize, totalCount });
}

/**
 * GET /api/datasets/:datasetId
 * Get dataset details
 */
export async function get(req: Request, res: Response): Promise<void> {
  const datasetId = parseIntParam(req.params.datasetId, 'datasetId');

  const result = await db
    .select({
      id: datasets.id,
      projectId: datasets.projectId,
      jobId: datasets.jobId,
      dataSourceId: datasets.dataSourceId,
      name: datasets.name,
      format: datasets.format,
      recordCount: datasets.recordCount,
      fileSize: datasets.fileSize,
      metadata: datasets.metadata,
      expiresAt: datasets.expiresAt,
      createdAt: datasets.createdAt,
      orgId: projects.organisationId,
    })
    .from(datasets)
    .innerJoin(projects, eq(datasets.projectId, projects.id))
    .where(and(eq(datasets.id, datasetId), isNull(datasets.deletedAt)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Dataset');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const ds = result[0];

  sendSuccess(res, {
    id: ds.id,
    projectId: ds.projectId,
    jobId: ds.jobId,
    dataSourceId: ds.dataSourceId,
    name: ds.name,
    format: ds.format,
    recordCount: ds.recordCount,
    fileSize: ds.fileSize,
    metadata: ds.metadata,
    expiresAt: ds.expiresAt,
    createdAt: ds.createdAt,
  });
}

/**
 * GET /api/datasets/:datasetId/download
 * Get pre-signed download URL
 */
export async function download(req: Request, res: Response): Promise<void> {
  const datasetId = parseIntParam(req.params.datasetId, 'datasetId');

  const result = await db
    .select({
      id: datasets.id,
      filePath: datasets.filePath,
      name: datasets.name,
      format: datasets.format,
      orgId: projects.organisationId,
    })
    .from(datasets)
    .innerJoin(projects, eq(datasets.projectId, projects.id))
    .where(and(eq(datasets.id, datasetId), isNull(datasets.deletedAt)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Dataset');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  if (!result[0].filePath) {
    throw new BadRequestError('Dataset file not available');
  }

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'dataset.download',
    resourceType: 'dataset',
    resourceId: datasetId,
  });

  // This would generate a presigned S3 URL - placeholder for now
  sendSuccess(res, {
    downloadUrl: `https://s3.amazonaws.com/foundry/${result[0].filePath}`,
    fileName: `${result[0].name}.${result[0].format}`,
    expiresIn: 3600, // 1 hour
  });
}

/**
 * DELETE /api/datasets/:datasetId
 * Soft delete dataset
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const datasetId = parseIntParam(req.params.datasetId, 'datasetId');

  const result = await db
    .select({
      id: datasets.id,
      orgId: projects.organisationId,
    })
    .from(datasets)
    .innerJoin(projects, eq(datasets.projectId, projects.id))
    .where(and(eq(datasets.id, datasetId), isNull(datasets.deletedAt)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Dataset');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const now = new Date();
  await db
    .update(datasets)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(datasets.id, datasetId));

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'dataset.delete',
    resourceType: 'dataset',
    resourceId: datasetId,
  });

  sendNoContent(res);
}
