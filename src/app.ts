import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { notFoundHandler } from './middlewares/notFound.middleware';
import { healthRouter } from './routes/health.routes';
import { testOnlyRouter } from './routes/test-only.routes';

/**
 * Fully configured Express application. Deliberately has no `.listen()`
 * call so it can be started by `src/server.ts` or exercised directly by
 * tests (e.g. via supertest) without binding a network port.
 */
export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(healthRouter);

if (env.nodeEnv === 'test') {
  app.use(testOnlyRouter);
}

app.use(notFoundHandler);
app.use(errorHandler);
