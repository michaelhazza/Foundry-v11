import { Request, Response } from 'express';
import { db } from '../db';
import { schemaMappings, dataSources, projects, auditLogs } from '../db/schema';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { parseIntParam, parsePaginationParams } from '../lib/validation';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors';
import type {
  CreateSchemaMappingInput,
  UpdateSchemaMappingInput,
} from '../../shared/validators';

/**
 * GET /api/schema-mappings
 * List schema mappings for a project
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
    .from(schemaMappings)
    .where(eq(schemaMappings.projectId, projectId));

  const totalCount = totalResult[0].count;

  // Get mappings with data source info
  const result = await db
    .select({
      id: schemaMappings.id,
      projectId: schemaMappings.projectId,
      dataSourceId: schemaMappings.dataSourceId,
      dataSourceName: dataSources.name,
      mappingConfig: schemaMappings.mappingConfig,
      piiConfig: schemaMappings.piiConfig,
      filterConfig: schemaMappings.filterConfig,
      isActive: schemaMappings.isActive,
      createdAt: schemaMappings.createdAt,
      updatedAt: schemaMappings.updatedAt,
    })
    .from(schemaMappings)
    .innerJoin(dataSources, eq(schemaMappings.dataSourceId, dataSources.id))
    .where(eq(schemaMappings.projectId, projectId))
    .orderBy(desc(schemaMappings.createdAt))
    .limit(take)
    .offset(skip);

  sendPaginated(res, result, { page, pageSize, totalCount });
}

/**
 * POST /api/schema-mappings
 * Create a new schema mapping
 */
export async function create(req: Request, res: Response): Promise<void> {
  const { dataSourceId, mappingConfig, piiConfig, filterConfig } =
    req.body as CreateSchemaMappingInput;
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

  // Verify data source belongs to project
  const ds = await db
    .select()
    .from(dataSources)
    .where(
      and(
        eq(dataSources.id, dataSourceId),
        eq(dataSources.projectId, projectId),
        isNull(dataSources.deletedAt)
      )
    )
    .limit(1);

  if (ds.length === 0) {
    throw new NotFoundError('Data source');
  }

  const result = await db
    .insert(schemaMappings)
    .values({
      projectId,
      dataSourceId,
      mappingConfig: mappingConfig || {},
      piiConfig: piiConfig || null,
      filterConfig: filterConfig || null,
    })
    .returning();

  const mapping = result[0];

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'schema_mapping.create',
    resourceType: 'schema_mapping',
    resourceId: mapping.id,
    metadata: { projectId, dataSourceId },
  });

  sendCreated(res, {
    id: mapping.id,
    projectId: mapping.projectId,
    dataSourceId: mapping.dataSourceId,
    mappingConfig: mapping.mappingConfig,
    piiConfig: mapping.piiConfig,
    filterConfig: mapping.filterConfig,
    isActive: mapping.isActive,
    createdAt: mapping.createdAt,
    updatedAt: mapping.updatedAt,
  });
}

/**
 * GET /api/schema-mappings/:mappingId
 * Get schema mapping details
 */
export async function get(req: Request, res: Response): Promise<void> {
  const mappingId = parseIntParam(req.params.mappingId, 'mappingId');

  const result = await db
    .select({
      id: schemaMappings.id,
      projectId: schemaMappings.projectId,
      dataSourceId: schemaMappings.dataSourceId,
      dataSourceName: dataSources.name,
      mappingConfig: schemaMappings.mappingConfig,
      piiConfig: schemaMappings.piiConfig,
      filterConfig: schemaMappings.filterConfig,
      isActive: schemaMappings.isActive,
      createdAt: schemaMappings.createdAt,
      updatedAt: schemaMappings.updatedAt,
      orgId: projects.organisationId,
    })
    .from(schemaMappings)
    .innerJoin(dataSources, eq(schemaMappings.dataSourceId, dataSources.id))
    .innerJoin(projects, eq(schemaMappings.projectId, projects.id))
    .where(eq(schemaMappings.id, mappingId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Schema mapping');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const m = result[0];

  sendSuccess(res, {
    id: m.id,
    projectId: m.projectId,
    dataSourceId: m.dataSourceId,
    dataSourceName: m.dataSourceName,
    mappingConfig: m.mappingConfig,
    piiConfig: m.piiConfig,
    filterConfig: m.filterConfig,
    isActive: m.isActive,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  });
}

/**
 * PATCH /api/schema-mappings/:mappingId
 * Update schema mapping
 */
export async function update(req: Request, res: Response): Promise<void> {
  const mappingId = parseIntParam(req.params.mappingId, 'mappingId');
  const { mappingConfig, piiConfig, filterConfig, isActive } =
    req.body as UpdateSchemaMappingInput;

  const existing = await db
    .select({
      id: schemaMappings.id,
      orgId: projects.organisationId,
    })
    .from(schemaMappings)
    .innerJoin(projects, eq(schemaMappings.projectId, projects.id))
    .where(eq(schemaMappings.id, mappingId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Schema mapping');
  }

  if (existing[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const updateData: Partial<typeof schemaMappings.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (mappingConfig !== undefined) updateData.mappingConfig = mappingConfig;
  if (piiConfig !== undefined) updateData.piiConfig = piiConfig;
  if (filterConfig !== undefined) updateData.filterConfig = filterConfig;
  if (isActive !== undefined) updateData.isActive = isActive;

  const result = await db
    .update(schemaMappings)
    .set(updateData)
    .where(eq(schemaMappings.id, mappingId))
    .returning();

  const m = result[0];

  sendSuccess(res, {
    id: m.id,
    projectId: m.projectId,
    dataSourceId: m.dataSourceId,
    mappingConfig: m.mappingConfig,
    piiConfig: m.piiConfig,
    filterConfig: m.filterConfig,
    isActive: m.isActive,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  });
}

/**
 * DELETE /api/schema-mappings/:mappingId
 * Delete schema mapping
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const mappingId = parseIntParam(req.params.mappingId, 'mappingId');

  const existing = await db
    .select({
      id: schemaMappings.id,
      orgId: projects.organisationId,
    })
    .from(schemaMappings)
    .innerJoin(projects, eq(schemaMappings.projectId, projects.id))
    .where(eq(schemaMappings.id, mappingId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Schema mapping');
  }

  if (existing[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  await db.delete(schemaMappings).where(eq(schemaMappings.id, mappingId));

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'schema_mapping.delete',
    resourceType: 'schema_mapping',
    resourceId: mappingId,
  });

  sendNoContent(res);
}
