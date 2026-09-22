import { Router } from 'express';
import { z } from 'zod';

import {
  acceptRequest,
  createRequest,
  declineRequest,
  listRideRequests,
} from '../controllers/rideRequests.controller';
import {
  cancelRide,
  createRide,
  listMyRides,
  listRides,
  updateRideStatus,
} from '../controllers/rides.controller';
import {
  errorEnvelope,
  successEnvelope,
  validationErrorEnvelope,
} from '../lib/http/envelope.schema';
import { requireAuth } from '../middlewares/auth.middleware';
import { documentedRoute } from '../middlewares/documentedRoute.middleware';
import {
  requestIdParamsSchema,
  rideIdParamsSchema,
  rideRequestDecisionSchema,
  rideRequestResponseSchema,
  rideRequestSummarySchema,
} from '../validators/rideRequests.validator';
import {
  createRideSchema,
  listRidesSchema,
  rideResponseSchema,
  rideStatusResponseSchema,
  updateRideStatusSchema,
} from '../validators/rides.validator';
import { validate } from '../middlewares/validate.middleware';

export const ridesRouter = Router();

const unauthorized = { description: 'No valid session', schema: errorEnvelope };
const invalidParams = { description: 'Malformed id in the path', schema: validationErrorEnvelope };

ridesRouter.get(
  '/',
  requireAuth,
  documentedRoute({
    method: 'get',
    path: '/rides',
    tags: ['Rides'],
    summary: 'Browse open rides',
    secured: true,
    query: listRidesSchema,
    responses: {
      200: { description: 'Matching rides', schema: successEnvelope(z.array(rideResponseSchema)) },
      400: { description: 'Malformed filter', schema: validationErrorEnvelope },
      401: unauthorized,
    },
  }),
  listRides,
);

ridesRouter.get('/mine', requireAuth, listMyRides);
ridesRouter.post(
  '/',
  requireAuth,
  documentedRoute({
    method: 'post',
    path: '/rides',
    tags: ['Rides'],
    summary: 'Publish a ride',
    secured: true,
    body: createRideSchema,
    responses: {
      201: { description: 'Ride created', schema: successEnvelope(rideResponseSchema) },
      400: { description: 'Invalid ride details', schema: validationErrorEnvelope },
      401: unauthorized,
    },
  }),
  createRide,
);
ridesRouter.patch(
  '/:rideId/cancel',
  requireAuth,
  validate({ params: rideIdParamsSchema }),
  cancelRide,
);
ridesRouter.patch(
  '/:rideId/status',
  requireAuth,
  documentedRoute({
    method: 'patch',
    path: '/rides/:rideId/status',
    tags: ['Rides'],
    summary: 'Change the status of your ride',
    secured: true,
    params: rideIdParamsSchema,
    body: updateRideStatusSchema,
    responses: {
      200: { description: 'Status changed', schema: successEnvelope(rideStatusResponseSchema) },
      400: { description: 'Unknown status, or malformed id', schema: validationErrorEnvelope },
      401: unauthorized,
      403: { description: 'Not the ride owner', schema: errorEnvelope },
      404: { description: 'No such ride', schema: errorEnvelope },
      409: {
        description: 'Ride already cancelled or completed, or the change is not allowed',
        schema: errorEnvelope,
      },
    },
  }),
  updateRideStatus,
);

ridesRouter.post(
  '/:rideId/requests',
  requireAuth,
  documentedRoute({
    method: 'post',
    path: '/rides/:rideId/requests',
    tags: ['Ride requests'],
    summary: 'Ask to join a ride',
    secured: true,
    params: rideIdParamsSchema,
    responses: {
      201: { description: 'Request submitted', schema: successEnvelope(rideRequestResponseSchema) },
      400: invalidParams,
      401: unauthorized,
      403: { description: 'The ride is your own', schema: errorEnvelope },
      404: { description: 'No such ride', schema: errorEnvelope },
      409: { description: 'Ride closed, or already requested', schema: errorEnvelope },
    },
  }),
  createRequest,
);

ridesRouter.get(
  '/:rideId/requests',
  requireAuth,
  documentedRoute({
    method: 'get',
    path: '/rides/:rideId/requests',
    tags: ['Ride requests'],
    summary: 'List the pending requests on your ride',
    secured: true,
    params: rideIdParamsSchema,
    responses: {
      200: {
        description: 'Pending requests',
        schema: successEnvelope(z.array(rideRequestSummarySchema)),
      },
      400: invalidParams,
      401: unauthorized,
      403: { description: 'Not the ride owner', schema: errorEnvelope },
      404: { description: 'No such ride', schema: errorEnvelope },
    },
  }),
  listRideRequests,
);

ridesRouter.patch(
  '/:rideId/requests/:requestId/accept',
  requireAuth,
  documentedRoute({
    method: 'patch',
    path: '/rides/:rideId/requests/:requestId/accept',
    tags: ['Ride requests'],
    summary: 'Accept a request and take a seat',
    secured: true,
    params: requestIdParamsSchema,
    responses: {
      200: { description: 'Request accepted', schema: successEnvelope(rideRequestDecisionSchema) },
      400: invalidParams,
      401: unauthorized,
      403: { description: 'Not the ride owner', schema: errorEnvelope },
      404: { description: 'No such ride or request', schema: errorEnvelope },
      409: { description: 'Already decided, or no seats left', schema: errorEnvelope },
    },
  }),
  acceptRequest,
);

ridesRouter.patch(
  '/:rideId/requests/:requestId/decline',
  requireAuth,
  documentedRoute({
    method: 'patch',
    path: '/rides/:rideId/requests/:requestId/decline',
    tags: ['Ride requests'],
    summary: 'Decline a request',
    secured: true,
    params: requestIdParamsSchema,
    responses: {
      200: { description: 'Request declined', schema: successEnvelope(rideRequestDecisionSchema) },
      400: invalidParams,
      401: unauthorized,
      403: { description: 'Not the ride owner', schema: errorEnvelope },
      404: { description: 'No such ride or request', schema: errorEnvelope },
      409: { description: 'Already decided', schema: errorEnvelope },
    },
  }),
  declineRequest,
);
