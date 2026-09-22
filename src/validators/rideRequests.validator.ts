import { z } from 'zod';

import { requestStatus } from '../db/schema';

export const rideIdParamsSchema = z.object({
  rideId: z.uuid('Invalid ride id.'),
});

export type RideIdParams = z.infer<typeof rideIdParamsSchema>;

export const requestIdParamsSchema = z.object({
  rideId: z.uuid('Invalid ride id.'),
  requestId: z.uuid('Invalid request id.'),
});

export type RequestIdParams = z.infer<typeof requestIdParamsSchema>;

export const rideRequestResponseSchema = z.object({
  id: z.uuid(),
  rideId: z.uuid(),
  passengerId: z.uuid(),
  status: z.enum(requestStatus.enumValues),
  createdAt: z.iso.datetime().nullable(),
});

/** A request as the driver sees it: the passenger is named, the ride implied by the URL. */
export const rideRequestSummarySchema = z.object({
  id: z.uuid(),
  passengerId: z.uuid(),
  passengerName: z.string(),
  status: z.enum(requestStatus.enumValues),
  createdAt: z.iso.datetime().nullable(),
});

/** What accepting or declining returns. Narrower than the create response: no `createdAt`. */
export const rideRequestDecisionSchema = z.object({
  id: z.uuid(),
  rideId: z.uuid(),
  passengerId: z.uuid(),
  status: z.enum(requestStatus.enumValues),
});
