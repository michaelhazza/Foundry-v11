import { z } from 'zod';

// Password validation regex: min 8 chars, 1 uppercase, 1 digit
const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

// Auth Schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      passwordRegex,
      'Password must contain at least 1 uppercase letter and 1 digit'
    ),
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  inviteToken: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      passwordRegex,
      'Password must contain at least 1 uppercase letter and 1 digit'
    ),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8)
    .regex(passwordRegex)
    .optional(),
});

// Project Schemas
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name is too long'),
  description: z.string().max(1000, 'Description is too long').optional(),
  targetSchema: z.enum(['conversation']).default('conversation'),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

// Data Source Schemas
export const createDataSourceSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['file', 'api']).default('file'),
  format: z.enum(['csv', 'json', 'xlsx']),
});

// Schema Mapping Schemas
export const createSchemaMappingSchema = z.object({
  dataSourceId: z.number().int().positive(),
  mappingConfig: z.record(z.string(), z.string()).optional(),
  piiConfig: z.object({
    enabledTypes: z.array(z.string()),
    customPatterns: z.array(z.object({
      name: z.string(),
      pattern: z.string(),
    })).optional(),
    strategies: z.record(z.string(), z.enum(['redact', 'pseudonymize', 'hash'])),
  }).optional(),
  filterConfig: z.object({
    rules: z.array(z.object({
      field: z.string(),
      operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains']),
      value: z.any(),
    })),
  }).optional(),
});

export const updateSchemaMappingSchema = z.object({
  mappingConfig: z.record(z.string(), z.string()).optional(),
  piiConfig: z.object({
    enabledTypes: z.array(z.string()),
    customPatterns: z.array(z.object({
      name: z.string(),
      pattern: z.string(),
    })).optional(),
    strategies: z.record(z.string(), z.enum(['redact', 'pseudonymize', 'hash'])),
  }).optional(),
  filterConfig: z.object({
    rules: z.array(z.object({
      field: z.string(),
      operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains']),
      value: z.any(),
    })),
  }).optional(),
  isActive: z.boolean().optional(),
});

// Processing Job Schemas
export const createJobSchema = z.object({
  dataSourceId: z.number().int().positive(),
  schemaMappingId: z.number().int().positive().optional(),
  outputFormat: z.enum(['json', 'jsonl', 'csv']).default('jsonl'),
  outputName: z.string().max(200).optional(),
});

// Organisation Schemas
export const createInvitationSchema = z.object({
  email: z.string().email('Invalid email format'),
  role: z.enum(['admin', 'user']).default('user'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'user']),
});

// Types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateDataSourceInput = z.infer<typeof createDataSourceSchema>;
export type CreateSchemaMappingInput = z.infer<typeof createSchemaMappingSchema>;
export type UpdateSchemaMappingInput = z.infer<typeof updateSchemaMappingSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
