import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { notFoundHandler } from './middlewares/notFound.middleware';
import { healthRouter } from './routes/health.routes';
import { testOnlyRouter } from './routes/test-only.routes';

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
