import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { toNodeHandler } from 'better-auth/node';

import { auth } from './auth/auth.config';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { notFoundHandler } from './middlewares/notFound.middleware';
import { responseMiddleware } from './middlewares/response.middleware';
import { authRouter } from './routes/auth.routes';
import { healthRouter } from './routes/health.routes';
import { ridesRouter } from './routes/rides.routes';
import { testOnlyRouter } from './routes/test-only.routes';

export const createApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(responseMiddleware);
  app.use(helmet());
  app.use(cors({ origin: env.TRUSTED_ORIGINS, credentials: true }));

  app.all('/api/auth/*', toNodeHandler(auth));
  app.use(express.json());

  app.use(healthRouter);
  app.use(authRouter);
  app.use(ridesRouter);

  if (env.NODE_ENV === 'test') {
    app.use(testOnlyRouter);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export const app = createApp();
