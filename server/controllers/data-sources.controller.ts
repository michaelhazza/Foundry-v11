import { Request, Response } from 'express';
import { db } from '../db';
import { dataSources, projects, auditLogs } from '../db/schema';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { parseIntParam, parsePaginationParams } from '../lib/validation';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors';
import type { CreateDataSourceInput } from '../../shared/validators';

/**
 * GET /api/data-sources
 * List data sources for a project
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
    .from(dataSources)
    .where(and(eq(dataSources.projectId, projectId), isNull(dataSources.deletedAt)));

  const totalCount = totalResult[0].count;

  // Get data sources
  const result = await db
    .select({
      id: dataSources.id,
      name: dataSources.name,
      type: dataSources.type,
      format: dataSources.format,
      fileSize: dataSources.fileSize,
      recordCount: dataSources.recordCount,
      columns: dataSources.columns,
      status: dataSources.status,
      createdAt: dataSources.createdAt,
      updatedAt: dataSources.updatedAt,
    })
    .from(dataSources)
    .where(and(eq(dataSources.projectId, projectId), isNull(dataSources.deletedAt)))
    .orderBy(desc(dataSources.createdAt))
    .limit(take)
    .offset(skip);

  sendPaginated(res, result, { page, pageSize, totalCount });
}

/**
 * POST /api/data-sources
 * Create a new data source
 */
export async function create(req: Request, res: Response): Promise<void> {
  const { name, type, format } = req.body as CreateDataSourceInput;
  const projectId = req.body.projectId
    ? parseIntParam(String(req.body.projectId), 'projectId')
    : undefined;

  if (!projectId) {
    throw new BadRequestError('projectId is required');
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

  const result = await db
    .insert(dataSources)
    .values({
      projectId,
      name,
      type,
      format,
      status: 'pending',
    })
    .returning();

  const dataSource = result[0];

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'data_source.create',
    resourceType: 'data_source',
    resourceId: dataSource.id,
    metadata: { name, type, format, projectId },
  });

  sendCreated(res, {
    id: dataSource.id,
    name: dataSource.name,
    type: dataSource.type,
    format: dataSource.format,
    status: dataSource.status,
    createdAt: dataSource.createdAt,
    updatedAt: dataSource.updatedAt,
  });
}

/**
 * GET /api/data-sources/:dataSourceId
 * Get data source details
 */
export async function get(req: Request, res: Response): Promise<void> {
  const dataSourceId = parseIntParam(req.params.dataSourceId, 'dataSourceId');

  const result = await db
    .select({
      id: dataSources.id,
      projectId: dataSources.projectId,
      name: dataSources.name,
      type: dataSources.type,
      format: dataSources.format,
      filePath: dataSources.filePath,
      fileSize: dataSources.fileSize,
      recordCount: dataSources.recordCount,
      columns: dataSources.columns,
      metadata: dataSources.metadata,
      status: dataSources.status,
      createdAt: dataSources.createdAt,
      updatedAt: dataSources.updatedAt,
      orgId: projects.organisationId,
    })
    .from(dataSources)
    .innerJoin(projects, eq(dataSources.projectId, projects.id))
    .where(and(eq(dataSources.id, dataSourceId), isNull(dataSources.deletedAt)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Data source');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const ds = result[0];

  sendSuccess(res, {
    id: ds.id,
    projectId: ds.projectId,
    name: ds.name,
    type: ds.type,
    format: ds.format,
    fileSize: ds.fileSize,
    recordCount: ds.recordCount,
    columns: ds.columns,
    metadata: ds.metadata,
    status: ds.status,
    createdAt: ds.createdAt,
    updatedAt: ds.updatedAt,
  });
}

/**
 * DELETE /api/data-sources/:dataSourceId
 * Soft delete data source
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const dataSourceId = parseIntParam(req.params.dataSourceId, 'dataSourceId');

  const result = await db
    .select({
      id: dataSources.id,
      projectId: dataSources.projectId,
      orgId: projects.organisationId,
    })
    .from(dataSources)
    .innerJoin(projects, eq(dataSources.projectId, projects.id))
    .where(and(eq(dataSources.id, dataSourceId), isNull(dataSources.deletedAt)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Data source');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const now = new Date();
  await db
    .update(dataSources)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(dataSources.id, dataSourceId));

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'data_source.delete',
    resourceType: 'data_source',
    resourceId: dataSourceId,
  });

  sendNoContent(res);
}

/**
 * POST /api/data-sources/:dataSourceId/upload
 * Upload file to data source
 */
export async function uploadFile(req: Request, res: Response): Promise<void> {
  const dataSourceId = parseIntParam(req.params.dataSourceId, 'dataSourceId');

  const result = await db
    .select({
      id: dataSources.id,
      projectId: dataSources.projectId,
      orgId: projects.organisationId,
    })
    .from(dataSources)
    .innerJoin(projects, eq(dataSources.projectId, projects.id))
    .where(and(eq(dataSources.id, dataSourceId), isNull(dataSources.deletedAt)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Data source');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  // This would integrate with S3 service - for now return placeholder
  sendSuccess(res, {
    uploadUrl: `https://s3.amazonaws.com/foundry/${dataSourceId}/upload`,
    dataSourceId,
    message: 'Upload URL generated. Use PUT to upload file.',
  });
}

/**
 * GET /api/data-sources/:dataSourceId/preview
 * Preview data source content
 */
export async function preview(req: Request, res: Response): Promise<void> {
  const dataSourceId = parseIntParam(req.params.dataSourceId, 'dataSourceId');
  const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 1000);

  const result = await db
    .select({
      id: dataSources.id,
      columns: dataSources.columns,
      recordCount: dataSources.recordCount,
      status: dataSources.status,
      filePath: dataSources.filePath,
      orgId: projects.organisationId,
    })
    .from(dataSources)
    .innerJoin(projects, eq(dataSources.projectId, projects.id))
    .where(and(eq(dataSources.id, dataSourceId), isNull(dataSources.deletedAt)))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Data source');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  if (result[0].status !== 'ready') {
    throw new BadRequestError('Data source is not ready for preview');
  }

  // This would fetch from S3 and parse - for now return placeholder
  sendSuccess(res, {
    columns: result[0].columns || [],
    rows: [],
    totalRecords: result[0].recordCount || 0,
    previewRecords: 0,
  });
}
