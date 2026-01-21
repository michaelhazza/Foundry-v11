import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  unique,
  json,
  bigint,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. organisations table
export const organisations = pgTable('organisations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  subscriptionTier: text('subscription_tier').notNull().default('free'),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Organisation = typeof organisations.$inferSelect;
export type NewOrganisation = typeof organisations.$inferInsert;

// 2. users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'restrict' }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  role: text('role').notNull().default('user'),
  status: text('status').notNull().default('active'),
  invitedBy: integer('invited_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// 3. invitations table
export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull().default('user'),
  token: text('token').notNull().unique(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;

// 4. projects table
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'restrict' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  description: text('description'),
  targetSchema: text('target_schema').notNull().default('conversation'),
  status: text('status').notNull().default('active'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// 5. dataSources table
export const dataSources = pgTable('data_sources', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull().default('file'), // file, api
  format: text('format').notNull(), // csv, json, xlsx
  filePath: text('file_path'),
  fileSize: bigint('file_size', { mode: 'number' }),
  recordCount: integer('record_count'),
  columns: json('columns').$type<string[]>(),
  metadata: json('metadata').$type<Record<string, any>>(),
  status: text('status').notNull().default('pending'), // pending, ready, error
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type DataSource = typeof dataSources.$inferSelect;
export type NewDataSource = typeof dataSources.$inferInsert;

// 6. schemaMappings table
export const schemaMappings = pgTable('schema_mappings', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  dataSourceId: integer('data_source_id')
    .notNull()
    .references(() => dataSources.id, { onDelete: 'cascade' }),
  mappingConfig: json('mapping_config').$type<Record<string, string>>(),
  piiConfig: json('pii_config').$type<{
    enabledTypes: string[];
    customPatterns: { name: string; pattern: string }[];
    strategies: Record<string, string>;
  }>(),
  filterConfig: json('filter_config').$type<{
    rules: { field: string; operator: string; value: any }[];
  }>(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SchemaMapping = typeof schemaMappings.$inferSelect;
export type NewSchemaMapping = typeof schemaMappings.$inferInsert;

// 7. processingJobs table
export const processingJobs = pgTable('processing_jobs', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  schemaMappingId: integer('schema_mapping_id').references(
    () => schemaMappings.id,
    { onDelete: 'set null' }
  ),
  dataSourceId: integer('data_source_id')
    .notNull()
    .references(() => dataSources.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // pending, processing, completed, failed, cancelled
  progress: integer('progress').notNull().default(0),
  stage: text('stage'),
  outputFormat: text('output_format').notNull().default('jsonl'),
  outputName: text('output_name'),
  inputRecordCount: integer('input_record_count'),
  outputRecordCount: integer('output_record_count'),
  piiDetectedCount: integer('pii_detected_count'),
  filteredOutCount: integer('filtered_out_count'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type NewProcessingJob = typeof processingJobs.$inferInsert;

// 8. datasets table
export const datasets = pgTable('datasets', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  jobId: integer('job_id').references(() => processingJobs.id, {
    onDelete: 'set null',
  }),
  dataSourceId: integer('data_source_id').references(() => dataSources.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  format: text('format').notNull(),
  recordCount: integer('record_count').notNull(),
  fileSize: bigint('file_size', { mode: 'number' }),
  filePath: text('file_path'),
  metadata: json('metadata').$type<Record<string, any>>(),
  expiresAt: timestamp('expires_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Dataset = typeof datasets.$inferSelect;
export type NewDataset = typeof datasets.$inferInsert;

// 9. oauthConnections table
export const oauthConnections = pgTable('oauth_connections', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  accountName: text('account_name'),
  accessToken: text('access_token').notNull(), // ENCRYPTED
  refreshToken: text('refresh_token'), // ENCRYPTED
  tokenExpiresAt: timestamp('token_expires_at'),
  isActive: boolean('is_active').notNull().default(true),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type OAuthConnection = typeof oauthConnections.$inferSelect;
export type NewOAuthConnection = typeof oauthConnections.$inferInsert;

// 10. auditLogs table
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  organisationId: integer('organisation_id').references(() => organisations.id, {
    onDelete: 'set null',
  }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId: integer('resource_id'),
  metadata: json('metadata').$type<Record<string, any>>(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// 11. passwordResetTokens table
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Relations
export const organisationsRelations = relations(organisations, ({ many }) => ({
  users: many(users),
  projects: many(projects),
  invitations: many(invitations),
  oauthConnections: many(oauthConnections),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [users.organisationId],
    references: [organisations.id],
  }),
  inviter: one(users, {
    fields: [users.invitedBy],
    references: [users.id],
  }),
  projects: many(projects),
  invitations: many(invitations),
  auditLogs: many(auditLogs),
  passwordResetTokens: many(passwordResetTokens),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [projects.organisationId],
    references: [organisations.id],
  }),
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  dataSources: many(dataSources),
  schemaMappings: many(schemaMappings),
  processingJobs: many(processingJobs),
  datasets: many(datasets),
}));

export const dataSourcesRelations = relations(dataSources, ({ one, many }) => ({
  project: one(projects, {
    fields: [dataSources.projectId],
    references: [projects.id],
  }),
  schemaMappings: many(schemaMappings),
  processingJobs: many(processingJobs),
  datasets: many(datasets),
}));

export const schemaMappingsRelations = relations(
  schemaMappings,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [schemaMappings.projectId],
      references: [projects.id],
    }),
    dataSource: one(dataSources, {
      fields: [schemaMappings.dataSourceId],
      references: [dataSources.id],
    }),
    processingJobs: many(processingJobs),
  })
);

export const processingJobsRelations = relations(
  processingJobs,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [processingJobs.projectId],
      references: [projects.id],
    }),
    schemaMapping: one(schemaMappings, {
      fields: [processingJobs.schemaMappingId],
      references: [schemaMappings.id],
    }),
    dataSource: one(dataSources, {
      fields: [processingJobs.dataSourceId],
      references: [dataSources.id],
    }),
    datasets: many(datasets),
  })
);

export const datasetsRelations = relations(datasets, ({ one }) => ({
  project: one(projects, {
    fields: [datasets.projectId],
    references: [projects.id],
  }),
  job: one(processingJobs, {
    fields: [datasets.jobId],
    references: [processingJobs.id],
  }),
  dataSource: one(dataSources, {
    fields: [datasets.dataSourceId],
    references: [dataSources.id],
  }),
}));

export const oauthConnectionsRelations = relations(
  oauthConnections,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [oauthConnections.organisationId],
      references: [organisations.id],
    }),
  })
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organisation: one(organisations, {
    fields: [auditLogs.organisationId],
    references: [organisations.id],
  }),
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organisation: one(organisations, {
    fields: [invitations.organisationId],
    references: [organisations.id],
  }),
  inviter: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  })
);
