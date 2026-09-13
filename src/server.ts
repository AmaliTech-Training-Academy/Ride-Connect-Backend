import { app } from './app';
import { env } from './config/env';
import { pool } from './db';
import { logger } from './lib/logger';

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
});

const shutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received, shutting down.`);
  server.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
