import { Router } from 'express';

import { createRide } from '../controllers/rides.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createRideSchema } from '../validators/rides.validator';

export const ridesRouter = Router();

ridesRouter.post('/rides', requireAuth, validate({ body: createRideSchema }), createRide);
