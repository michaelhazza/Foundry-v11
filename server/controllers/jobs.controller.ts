import { Request, Response } from 'express';
import { db } from '../db';
import {
  processingJobs,
  dataSources,
  schemaMappings,
  projects,
  auditLogs,
} from '../db/schema';
import { eq, and, isNull, desc, count } from 'drizzle-orm';
import { parseIntParam, parsePaginationParams } from '../lib/validation';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError, BadRequestError } from '../errors';
import type { CreateJobInput } from '../../shared/validators';

/**
 * GET /api/jobs
 * List jobs for a project
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
  const statusFilter = req.query.status as string | undefined;

  const whereConditions = [eq(processingJobs.projectId, projectId)];
  if (statusFilter) {
    whereConditions.push(eq(processingJobs.status, statusFilter));
  }

  // Get total count
  const totalResult = await db
    .select({ count: count() })
    .from(processingJobs)
    .where(and(...whereConditions));

  const totalCount = totalResult[0].count;

  // Get jobs with data source info
  const result = await db
    .select({
      id: processingJobs.id,
      projectId: processingJobs.projectId,
      dataSourceId: processingJobs.dataSourceId,
      dataSourceName: dataSources.name,
      schemaMappingId: processingJobs.schemaMappingId,
      status: processingJobs.status,
      progress: processingJobs.progress,
      stage: processingJobs.stage,
      outputFormat: processingJobs.outputFormat,
      outputName: processingJobs.outputName,
      inputRecordCount: processingJobs.inputRecordCount,
      outputRecordCount: processingJobs.outputRecordCount,
      piiDetectedCount: processingJobs.piiDetectedCount,
      errorMessage: processingJobs.errorMessage,
      startedAt: processingJobs.startedAt,
      completedAt: processingJobs.completedAt,
      createdAt: processingJobs.createdAt,
    })
    .from(processingJobs)
    .innerJoin(dataSources, eq(processingJobs.dataSourceId, dataSources.id))
    .where(and(...whereConditions))
    .orderBy(desc(processingJobs.createdAt))
    .limit(take)
    .offset(skip);

  sendPaginated(res, result, { page, pageSize, totalCount });
}

/**
 * POST /api/jobs
 * Create a new processing job
 */
export async function create(req: Request, res: Response): Promise<void> {
  const { dataSourceId, schemaMappingId, outputFormat, outputName } =
    req.body as CreateJobInput;
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

  // Verify data source belongs to project and is ready
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

  if (ds[0].status !== 'ready') {
    throw new BadRequestError('Data source is not ready for processing');
  }

  // Verify schema mapping if provided
  if (schemaMappingId) {
    const mapping = await db
      .select()
      .from(schemaMappings)
      .where(
        and(
          eq(schemaMappings.id, schemaMappingId),
          eq(schemaMappings.projectId, projectId)
        )
      )
      .limit(1);

    if (mapping.length === 0) {
      throw new NotFoundError('Schema mapping');
    }
  }

  const result = await db
    .insert(processingJobs)
    .values({
      projectId,
      dataSourceId,
      schemaMappingId: schemaMappingId || null,
      outputFormat,
      outputName: outputName || `export-${Date.now()}`,
      inputRecordCount: ds[0].recordCount || 0,
    })
    .returning();

  const job = result[0];

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'job.create',
    resourceType: 'job',
    resourceId: job.id,
    metadata: { projectId, dataSourceId, schemaMappingId, outputFormat },
  });

  sendCreated(res, {
    id: job.id,
    projectId: job.projectId,
    dataSourceId: job.dataSourceId,
    schemaMappingId: job.schemaMappingId,
    status: job.status,
    progress: job.progress,
    outputFormat: job.outputFormat,
    outputName: job.outputName,
    createdAt: job.createdAt,
  });
}

/**
 * GET /api/jobs/:jobId
 * Get job details
 */
