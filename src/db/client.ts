import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../config/env';
import * as schema from './schema';

/**
 * Postgres.js connection used by Drizzle and, via `db`, by Better Auth's
 * Drizzle adapter. Reads its connection string from `DATABASE_URL` and toggles
 * SSL via `DATABASE_SSL` — most AWS-hosted Postgres (RDS/Aurora) requires SSL,
 * while a local Postgres instance usually doesn't have it configured.
 */
export const queryClient = postgres(env.databaseUrl, {
  ssl: env.databaseSsl ? 'require' : false,
});

export const db = drizzle(queryClient, { schema });
