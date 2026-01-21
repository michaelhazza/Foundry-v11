import { Request, Response } from 'express';
import { db } from '../db';
import {
  projects,
  dataSources,
  datasets,
  processingJobs,
  auditLogs,
} from '../db/schema';
import { eq, and, isNull, desc, asc, count, sql } from 'drizzle-orm';
import { parseIntParam, parsePaginationParams, validateSortParams } from '../lib/validation';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError } from '../errors';
import type { CreateProjectInput, UpdateProjectInput } from '../../shared/validators';

/**
 * GET /api/projects
 * List user's organisation projects
 */
export async function list(req: Request, res: Response): Promise<void> {
  const { page, pageSize, skip, take } = parsePaginationParams(req.query);
  const { sortBy, sortOrder } = validateSortParams(
    req.query.sort_by,
    req.query.sort_order,
    ['created_at', 'updated_at', 'name']
  );
  const statusFilter = req.query.status as string | undefined;

  // Build where clause
  const whereConditions = [
    eq(projects.organisationId, req.user!.organisationId),
    isNull(projects.deletedAt),
  ];

  if (statusFilter && statusFilter !== 'all') {
    whereConditions.push(eq(projects.status, statusFilter));
  }

  // Get total count
  const totalResult = await db
    .select({ count: count() })
    .from(projects)
    .where(and(...whereConditions));

  const totalCount = totalResult[0].count;

  // Get projects with counts
  const orderColumn = sortBy === 'name' ? projects.name :
                       sortBy === 'updated_at' ? projects.updatedAt :
                       projects.createdAt;

  const projectsResult = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      targetSchema: projects.targetSchema,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(...whereConditions))
    .orderBy(sortOrder === 'asc' ? asc(orderColumn) : desc(orderColumn))
    .limit(take)
    .offset(skip);

  // Get counts for each project
  const projectsWithCounts = await Promise.all(
    projectsResult.map(async (project) => {
      const [dsCount, datasetCount, jobCount] = await Promise.all([
        db
          .select({ count: count() })
          .from(dataSources)
          .where(and(eq(dataSources.projectId, project.id), isNull(dataSources.deletedAt))),
        db
          .select({ count: count() })
          .from(datasets)
          .where(and(eq(datasets.projectId, project.id), isNull(datasets.deletedAt))),
        db
          .select({ count: count() })
          .from(processingJobs)
          .where(eq(processingJobs.projectId, project.id)),
      ]);

      return {
        ...project,
        dataSourceCount: dsCount[0].count,
        datasetCount: datasetCount[0].count,
        jobCount: jobCount[0].count,
      };
    })
  );

  sendPaginated(res, projectsWithCounts, { page, pageSize, totalCount });
}

/**
 * POST /api/projects
 * Create a new project
 */
