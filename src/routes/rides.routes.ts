import { Router } from 'express';

import { createRide, listRides } from '../controllers/rides.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createRideSchema, listRidesSchema } from '../validators/rides.validator';

export const ridesRouter = Router();

ridesRouter.get('/', requireAuth, validate({ query: listRidesSchema }), listRides);
ridesRouter.post('/', requireAuth, validate({ body: createRideSchema }), createRide);