export async function get(req: Request, res: Response): Promise<void> {
  const jobId = parseIntParam(req.params.jobId, 'jobId');

  const result = await db
    .select({
      id: processingJobs.id,
      projectId: processingJobs.projectId,
      dataSourceId: processingJobs.dataSourceId,
      dataSourceName: dataSources.name,
      schemaMappingId: processingJobs.schemaMappingId,
      status: processingJobs.status,
      progress: processingJobs.progress,
      stage: processingJobs.stage,
      outputFormat: processingJobs.outputFormat,
      outputName: processingJobs.outputName,
      inputRecordCount: processingJobs.inputRecordCount,
      outputRecordCount: processingJobs.outputRecordCount,
      piiDetectedCount: processingJobs.piiDetectedCount,
      filteredOutCount: processingJobs.filteredOutCount,
      errorMessage: processingJobs.errorMessage,
      startedAt: processingJobs.startedAt,
      completedAt: processingJobs.completedAt,
      createdAt: processingJobs.createdAt,
      orgId: projects.organisationId,
    })
    .from(processingJobs)
    .innerJoin(dataSources, eq(processingJobs.dataSourceId, dataSources.id))
    .innerJoin(projects, eq(processingJobs.projectId, projects.id))
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Job');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const job = result[0];

  sendSuccess(res, {
    id: job.id,
    projectId: job.projectId,
    dataSourceId: job.dataSourceId,
    dataSourceName: job.dataSourceName,
    schemaMappingId: job.schemaMappingId,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    outputFormat: job.outputFormat,
    outputName: job.outputName,
    inputRecordCount: job.inputRecordCount,
    outputRecordCount: job.outputRecordCount,
    piiDetectedCount: job.piiDetectedCount,
    filteredOutCount: job.filteredOutCount,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
  });
}

/**
 * POST /api/jobs/:jobId/cancel
 * Cancel a pending/processing job
 */
export async function cancel(req: Request, res: Response): Promise<void> {
  const jobId = parseIntParam(req.params.jobId, 'jobId');

  const result = await db
    .select({
      id: processingJobs.id,
      status: processingJobs.status,
      orgId: projects.organisationId,
    })
    .from(processingJobs)
    .innerJoin(projects, eq(processingJobs.projectId, projects.id))
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Job');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  if (!['pending', 'processing'].includes(result[0].status)) {
    throw new BadRequestError('Job cannot be cancelled');
  }

  await db
    .update(processingJobs)
    .set({
      status: 'cancelled',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));

  // Create audit log
  await db.insert(auditLogs).values({
    organisationId: req.user!.organisationId,
    userId: req.user!.id,
    action: 'job.cancel',
    resourceType: 'job',
    resourceId: jobId,
  });

  sendSuccess(res, { message: 'Job cancelled successfully' });
}

/**
 * GET /api/jobs/:jobId/progress
 * Get job progress (real-time updates)
 */
export async function progress(req: Request, res: Response): Promise<void> {
  const jobId = parseIntParam(req.params.jobId, 'jobId');

  const result = await db
    .select({
      id: processingJobs.id,
      status: processingJobs.status,
      progress: processingJobs.progress,
      stage: processingJobs.stage,
      inputRecordCount: processingJobs.inputRecordCount,
      outputRecordCount: processingJobs.outputRecordCount,
      piiDetectedCount: processingJobs.piiDetectedCount,
      errorMessage: processingJobs.errorMessage,
      orgId: projects.organisationId,
    })
    .from(processingJobs)
    .innerJoin(projects, eq(processingJobs.projectId, projects.id))
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Job');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const job = result[0];

  sendSuccess(res, {
    id: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    stats: {
      inputRecordCount: job.inputRecordCount,
      outputRecordCount: job.outputRecordCount,
      piiDetectedCount: job.piiDetectedCount,
    },
    errorMessage: job.errorMessage,
  });
}

/**
 * GET /api/jobs/:jobId/logs
 * Get job processing logs
 */
export async function logs(req: Request, res: Response): Promise<void> {
  const jobId = parseIntParam(req.params.jobId, 'jobId');

  const result = await db
    .select({
      id: processingJobs.id,
      status: processingJobs.status,
      stage: processingJobs.stage,
      errorMessage: processingJobs.errorMessage,
      startedAt: processingJobs.startedAt,
      completedAt: processingJobs.completedAt,
      orgId: projects.organisationId,
    })
    .from(processingJobs)
    .innerJoin(projects, eq(processingJobs.projectId, projects.id))
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (result.length === 0) {
    throw new NotFoundError('Job');
  }

  if (result[0].orgId !== req.user!.organisationId) {
    throw new ForbiddenError();
  }

  const job = result[0];

  // Generate log entries from job state
  const logs = [];

  if (job.startedAt) {
    logs.push({
      timestamp: job.startedAt,
      level: 'info',
      message: 'Job started',
    });
  }

  if (job.stage) {
    logs.push({
      timestamp: new Date(),
      level: 'info',
      message: `Processing stage: ${job.stage}`,
    });
  }

  if (job.errorMessage) {
    logs.push({
      timestamp: job.completedAt || new Date(),
      level: 'error',
      message: job.errorMessage,
    });
  }

  if (job.status === 'completed' && job.completedAt) {
    logs.push({
      timestamp: job.completedAt,
      level: 'info',
      message: 'Job completed successfully',
    });
  }

  sendSuccess(res, { logs });
}