export async function create(req: Request, res: Response): Promise<void> {
  const { name, description, targetSchema } = req.body as CreateProjectInput;

  const result = await db
    .insert(projects)
    .values({
      name,
      description,
      targetSchema,
      organisationId: req.user!.organisationId,
      userId: req.user!.id,
    })
    .returning();

  const project = result[0];

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'project.create',
    resourceType: 'project',
    resourceId: project.id,
    metadata: { name },
  });

  sendCreated(res, {
    id: project.id,
    name: project.name,
    description: project.description,
    targetSchema: project.targetSchema,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
}

/**
 * GET /api/projects/:projectId
 * Get project details
 */
export async function get(req: Request, res: Response): Promise<void> {
  const projectId = parseIntParam(req.params.projectId, 'projectId');

  const result = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        isNull(projects.deletedAt)
      )
    )
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Project');
  }

  const project = result[0];

  // Check organisation access
  if (project.organisationId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  sendSuccess(res, {
    id: project.id,
    name: project.name,
    description: project.description,
    targetSchema: project.targetSchema,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
}

/**
 * PATCH /api/projects/:projectId
 * Update project
 */
export async function update(req: Request, res: Response): Promise<void> {
  const projectId = parseIntParam(req.params.projectId, 'projectId');
  const { name, description, status } = req.body as UpdateProjectInput;

  // Get existing project
  const existing = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Project');
  }

  // Check organisation access
  if (existing[0].organisationId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const updateData: Partial<{
    name: string;
    description: string | null;
    status: string;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (status !== undefined) updateData.status = status;

  const result = await db
    .update(projects)
    .set(updateData)
    .where(eq(projects.id, projectId))
    .returning();

  const project = result[0];

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'project.update',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { name, description, status },
  });

  sendSuccess(res, {
    id: project.id,
    name: project.name,
    description: project.description,
    targetSchema: project.targetSchema,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
}

/**
 * DELETE /api/projects/:projectId
 * Soft delete project
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const projectId = parseIntParam(req.params.projectId, 'projectId');

  // Get existing project
  const existing = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Project');
  }

  // Check organisation access
  if (existing[0].organisationId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const now = new Date();

  // Soft delete project and related resources
  await db
    .update(projects)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(projects.id, projectId));

  await db
    .update(dataSources)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(dataSources.projectId, projectId));

  await db
    .update(datasets)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(datasets.projectId, projectId));

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'project.delete',
    resourceType: 'project',
    resourceId: projectId,
  });

  sendNoContent(res);
}

/**
 * GET /api/projects/:projectId/summary
 * Get project statistics
 */
export async function summary(req: Request, res: Response): Promise<void> {
  const projectId = parseIntParam(req.params.projectId, 'projectId');

  // Get existing project
  const existing = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError('Project');
  }

  // Check organisation access
  if (existing[0].organisationId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  // Get data source stats
  const dsStats = await db
    .select({
      count: count(),
      totalRecords: sql<number>`COALESCE(SUM(${dataSources.recordCount}), 0)`,
    })
    .from(dataSources)
    .where(and(eq(dataSources.projectId, projectId), isNull(dataSources.deletedAt)));

  // Get dataset stats
  const datasetStats = await db
    .select({
      count: count(),
      totalRecords: sql<number>`COALESCE(SUM(${datasets.recordCount}), 0)`,
    })
    .from(datasets)
    .where(and(eq(datasets.projectId, projectId), isNull(datasets.deletedAt)));

  // Get job stats
  const jobStats = await db
    .select({
      total: count(),
      completed: sql<number>`COUNT(CASE WHEN ${processingJobs.status} = 'completed' THEN 1 END)`,
      failed: sql<number>`COUNT(CASE WHEN ${processingJobs.status} = 'failed' THEN 1 END)`,
      processing: sql<number>`COUNT(CASE WHEN ${processingJobs.status} = 'processing' THEN 1 END)`,
      pending: sql<number>`COUNT(CASE WHEN ${processingJobs.status} = 'pending' THEN 1 END)`,
    })
    .from(processingJobs)
    .where(eq(processingJobs.projectId, projectId));

  // Get last processed job
  const lastJob = await db
    .select({ completedAt: processingJobs.completedAt })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.projectId, projectId),
        eq(processingJobs.status, 'completed')
      )
    )
    .orderBy(desc(processingJobs.completedAt))
    .limit(1);

  sendSuccess(res, {
    project: {
      id: existing[0].id,
      name: existing[0].name,
      status: existing[0].status,
    },
    dataSources: {
      count: dsStats[0].count,
      totalRecords: Number(dsStats[0].totalRecords),
    },
    datasets: {
      count: datasetStats[0].count,
      totalRecords: Number(datasetStats[0].totalRecords),
    },
    jobs: {
      total: jobStats[0].total,
      completed: Number(jobStats[0].completed),
      failed: Number(jobStats[0].failed),
      processing: Number(jobStats[0].processing),
      pending: Number(jobStats[0].pending),
    },
    lastProcessedAt: lastJob[0]?.completedAt || null,
  });
}
