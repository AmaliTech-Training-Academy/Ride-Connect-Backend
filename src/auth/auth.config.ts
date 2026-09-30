/**
 * better-auth instance for RideConnect.
 *
 * Email + password only — no social providers. better-auth owns credential storage
 * entirely: the scrypt hash lands on the `account` row with `provider_id = 'credential'`,
 * and `users` never holds a password.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { openAPI } from 'better-auth/plugins';

import { env } from '../config/env';
import { db, schema } from '../db';
import { logger } from '../lib/logger';

const MIN_PASSWORD_LENGTH = 8;

export const ALLOWED_EMAIL_DOMAINS = env.ALLOWED_EMAIL_DOMAINS;

export const EMAIL_DOMAIN_NOT_ALLOWED_CODE = 'EMAIL_DOMAIN_NOT_ALLOWED';

export const EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE = `Registration is restricted to ${ALLOWED_EMAIL_DOMAINS.map((domain) => `@${domain}`).join(' or ')} email addresses.`;

/**
 * The domain of an address, lowercased and trimmed, or `null` when the input is not a
 * usable address.
 *
 * @param email Address to read the domain from, at any casing or padding.
 * @returns The lowercased domain, or `null` if the address is malformed.
 */
export function emailDomainOf(email: unknown): string | null {
  if (typeof email !== 'string') return null;

  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');

  if (at < 1) return null;

  const localPart = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);

  if (!domain || localPart.includes('@')) return null;

  return domain;
}

/** Whether an address may register. Exact domain match only: subdomains and look-alikes fail. */
export function isAllowedEmailDomain(email: unknown): boolean {
  const domain = emailDomainOf(email);

  return domain !== null && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export function domainNotAllowedError(): APIError {
  return APIError.from('FORBIDDEN', {
    code: EMAIL_DOMAIN_NOT_ALLOWED_CODE,
    message: EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE,
  });
}

export const auth = betterAuth({
  appName: 'RideConnect',
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.TRUSTED_ORIGINS,

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
    // caller. We need the conflict to surface, so both stay off.
    autoSignIn: true,
  },

  user: {
    modelName: 'users',
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (isAllowedEmailDomain(user.email)) return;

          logger.warn(
            `[auth] Rejected sign-up for "${user.email}": ${EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE}`,
          );

          throw domainNotAllowedError();
        },
      },
    },
  },

  advanced: {
    database: {
      // Every primary key in the schema is a Postgres `uuid` column, so ids
      // must be UUIDs rather than better-auth's default random strings.
      generateId: 'uuid',
    },
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  },

  // The schema feeds the Auth tab of /api/docs; better-auth's own Scalar page would
  // be a second, competing reference.
  plugins: [openAPI({ disableDefaultReference: true })],
});

export type Auth = typeof auth;
