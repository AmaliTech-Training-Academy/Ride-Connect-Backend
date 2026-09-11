import { sql } from 'drizzle-orm';

import { db, pool } from '../src/db';

/**
 * Removes every row written by the auth flows.
 *
 * `users` cascades to `account` and `session`, but all four are named
 * explicitly so the intent survives any future schema change.
 */
export async function resetAuthTables(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE "session", "account", "verification", "users" RESTART IDENTITY CASCADE`,
  );
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@rideconnect.test`;
}
