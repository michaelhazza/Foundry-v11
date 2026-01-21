/**
 * Base application error class.
 * All custom errors extend this class.
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Bad Request Error (400)
 * Used for invalid input, validation failures, malformed requests.
 */
export class BadRequestError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Unauthorized Error (401)
 * Used for missing or invalid authentication.
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Forbidden Error (403)
 * Used for insufficient permissions.
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Not Found Error (404)
 * Used when resource doesn't exist.
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Conflict Error (409)
 * Used for duplicate resources, constraint violations.
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Gone Error (410)
 * Used for expired resources like tokens.
 */
export class GoneError extends AppError {
  constructor(message: string) {
    super(message, 410, 'GONE');
  }
}

/**
 * Unprocessable Entity Error (422)
 * Used for business logic validation failures.
 */
export class UnprocessableEntityError extends AppError {
  constructor(message: string) {
    super(message, 422, 'UNPROCESSABLE_ENTITY');
  }
}

/**
 * Rate Limit Error (429)
 * Used when rate limit exceeded.
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Internal Server Error (500)
 * Used for unexpected errors.
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}
