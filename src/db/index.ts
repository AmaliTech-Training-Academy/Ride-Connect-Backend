import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '../config/env';
import * as schema from './schema';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export { schema };

/** Anything a service can run a query on — the pool or an open transaction. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
