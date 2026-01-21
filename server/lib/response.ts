import { Response } from 'express';

/**
 * Send successful response with data.
 * HTTP 200 OK
 *
 * @param res - Express response object
 * @param data - Response data
 * @param meta - Optional metadata
 */
export function sendSuccess(res: Response, data: any, meta?: any): void {
  res.status(200).json({
    data,
    ...(meta && { meta }),
  });
}

/**
 * Send created response.
 * HTTP 201 Created
 *
 * @param res - Express response object
 * @param data - Created resource data
 */
export function sendCreated(res: Response, data: any): void {
  res.status(201).json({
    data,
  });
}

/**
 * Send paginated response.
 * HTTP 200 OK
 *
 * @param res - Express response object
 * @param data - Array of resources
 * @param pagination - Pagination metadata
 */
export function sendPaginated(
  res: Response,
  data: any[],
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
  }
): void {
  const totalPages = Math.ceil(pagination.totalCount / pagination.pageSize);

  res.status(200).json({
    data,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages,
      totalCount: pagination.totalCount,
    },
  });
}

/**
 * Send no content response.
 * HTTP 204 No Content
 *
 * @param res - Express response object
 */
export function sendNoContent(res: Response): void {
  res.status(204).send();
}
