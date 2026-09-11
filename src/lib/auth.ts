import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { env } from '../config/env';
import { db } from '../db/client';
import * as schema from '../db/schema';

/**
 * Better Auth instance for RideConnect. Email + password only — no
 * OAuth/SSO providers are configured. Persists to the same Postgres
 * database as the rest of the app via the Drizzle adapter.
 */
export const auth = betterAuth({
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthUrl,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    usePlural: false,
  }),
  emailAndPassword: {
    enabled: true,
  },
});
