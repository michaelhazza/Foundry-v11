import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../errors';
import { db } from '../db';
import { users, organisations } from '../db/schema';
import { eq } from 'drizzle-orm';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        name: string | null;
        role: string;
        organisationId: number;
        organisation: {
          id: number;
          name: string;
          slug: string;
        };
      };
    }
  }
}

/**
 * Authentication middleware.
 * Validates JWT token and attaches user to request.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No authorization token provided');
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: number;
      email: string;
    };

    // Fetch user with organisation
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        organisationId: users.organisationId,
        orgId: organisations.id,
        orgName: organisations.name,
        orgSlug: organisations.slug,
      })
      .from(users)
      .innerJoin(organisations, eq(users.organisationId, organisations.id))
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (result.length === 0) {
      throw new UnauthorizedError('User not found');
    }

    const user = result[0];

    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organisationId: user.organisationId,
      organisation: {
        id: user.orgId,
        name: user.orgName,
        slug: user.orgSlug,
      },
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
}

/**
 * Role-based authorization middleware.
 * Use after authenticate middleware.
 *
 * @param roles - Array of allowed roles
 */
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Optional authentication middleware.
 * Does not fail if no token provided, but attaches user if valid token exists.
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  // If token exists, validate it
  await authenticate(req, res, next);
}
