import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { toNodeHandler } from 'better-auth/node';

import { auth } from './auth/auth.config';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler } from './middlewares/errorHandler.middleware';
import { notFoundHandler } from './middlewares/notFound.middleware';
import { responseMiddleware } from './middlewares/response.middleware';
import { apiRouter } from './routes';

export const createApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(responseMiddleware);
  app.use(helmet());
  app.use(cors({ origin: env.TRUSTED_ORIGINS, credentials: true }));
  app.use(
    morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
      stream: logger.stream,
      skip: () => env.NODE_ENV === 'test',
    }),
  );

  app.all('/api/auth/*', toNodeHandler(auth));
  app.use(express.json());

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export const app = createApp();
