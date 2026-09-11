import { defineConfig } from 'drizzle-kit';
import { env } from './src/config/env';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: env.databaseUrl,
    ssl: env.databaseSsl ? 'require' : false,
  },
  strict: true,
  verbose: true,
});
