import { Router } from 'express';

import { getHealth } from '../controllers/health.controller';
import { successEnvelope } from '../lib/http/envelope.schema';
import { documentedRoute } from '../middlewares/documentedRoute.middleware';
import { healthResponseSchema } from '../validators/health.validator';
import { authRouter } from './auth.routes';
import { ridesRouter } from './rides.routes';

export const apiRouter = Router();

// No auth middleware: a session lookup would fail the liveness probe on a database blip.
apiRouter.get(
  '/health',
  documentedRoute({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'Liveness probe',
    responses: {
      200: { description: 'Service is up', schema: successEnvelope(healthResponseSchema) },
    },
  }),
  getHealth,
);

apiRouter.use(authRouter);
apiRouter.use('/rides', ridesRouter);
