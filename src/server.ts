import { app } from './app';
import { env } from './config/env';
import { pool } from './db';

const server = app.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`${signal} received, shutting down.`);
  server.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
