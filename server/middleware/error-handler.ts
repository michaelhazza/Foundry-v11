import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';

/**
 * Global error handling middleware.
 * Catches all errors and returns consistent JSON response.
 *
 * CRITICAL: This must be the LAST middleware in the chain.
 * Place after all routes in server/app.ts.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Log error for debugging
  console.error('[Error Handler]', {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Handle known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? err.message
          : 'Internal server error',
    },
  });
}

/**
 * Async route wrapper to catch Promise rejections.
 * Use this to wrap async route handlers.
 *
 * @example
 * router.get('/projects', asyncHandler(async (req, res) => {
 *   const projects = await getProjects();
 *   sendSuccess(res, projects);
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
