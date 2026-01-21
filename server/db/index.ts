import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

/**
 * PostgreSQL connection using postgres-js driver.
 * Per Constitution Section D, this is the required driver.
 *
 * Connection pool configuration:
 * - max: 10 connections
 * - idle_timeout: 30 seconds
 * - connect_timeout: 10 seconds
 */
const queryClient = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  prepare: true,
});

/**
 * Drizzle ORM instance.
 * CRITICAL: Use Core Select API only, NOT Query API.
 *
 * Correct: db.select().from(projects).where(eq(projects.id, id))
 * Wrong: db.query.projects.findFirst({ where: eq(projects.id, id) })
 */
export const db = drizzle(queryClient, { schema });

/**
 * Close database connection.
 * Use during graceful shutdown.
 */
export async function closeDatabase(): Promise<void> {
  await queryClient.end();
  console.log('Database connection closed');
}
