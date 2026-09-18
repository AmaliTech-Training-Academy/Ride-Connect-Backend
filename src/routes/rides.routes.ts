import { Router } from 'express';

import {
  acceptRequest,
  createRequest,
  declineRequest,
  listRideRequests,
} from '../controllers/rideRequests.controller';
import { createRide, listMyRides, listRides } from '../controllers/rides.controller';
import { requireAuth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { requestIdParamsSchema, rideIdParamsSchema } from '../validators/rideRequests.validator';
import { createRideSchema, listRidesSchema } from '../validators/rides.validator';

export const ridesRouter = Router();

ridesRouter.get('/', requireAuth, validate({ query: listRidesSchema }), listRides);
ridesRouter.get('/mine', requireAuth, listMyRides);
ridesRouter.post('/', requireAuth, validate({ body: createRideSchema }), createRide);
ridesRouter.post(
  '/:rideId/requests',
  requireAuth,
  validate({ params: rideIdParamsSchema }),
  createRequest,
);
ridesRouter.get(
  '/:rideId/requests',
  requireAuth,
  validate({ params: rideIdParamsSchema }),
  listRideRequests,
);
ridesRouter.patch(
  '/:rideId/requests/:requestId/accept',
  requireAuth,
  validate({ params: requestIdParamsSchema }),
  acceptRequest,
);
ridesRouter.patch(
  '/:rideId/requests/:requestId/decline',
  requireAuth,
  validate({ params: requestIdParamsSchema }),
  declineRequest,
);
