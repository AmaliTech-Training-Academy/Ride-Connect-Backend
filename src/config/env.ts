import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  // AWS-hosted Postgres (RDS/Aurora) generally requires SSL; keep it on by default
  // and let local development opt out via DATABASE_SSL=false.
  databaseSsl: process.env.DATABASE_SSL !== 'false',
  betterAuthSecret: process.env.BETTER_AUTH_SECRET || '',
  betterAuthUrl:
    process.env.BETTER_AUTH_URL || `http://localhost:${Number(process.env.PORT) || 3000}`,
};
