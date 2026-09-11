/**
 * better-auth instance for RideConnect.
 *
 * Email + password only — no social providers, no plugins. better-auth owns
 * credential storage entirely: the scrypt hash lands on the `account` row with
 * `provider_id = 'credential'`, and `users` never holds a password.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db, schema } from '../db';

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!secret) {
  throw new Error('BETTER_AUTH_SECRET is not set. Copy .env.example to .env and fill it in.');
}

if (!baseURL) {
  throw new Error('BETTER_AUTH_URL is not set. Copy .env.example to .env and fill it in.');
}

export const MIN_PASSWORD_LENGTH = 8;

export const auth = betterAuth({
  appName: 'RideConnect',
  secret,
  baseURL,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    // better-auth's default model names are singular (`user`). Our domain
    // table is `users`, so the user model is remapped; the remaining models
    // already match the table names defined in the schema.
    usePlural: false,
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    // Email verification is out of scope for this story.
    requireEmailVerification: false,
    // Both `requireEmailVerification: true` and `autoSignIn: false` switch
    // better-auth into returning a synthetic success for an already-registered
    // email, an anti-enumeration measure that would hide the duplicate from the
    // caller. We need the conflict to surface, so both stay off and sign-up
    // raises USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, which the error handler
    // translates to 409.
    autoSignIn: true,
  },

  user: {
    modelName: 'users',
  },

  advanced: {
    database: {
      // Every primary key in the schema is a Postgres `uuid` column, so ids
      // must be UUIDs rather than better-auth's default random strings.
      generateId: 'uuid',
    },
  },

  plugins: [],
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];
