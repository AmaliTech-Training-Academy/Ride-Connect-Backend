import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralized, typed access to environment variables. Import this instead of
 * reading `process.env` directly so defaults and parsing live in one place.
 */
export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
};
