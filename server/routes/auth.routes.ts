import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rate-limit';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../../shared/validators';
import * as authController from '../controllers/auth.controller';

const router = Router();

// POST /api/auth/register
router.post(
  '/register',
  authRateLimiter,
  validate(registerSchema),
  asyncHandler(authController.register)
);

// POST /api/auth/login
router.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  asyncHandler(authController.login)
);

// POST /api/auth/logout
router.post('/logout', authenticate, asyncHandler(authController.logout));

// GET /api/auth/me
router.get('/me', authenticate, asyncHandler(authController.me));

// PATCH /api/auth/profile
router.patch(
  '/profile',
  authenticate,
  validate(updateProfileSchema),
  asyncHandler(authController.updateProfile)
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  authRateLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword)
);

// GET /api/auth/reset-password/:token
router.get(
  '/reset-password/:token',
  asyncHandler(authController.validateResetToken)
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  authRateLimiter,
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword)
);

export default router;
