import { Router } from 'express';

import { getHealth } from '../controllers/health.controller';
import { authRouter } from './auth.routes';
import { ridesRouter } from './rides.routes';

export const apiRouter = Router();

// No auth middleware: a session lookup would fail the liveness probe on a database blip.
apiRouter.get('/health', getHealth);

apiRouter.use(authRouter);
apiRouter.use('/rides', ridesRouter);
