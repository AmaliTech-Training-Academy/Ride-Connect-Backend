/**
 * Shared setup for the auth test suites.
 *
 * Loaded via `setupFiles` before any application module is imported, so that
 * `DATABASE_URL` already points at the test database by the time
 * `src/db/index.ts` builds its connection pool. Without this the suites would
 * run against the development database and truncate real data.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { vi } from 'vitest';

(globalThis as typeof globalThis & { jest?: typeof vi }).jest = vi;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL; the suite truncates tables.');
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET ??= 'test-secret-not-used-outside-tests';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';

const testPool = new Pool({ connectionString: testDatabaseUrl });
const testDb = drizzle(testPool);

await testDb.execute(
  sql`ALTER TABLE IF EXISTS "rides" ADD COLUMN IF NOT EXISTS "route_description" varchar(500);`,
);

await testPool.end();
