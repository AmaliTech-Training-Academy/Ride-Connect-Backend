import path from 'node:path';

import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { logger } from '../lib/logger';

dotenv.config();

// Deliberately not config/env: a migration needs the connection string, not the
// secrets the running app validates.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  logger.error('DATABASE_URL is not set.');
  process.exit(1);
}

const migrationsFolder = path.resolve(__dirname, '../../drizzle');

/**Thisss Applies every pending migration in `drizzle/`, then closes the connection... yeah! */
const run = async (): Promise<void> => {
  const pool = new Pool({ connectionString });

  try {
    await migrate(drizzle(pool), { migrationsFolder });
    logger.info('Migrations applied.');
  } finally {
    await pool.end();
  }
};

run().catch((error: unknown) => {
  logger.error('Migration failed.', error);
  process.exit(1);
});
