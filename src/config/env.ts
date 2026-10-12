import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/** Shape of the process environment RideConnect boots with. Exported so tests can exercise validation without re-importing this module under a broken environment. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // A connection string, not a URL: zod's URL rules disagree with libpq over
  // `postgres://` and `postgresql://`, and `pg` reports a malformed one better.
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  // Off switch for /api/docs: the reference exposes every route and a live
  // request console, which a locked-down deployment may not want reachable.
  DOCS_ENABLED: z.stringbool().default(true),
  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .min(1)
    .default('amalitech.com,amalitechtraining.org')
    .transform((domains) =>
      domains
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean)
    ),
  TRUSTED_ORIGINS: z
    .string()
    .default('')
    .transform((origins) =>
      origins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  AWS_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  MEDIA_BASE_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  MEDIA_BASE_URL: (
    parsed.data.MEDIA_BASE_URL ?? `https://${parsed.data.S3_BUCKET}.s3.${parsed.data.AWS_REGION}.amazonaws.com`
  ).replace(/\/+$/, ''),
};
