import { BadRequestError } from '../errors';

/**
 * Parse integer from URL parameter with validation.
 * Throws BadRequestError if value is not a valid positive integer.
 *
 * @param value - Raw parameter value from req.params
 * @param paramName - Parameter name for error messages
 * @returns Parsed positive integer
 * @throws BadRequestError if value is not a valid positive integer
 *
 * @example
 * const projectId = parseIntParam(req.params.projectId, 'projectId');
 */
export function parseIntParam(value: string, paramName: string): number {
  const parsed = parseInt(value, 10);

  if (isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new BadRequestError(`${paramName} must be a positive integer`);
  }

  return parsed;
}

/**
 * Parse integer from query parameter with default value.
 * Returns default if value is missing or invalid.
 *
 * @param value - Raw query parameter value
 * @param defaultValue - Default value if missing/invalid
 * @param min - Minimum allowed value (optional)
 * @param max - Maximum allowed value (optional)
 * @returns Parsed integer or default
 *
 * @example
 * const page = parseQueryInt(req.query.page, 1, 1);
 * const limit = parseQueryInt(req.query.page_size, 20, 1, 100);
 */
export function parseQueryInt(
  value: any,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = parseInt(String(value), 10);

  if (isNaN(parsed) || !Number.isInteger(parsed)) {
    return defaultValue;
  }

  if (min !== undefined && parsed < min) {
    return min;
  }

  if (max !== undefined && parsed > max) {
    return max;
  }

  return parsed;
}

/**
 * Parse pagination parameters from query string.
 * Enforces limits: page >= 1, page_size between 1-100.
 *
 * @param query - Express req.query object
 * @returns Pagination parameters with page, pageSize, skip, take
 *
 * @example
 * const { page, pageSize, skip, take } = parsePaginationParams(req.query);
 * const results = await db.select()
 *   .from(projects)
 *   .limit(take)
 *   .offset(skip);
 */
export function parsePaginationParams(query: any): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = parseQueryInt(query.page, 1, 1);
  const pageSize = parseQueryInt(query.page_size, 20, 1, 100);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Validate sort parameters.
 * Throws BadRequestError if field not in allowedFields.
 *
 * @param sortBy - Sort field from query
 * @param sortOrder - Sort order from query (asc/desc)
 * @param allowedFields - Array of allowed field names
 * @returns Validated sort parameters
 * @throws BadRequestError if invalid field or order
 */
export function validateSortParams(
  sortBy: any,
  sortOrder: any,
  allowedFields: string[]
): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  const field = sortBy || allowedFields[0];
  const order = sortOrder === 'asc' ? 'asc' : 'desc';

  if (!allowedFields.includes(field)) {
    throw new BadRequestError(
      `Invalid sort field. Allowed: ${allowedFields.join(', ')}`
    );
  }

  return { sortBy: field, sortOrder: order };
}
